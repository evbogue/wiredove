import { an } from '../../vendor/anproto/an.js'

// Transport and storage contracts contain exact signed artifacts. All untrusted
// backend records are checked before reaching APDS or a renderer.
export const createArtifactSession = ({ protocol, store, endpoint, anbotSocial = false, legacyImageURL = null, fetchImpl = fetch, receive = async () => {} }) => {
  const listeners = new Set()
  const changed = () => { for (const listener of listeners) listener() }
  const missingImages = new Map()
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
    if (legacyImageURL || anbotSocial) {
      const parsed = await protocol.parseYaml(record.content)
      const hashes = new Set([parsed?.image, ...[...(parsed?.body || '').matchAll(/!\[[^\]]*\]\(([A-Za-z0-9+/]{43}=)\)/g)].map(match => match[1])].filter(value => /^[A-Za-z0-9+/]{43}=$/.test(value || '')))
      for (const hash of hashes) if (!await protocol.get(hash)) missingImages.set(hash, record.id)
    }
    await protocol.add(record.signature)
    await flush()
    if (!existing) {
      await receive(record.signature)
      changed()
    }
  }
  // Image availability is independent of the archive cursor. Failed requests
  // stay queued for a later refresh, including otherwise empty archive pages.
  const retryImages = async () => {
    await Promise.all([...missingImages].slice(0, 8).map(async ([hash, post]) => {
      if (stopped) return
      try {
        if (!await protocol.get(hash)) {
          let source
          if (legacyImageURL) {
            const url = new URL(legacyImageURL)
            url.searchParams.set('hash', hash)
            source = (await request(url)).source
          } else {
            const url = new URL('/wiredove/image', endpoint)
            url.search = new URLSearchParams({ id: post, hash })
            const response = await fetchImpl(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
            const mime = response.headers.get('content-type')
            if (!response.ok || !/^image\/(png|jpeg|gif|webp)$/.test(mime)) throw Error('Historical image unavailable')
            const bytes = new Uint8Array(await response.arrayBuffer())
            if (bytes.length > 8 * 1024 * 1024) throw Error('Historical image is too large')
            const chunks = []
            for (let index = 0; index < bytes.length; index += 8192) {
              chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)))
            }
            source = `data:${mime};base64,${btoa(chunks.join(''))}`
          }
          if (typeof source !== 'string' || !source.startsWith('data:image/') || await an.hash(source) !== hash) throw Error('Historical image verification failed')
          if (stopped) return
          await protocol.make(source)
          await receive(source)
          changed()
        }
        missingImages.delete(hash)
      } catch {
        // Rotate failures so an unavailable image cannot starve later images.
        missingImages.delete(hash); missingImages.set(hash, post)
      }
    }))
  }
  const pending = async () => await store.get('outbox') || []
  const deliver = async record => {
    await ingest(record)
    let destination = endpoint
    if (anbotSocial) {
      const { body } = await protocol.parseYaml(record.content)
      destination = new URL(body.trim() ? '/posts' : '/profiles', endpoint)
    }
    const saved = await request(destination, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) })
    if (!(anbotSocial ? saved.status === 'published' : saved.saved) || saved.id !== record.id) throw Error('Backend did not confirm the exact artifact')
    if (saved.relayed === false) throw Error(saved.relayError || 'Saved on this backend; relay confirmation pending. Retry pending publication.')
    await store.set('outbox', (await pending()).filter(item => item.id !== record.id))
    return { ...record, saved: true, relayed: true }
  }
  return {
    pending, flush, ingest,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    get error() { return lastError },
    async publish(body, metadata = {}) {
      if ((await pending()).length) throw Error('Retry the pending publication before signing another post.')
      const keypair = await protocol.keypair()
      if (!keypair) throw Error('Create or import an identity first.')
      const author = keypair.substring(0,44)
      const history = (await protocol.query?.(author) || []).slice().sort((a,b) => Number(b.ts) - Number(a.ts))
      const inherited = {}
      const candidates = []
      for (const row of history) {
        const parsed = await protocol.parseYaml(row.text || '')
        if (anbotSocial && row.author === author && typeof parsed?.body === 'string'
            && !(typeof parsed.type === 'string' && parsed.type.startsWith('git-'))) candidates.push({ row, previous: parsed.previous })
        for (const field of ['bio', 'links', 'image_original', 'image_crop']) if (!(field in inherited) && Object.hasOwn(parsed || {}, field)) inherited[field] = parsed[field]
      }
      const referenced = new Set(candidates.map(item => item.previous))
      const tip = candidates.filter(item => !referenced.has(item.row.hash))
        .sort((a, b) => Number(b.row.ts) - Number(a.row.ts) || (a.row.hash < b.row.hash ? -1 : 1))[0]
      let previous = tip?.row.hash || await protocol.get('previous')
      if (previous && (await protocol.get(previous))?.substring(0,44) !== author) previous = null
      if (!anbotSocial) previous ||= history[0]?.hash
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
          if (anbotSocial) {
            const url = new URL('/gossip/poll', endpoint)
            url.searchParams.set('since', cursor)
            const { messages, nextSince } = await request(url)
            if (!Array.isArray(messages) || messages.length > 512 || messages.length % 2
                || !Number.isSafeInteger(nextSince) || nextSince < cursor
                || (messages.length && nextSince === cursor)) throw Error('Unsupported ANBot poll response')
            for (let index = 0; index < messages.length; index += 2) {
              if (stopped) return
              const [signature, content] = [messages[index], messages[index + 1]]
              if (typeof signature !== 'string' || typeof content !== 'string') throw Error('Invalid ANBot artifact pair')
              await ingest({ id: await an.hash(signature), signature, content })
            }
            cursor = nextSince
            more = messages.length > 0
            lastError = null
            continue
          }
          const url = new URL(endpoint); url.searchParams.set('after', cursor)
          const page = await request(url)
          if (page.scope !== 'backend-archive' || !Array.isArray(page.records) || page.records.length > 100 || !Number.isInteger(page.cursor) || page.cursor < cursor || (page.more && page.cursor <= cursor)) throw Error('Unsupported backend response')
          for (const record of page.records) { if (stopped) return; await ingest(record) }
          cursor = page.cursor; more = page.more === true
          lastError = null
        }
        if (!stopped && (legacyImageURL || anbotSocial)) await retryImages()
      })().catch(error => { lastError = error.message; throw error }).finally(() => { pulling = null })
      return pulling
    },
    async stop() { stopped = true; controller.abort(); await pulling?.catch(() => {}) },
    start() { stopped = false; controller = new AbortController() },
  }
}
