import nacl from '../vendor/anproto/lib/nacl-fast-es.js'
nacl.setPRNG(bytes => crypto.getRandomValues(bytes))
import { test as nodeTest } from 'node:test'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const test = globalThis.Deno?.test || nodeTest
const temporaryDirectory = () => globalThis.Deno ? Deno.makeTempDir() : fs.mkdtemp(join(tmpdir(), 'wiredove-test-'))
import { an } from '../vendor/anproto/an.js'
import { createApplicationBackend } from '../application_backend.js'
import { createArtifactSession } from '../client/runtime/artifact-session.js'
const assert = (condition, message = 'Assertion failed') => { if (!condition) throw Error(message) }
const rejects = async operation => { let rejected = false; try { await operation() } catch { rejected = true } assert(rejected, 'Expected rejection') }
const signed = async content => { const signature = await an.sign(await an.hash(content), await an.gen()); return { id: await an.hash(signature), signature, content } }
test('application archive verifies, deduplicates concurrent retries and survives restart', async () => {
  const dataDir = await temporaryDirectory()
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
  } finally { await fs.rm(dataDir, { recursive: true }) }
})
test('artifact retry preserves exact bytes across restart, blocks another signature and rejects corrupt reads', async () => {
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

test('backend local save without relay confirmation retains exact outbox bytes', async () => {
  const keypair = await an.gen(), state = new Map(), blobs = new Map()
  const store = { get: key => state.get(key), set: (key, value) => state.set(key, value) }
  const protocol = { keypair: () => keypair, pubkey: () => keypair.slice(0,44), get: key => blobs.get(key), put: (key,value) => blobs.set(key,value), make: async value => blobs.set(await an.hash(value),value), add: async signature => blobs.set(await an.hash(signature),signature), getHashLog: () => [], getOpenedLog: () => [], createYaml: (meta,body) => JSON.stringify({ ...meta, body }) }
  let relayed = false
  const delivered = []
  const session = createArtifactSession({ protocol, store, endpoint: 'http://local/api/application', fetchImpl: async (_url, options) => {
    const record = JSON.parse(options.body); delivered.push(record)
    return Response.json({ id: record.id, saved: true, relayed })
  } })
  const result = await session.publish('Retain this exact signature')
  assert(!result.relayed && (await session.pending()).length === 1)
  relayed = true
  await session.retry()
  assert(delivered[0].signature === delivered[1].signature && delivered[0].content === delivered[1].content)
  assert((await session.pending()).length === 0)
})

test('historical image failures retry after archive cursor advances and notify mounted readers only with verified bytes', async () => {
  const source = 'data:image/png;base64,AAAA', hash = await an.hash(source)
  const record = await signed(JSON.stringify({ image: hash, body: `![](${hash})` }))
  const blobs = new Map(), received = [], cursors = []
  const protocol = { get: key => blobs.get(key), put: (key,value) => blobs.set(key,value), make: async value => blobs.set(await an.hash(value),value), add: async signature => blobs.set(await an.hash(signature),signature), parseYaml: JSON.parse, getHashLog: () => [], getOpenedLog: () => [] }
  let attempts = 0
  const session = createArtifactSession({ protocol, store: {}, endpoint: 'http://local/api/application', legacyImageURL: 'http://local/api/image', receive: value => received.push(value), fetchImpl: async value => {
    const url = new URL(value)
    if (url.pathname === '/api/image') {
      attempts++
      if (attempts === 1) return new Response(null, { status: 503 })
      return Response.json({ source: attempts === 2 ? source + 'tampered' : source })
    }
    const after = Number(url.searchParams.get('after')); cursors.push(after)
    return Response.json({ scope: 'backend-archive', records: after === 0 ? [record] : [], cursor: 1, more: false })
  } })
  await session.pull()
  assert(attempts === 1 && !blobs.has(hash))
  await session.pull()
  assert(attempts === 2 && !blobs.has(hash), 'Tampered image was accepted')
  await session.pull()
  assert(blobs.get(hash) === source && received.includes(source), 'Mounted reader was not notified')
  await session.pull()
  assert(attempts === 3, 'Cached image fetched again')
  assert(JSON.stringify(cursors) === '[0,1,1,1]', 'Image retry rewound the archive')
})
