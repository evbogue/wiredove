import { an } from '../../vendor/anproto/an.js'

// Transport and storage contracts contain exact signed artifacts. All untrusted
// backend records are checked before reaching APDS or a renderer.
export const createArtifactSession = ({ protocol, store, endpoint, fetchImpl = fetch, receive = async () => {} }) => {
  const listeners = new Set()
  const changed = () => { for (const listener of listeners) listener() }
  let cursor = 0
  let pulling
  let stopped = false
  let lastError = null
  let controller = new AbortController()
  const request = async (url, options = {}) => {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
    if (!response.ok) throw Error(`Application backend unavailable (${response.status})`)
    return await response.json()
  }
  const verify = async record => {
    if (!record || typeof record.signature !== 'string' || typeof record.content !== 'string' || record.signature.length > 512 || record.content.length > 2 * 1024 * 1024) throw Error('Invalid artifact')
    const opened = await an.open(record.signature)
    if (!/^\d{13}/.test(opened) || opened.substring(13) !== await an.hash(record.content) || record.id !== await an.hash(record.signature)) throw Error('Artifact verification failed')
    return record
  }
  const flush = async () => {
    await protocol.put('hashlog', JSON.stringify(await protocol.getHashLog()))
    await protocol.put('openedlog', JSON.stringify(await protocol.getOpenedLog()))
  }
  const ingest = async record => {
    await verify(record)
    if (stopped) throw Error('Application session stopped')
    const existing = await protocol.get(record.id)
    await protocol.make(record.content)
    await protocol.add(record.signature)
    await flush()
    if (!existing) {
      await receive(record.signature)
      changed()
    }
  }
  const pending = async () => await store.get('outbox') || []
  const deliver = async record => {
    await ingest(record)
    const saved = await request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) })
    if (!saved.saved || saved.id !== record.id) throw Error('Backend did not confirm the exact artifact')
    await store.set('outbox', (await pending()).filter(item => item.id !== record.id))
    return { ...record, saved: true, relayed: true }
  }
  return {
    pending, flush,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    get error() { return lastError },
    async publish(body, metadata = {}) {
      if ((await pending()).length) throw Error('Retry the pending publication before signing another post.')
      const keypair = await protocol.keypair()
      if (!keypair) throw Error('Create or import an identity first.')
      const author = keypair.substring(0,44)
      const history = (await protocol.query?.(author) || []).slice().sort((a,b) => Number(b.ts) - Number(a.ts))
      const inherited = {}
      for (const row of history) {
        const parsed = await protocol.parseYaml(row.text || '')
        for (const field of ['bio', 'links', 'image_original', 'image_crop']) if (!(field in inherited) && Object.hasOwn(parsed || {}, field)) inherited[field] = parsed[field]
      }
      let previous = await protocol.get('previous')
      if (previous && (await protocol.get(previous))?.substring(0,44) !== author) previous = null
      previous ||= history[0]?.hash
      const name = await protocol.get('name'), image = await protocol.get('image')
      const content = await protocol.createYaml({ ...inherited, ...(name ? { name } : {}), ...(image ? { image } : {}), ...metadata, ...(previous ? { previous } : {}) }, body)
      const signature = await an.sign(await an.hash(content), keypair)
      const record = { id: await an.hash(signature), signature, content }
      // The outbox is durable before author-chain state, ingestion or delivery.
      await store.set('outbox', [record])
      await protocol.put('previous', record.id)
      try { return await deliver(record) }
      catch (error) { return { ...record, saved: true, relayed: false, error: error.message } }
    },
    async recover() {
      for (const record of await pending()) {
        await verify(record)
        if (record.signature.substring(0,44) !== await protocol.pubkey()) throw Error('Pending artifact belongs to another identity')
        await protocol.put('previous', record.id)
        await ingest(record)
      }
    },
    async retry() {
      const results = []
      for (const record of await pending()) {
        await verify(record)
        if (record.signature.substring(0,44) !== await protocol.pubkey()) throw Error('Pending artifact belongs to another identity')
        await protocol.put('previous', record.id)
        results.push(await deliver(record))
      }
      return results
    },
    pull() {
      if (pulling) return pulling
      pulling = (async () => {
        let more = true
        while (more && !stopped) {
          const url = new URL(endpoint); url.searchParams.set('after', cursor)
          const page = await request(url)
          if (page.scope !== 'backend-archive' || !Array.isArray(page.records) || page.records.length > 100 || !Number.isInteger(page.cursor) || page.cursor < cursor || (page.more && page.cursor <= cursor)) throw Error('Unsupported backend response')
          for (const record of page.records) { if (stopped) return; await ingest(record) }
          cursor = page.cursor; more = page.more === true
          lastError = null
        }
      })().catch(error => { lastError = error.message; throw error }).finally(() => { pulling = null })
      return pulling
    },
    async stop() { stopped = true; controller.abort(); await pulling?.catch(() => {}) },
    start() { stopped = false; controller = new AbortController() },
  }
}
