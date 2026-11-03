import nacl from '../vendor/anproto/lib/nacl-fast-es.js'
nacl.setPRNG(bytes => crypto.getRandomValues(bytes))
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { an } from '../vendor/anproto/an.js'
import { yaml } from '../vendor/apds/yaml.js'
import { createNotificationsService } from '../notifications_server.js'
import { createAndFS } from '../vendor/andfs/andfs.js'
import { memoryStore } from '../vendor/andfs/stores.js'
import { createAndFSMediaClient, readAndFSMedia } from '../client/andfs.js'

const repository = resolve(import.meta.dirname, '..')
const fixture = async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'wiredove-server-'))
  const data = join(root, 'private-state')
  await fs.mkdir(data)
  for (const name of ['index.html', 'client/test.js', 'dist/app-v1/app-embed.js', 'style.css']) {
    await fs.mkdir(resolve(root, name, '..'), { recursive: true })
    await fs.writeFile(join(root, name), name.endsWith('.html') ? '<!doctype html><title>Wiredove</title>' : '/* fixture */')
  }
  const env = { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: data, VAPID_CONFIG_PATH: join(data, 'vapid.json') }
  return { root, data, env, close: () => fs.rm(root, { recursive: true, force: true }) }
}

async function start(f, runtime = 'node') {
  const executable = runtime === 'node' ? process.execPath : process.env.DENO_EXECUTABLE || 'deno'
  const args = runtime === 'node' ? [join(repository, 'serve-node.js')] : ['run', ...(process.env.DENO_NODE_MODULES === 'manual' ? ['--node-modules-dir=manual'] : []), ...(process.env.DENO_CACHED_ONLY === '1' ? ['--cached-only'] : []), '--allow-net', '--allow-read', '--allow-write', '--allow-env', join(repository, 'serve.js')]
  const child = spawn(executable, args, { cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  const origin = await new Promise((resolveOrigin, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Server startup timed out: ' + logs)) }, 30000)
    const read = bytes => {
      logs += bytes
      const match = /127\.0\.0\.1:(\d+)/.exec(logs)
      if (match) { clearTimeout(timer); resolveOrigin(`http://127.0.0.1:${match[1]}`) }
    }
    child.stdout.on('data', read); child.stderr.on('data', read)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}: ${logs}`)) })
  })
  return { origin, async stop() {
    const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited
  } }
}

test('Node HTTP routes, signatures, media, notifications and disk restart', async t => {
  const f = await fixture()
  let server
  const key = await an.gen()
  const content = await yaml.create({ name: 'Ev fixture', links: ['https://example.test'] }, 'Original body — unchanged')
  const signature = await an.sign(await an.hash(content), key)
  const record = { id: await an.hash(signature), signature, content }
  const upstream = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(req.url.startsWith('/gossip/poll') ? JSON.stringify({ messages: [content, signature], nextSince: 123 }) : JSON.stringify([key.slice(0, 44)]))
  })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  f.env.FEED_ROWS_UPSTREAM = `http://127.0.0.1:${upstream.address().port}`
  try {
    server = await start(f)
    const get = (path, init) => fetch(server.origin + path, init)
    await t.test('static MIME, HEAD, conditional reads, ranges, CORS and private paths', async () => {
      const response = await get('/')
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/)
      const text = await response.text()
      const head = await get('/', { method: 'HEAD' })
      assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(text))); assert.equal(await head.text(), '')
      assert.equal((await get('/', { headers: { 'if-none-match': response.headers.get('etag') } })).status, 304)
      const partial = await get('/', { headers: { range: 'bytes=0-3' } }); assert.equal(partial.status, 206); assert.equal(await partial.text(), text.slice(0, 4))
      assert.equal((await get('/', { headers: { range: 'bytes=99999-' } })).status, 416)
      for (const path of ['/client/test.js', '/dist/app-v1/app-embed.js', '/style.css']) assert.equal((await get(path)).headers.get('access-control-allow-origin'), '*')
      await fs.symlink(f.env.VAPID_CONFIG_PATH, join(f.root, 'leaked.json'))
      for (const path of ['/config.json', '/private-state/vapid.json', '/leaked.json', '/.git/config', '/%2egit/config', '/data%2Fsubscriptions.json', '/node_modules/web-push/package.json', '/missing']) assert.equal((await get(path)).status, 404, path)
      assert.equal((await get('/%ZZ')).status, 400)
      assert.equal((await get('/', { method: 'POST' })).status, 405)
    })
    await t.test('verified archive preserves exact bytes and rejects changed content', async () => {
      const post = value => get('/api/application', { method: 'POST', body: JSON.stringify(value) })
      assert.equal((await post({ ...record, content: 'changed' })).status, 400)
      assert.equal((await post(record)).status, 200); assert.equal((await post(record)).status, 200)
      assert.deepEqual((await (await get('/api/application')).json()).records, [record])
      const tooLarge = await get('/api/application', { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1) })
      assert.equal(tooLarge.status, 413)
      const streamed = await get('/api/application', { method: 'POST', duplex: 'half', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); c.close() } }) })
      assert.equal(streamed.status, 413)
      // An actual interrupted client must not persist partial JSON or poison
      // the next connection; no public transport is involved.
      const aborted = httpRequest(server.origin + '/api/application', { method: 'POST', headers: { 'content-length': '100' } })
      aborted.on('error', () => {})
      const closed = once(aborted, 'close').catch(() => {})
      aborted.write('{'); aborted.destroy(); await closed
      assert.deepEqual((await (await get('/api/application')).json()).records, [record])
    })
    let attachment, original
    await t.test('signed media upload, verified download, range, HEAD and invalid upload', async () => {
      original = Uint8Array.from({ length: 300000 }, (_, i) => i % 251)
      const client = createAndFSMediaClient({ files: createAndFS({ store: memoryStore() }), origin: () => server.origin, fetchImpl: (url, init) => fetch(new URL(url, server.origin), init), signPayload: async value => an.sign(await an.hash(value), key) })
      attachment = await client.upload(new File([original], 'fixture.png', { type: 'image/png' }))
      assert.deepEqual(await readAndFSMedia(attachment, { store: memoryStore(), fetchImpl: fetch }), original)
      const range = await get('/media/' + attachment.andfs, { headers: { range: 'bytes=262130-262170' } })
      assert.equal(range.status, 206); assert.deepEqual(new Uint8Array(await range.arrayBuffer()), original.slice(262130, 262171))
      assert.equal((await get('/media/' + attachment.andfs, { method: 'HEAD' })).headers.get('content-length'), String(original.length))
      assert.equal((await get('/api/media', { method: 'POST', body: original })).status, 400)
    })
    const blobID = 'anblob:v1:raw:sha256:legacy-fixture'
    await t.test('historical blob PUT/GET/HEAD and invalid IDs', async () => {
      const path = '/blobs/' + encodeURIComponent(blobID)
      assert.equal((await get(path, { method: 'PUT', body: 'historical bytes' })).status, 204)
      const response = await get(path); assert.equal(await response.text(), 'historical bytes'); assert.equal(response.headers.get('access-control-allow-origin'), '*')
      assert.equal((await get(path, { method: 'HEAD' })).headers.get('content-length'), '16')
      assert.equal((await get('/blobs/invalid')).status, 400)
      assert.equal((await get(path, { method: 'POST' })).status, 405)
    })
    const publicKey = (await (await get('/vapid-public-key')).json()).key
    const configBytes = await fs.readFile(f.env.VAPID_CONFIG_PATH)
    await t.test('subscription persistence, feed rows and no-recipient push', async () => {
      const subscription = { endpoint: 'https://example.invalid/disposable', keys: { p256dh: 'fixture', auth: 'fixture' } }
      for (let i = 0; i < 2; i++) assert.equal((await get('/subscribe', { method: 'POST', body: JSON.stringify(subscription) })).status, 200)
      assert.equal(JSON.parse(await fs.readFile(join(f.data, 'subscriptions.json'), 'utf8')).length, 1)
      assert.equal((await get('/unsubscribe', { method: 'POST', body: JSON.stringify(subscription) })).status, 200)
      assert.deepEqual(await (await get('/push-now', { method: 'POST', body: JSON.stringify({ hash: record.id, text: content }) })).json(), { sent: false, reason: 'no subscriptions' })
      for (const path of ['/feed-rows/home', '/feed-rows/author/' + encodeURIComponent(key.slice(0, 44)), '/feed-rows/alias/test']) {
        const data = await (await get(path)).json()
        assert.equal(data.rows[0].hash, record.id); assert.equal(data.rows[0].preview, 'Original body — unchanged'); assert.equal(data.nextSince, 123)
      }
    })
    await server.stop(); server = null
    // Deno is optional for Node-only installs; CI explicitly enables parity.
    const runtimes = process.env.TEST_DENO_PARITY === '1' ? ['deno', 'node'] : ['node']
    const expectedRecords = [record]
    for (const runtime of runtimes) {
      await t.test(`${runtime} restart reads identical keys, archive, media and legacy blobs`, async () => {
        server = await start(f, runtime)
        assert.equal((await (await get('/vapid-public-key')).json()).key, publicKey)
        assert.deepEqual(await fs.readFile(f.env.VAPID_CONFIG_PATH), configBytes)
        assert.deepEqual((await (await get('/api/application')).json()).records, expectedRecords)
        assert.deepEqual(new Uint8Array(await (await get('/media/' + attachment.andfs)).arrayBuffer()), original)
        assert.equal(await (await get('/blobs/' + encodeURIComponent(blobID))).text(), 'historical bytes')
        assert.deepEqual(JSON.parse(await fs.readFile(join(f.data, 'state.json'), 'utf8')), { lastSeenId: record.id })
        if (runtime === 'deno') {
          const content = await yaml.create({ name: 'Deno fixture' }, 'Written through the Deno listener')
          const signature = await an.sign(await an.hash(content), key)
          const next = { id: await an.hash(signature), signature, content }
          assert.equal((await get('/api/application', { method: 'POST', body: JSON.stringify(next) })).status, 200)
          expectedRecords.push(next)
          assert.equal((await get('/blobs/' + encodeURIComponent(blobID), { method: 'PUT', body: 'historical bytes' })).status, 204)
        }
        await server.stop(); server = null
      })
    }
  } finally {
    await server?.stop(); await new Promise(resolve => upstream.close(resolve)); await f.close()
  }
})

test('push payload and expired subscription pruning use injected delivery only', async () => {
  const f = await fixture(), sent = []
  try {
    const webpush = {
      generateVAPIDKeys: () => ({ publicKey: 'fixture-public', privateKey: 'fixture-private' }), setVapidDetails() {},
      async sendNotification(subscription, payload) { sent.push(JSON.parse(payload)); const error = Error('expired'); error.statusCode = 410; throw error },
    }
    const service = await createNotificationsService({ dataDir: f.data, subsFile: join(f.data, 'subscriptions.json'), stateFile: join(f.data, 'state.json'), configFile: f.env.VAPID_CONFIG_PATH, webpush })
    const request = (path, body) => service.handleRequest(new Request('http://local' + path, { method: 'POST', body: JSON.stringify(body) }))
    await request('/subscribe', { endpoint: 'https://example.invalid/expired', keys: { p256dh: 'fixture', auth: 'fixture' } })
    await request('/push-now', { hash: 'fixture', text: await yaml.create({ name: 'Fixture' }, 'A message') })
    assert.equal(sent[0].title, 'Fixture'); assert.equal(sent[0].body, 'A message')
    assert.deepEqual(JSON.parse(await fs.readFile(join(f.data, 'subscriptions.json'), 'utf8')), [])
    await fs.writeFile(f.env.VAPID_CONFIG_PATH, '{invalid')
    await assert.rejects(createNotificationsService({ dataDir: f.data, configFile: f.env.VAPID_CONFIG_PATH, webpush }))
    assert.equal(await fs.readFile(f.env.VAPID_CONFIG_PATH, 'utf8'), '{invalid')
  } finally { await f.close() }
})
