import { an } from '../vendor/anproto/an.js'
import { createApplicationBackend } from '../application_backend.js'
import { createArtifactSession } from '../client/runtime/artifact-session.js'
const assert = (condition, message = 'Assertion failed') => { if (!condition) throw Error(message) }
const rejects = async operation => { let rejected = false; try { await operation() } catch { rejected = true } assert(rejected, 'Expected rejection') }
const signed = async content => { const signature = await an.sign(await an.hash(content), await an.gen()); return { id: await an.hash(signature), signature, content } }
Deno.test('application archive verifies, deduplicates concurrent retries and survives restart', async () => {
  const dataDir = await Deno.makeTempDir()
  try {
    let backend = await createApplicationBackend({ dataDir })
    const record = await signed('signed archive fixture')
    const post = value => backend.handleRequest(new Request('http://local/api/application', { method: 'POST', body: JSON.stringify(value) }))
    assert((await post({ ...record, content: 'tampered' })).status === 400)
    assert((await post({ ...record, signature: 'invalid' })).status === 400)
    const responses = await Promise.all([post(record), post(record)])
    assert(responses.every(response => response.status === 200))
    backend = await createApplicationBackend({ dataDir })
    const page = await (await backend.handleRequest(new Request('http://local/api/application'))).json()
    assert(page.records.length === 1 && page.records[0].signature === record.signature)
    assert(page.scope === 'backend-archive' && page.cursor === 1 && !page.more)
  } finally { await Deno.remove(dataDir, { recursive: true }) }
})
Deno.test('artifact retry preserves exact bytes across restart, blocks another signature and rejects corrupt reads', async () => {
  const keypair = await an.gen(), state = new Map(), blobs = new Map(), received = []
  const store = { get: key => state.get(key), set: (key, value) => state.set(key, structuredClone(value)) }
  const protocol = { keypair: () => keypair, pubkey: () => keypair.slice(0,44), get: key => blobs.get(key), put: (key,value) => blobs.set(key,value), make: async value => blobs.set(await an.hash(value),value), add: async signature => blobs.set(await an.hash(signature),signature), getHashLog: () => [], getOpenedLog: () => [], createYaml: (metadata,body) => JSON.stringify({ ...metadata, body }) }
  let available = false, failStorage = false
  const writes = []
  const fetchImpl = async (_url, options) => {
    if (options.method === 'POST') {
      if (!available) return new Response(null,{status:503})
      const record = JSON.parse(options.body); writes.push(record)
      return Response.json({ id: record.id, saved: true })
    }
    return Response.json({ scope: 'backend-archive', records: received, cursor: received.length, more: false })
  }
  const create = () => createArtifactSession({ protocol, store: { ...store, set: (...args) => { if (failStorage) throw Error('disk full'); return store.set(...args) } }, endpoint: 'http://local/api/application', fetchImpl })
  let session = create()
  failStorage = true
  await rejects(() => session.publish('must remain a draft'))
  assert(!state.has('outbox') && !blobs.has('previous'))
  failStorage = false
  const result = await session.publish('exact pending bytes')
  assert(result.saved && !result.relayed && (await session.pending()).length === 1)
  await rejects(() => session.publish('must not sign twice'))
  await session.stop(); session = create(); available = true
  await session.retry()
  assert(writes.length === 1 && writes[0].signature === result.signature && writes[0].content === result.content)
  assert(!(await session.pending()).length)
  let changes = 0
  const unsubscribe = session.subscribe(() => { changes++ })
  const untrusted = await signed('untrusted content')
  received.push({ ...untrusted, content: 'tampered' })
  await rejects(() => session.pull())
  assert(!blobs.has(untrusted.id) && session.error && changes === 0)
  received[0] = untrusted
  await session.pull()
  assert(changes === 1 && blobs.has(untrusted.id))
  await session.pull()
  assert(changes === 1, 'Duplicate retrieval must not notify again')
  unsubscribe()
  received.push(await signed('after disposal'))
  await session.pull()
  assert(changes === 1, 'Unsubscribed listener was retained')
})
