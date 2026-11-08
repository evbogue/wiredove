// Disposable recovery nodes. /api/image is a TEST-ONLY companion-store adapter;
// Wiredove's production handler does not persist or serve raw APDS image blobs.
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { buildRecoveryFixtures } from './build-recovery-fixtures.mjs'
import { ingestRecoveryFixtures } from './ingest-recovery-fixtures.mjs'
import { assertRecoveryIntegrity } from './assert-recovery-integrity.mjs'
import { createWiredoveHandler } from '../../server/handler.js'
import { createNodeServer } from '../../server/node-http.js'

const repository = path.resolve(import.meta.dirname, '../..')

export async function createRecoveryExercise() {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'wiredove-recovery-'))
  const fixtures = path.join(directory, 'fixtures')
  const nodes = new Set()
  const start = async name => {
    const data = path.join(directory, name, 'data')
    const images = path.join(data, 'recovery-apds-images')
    const handler = await createWiredoveHandler({ root: repository, env: {
      DATA_DIR: data, VAPID_CONFIG_PATH: path.join(directory, name, 'config.json'),
    }, notificationsOptions: { sendNotification: async () => { throw Error('Recovery must not send notifications') } } })
    const server = createNodeServer(async request => {
      const url = new URL(request.url)
      if (url.pathname === '/__recovery') return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recovery fixture</title>', { headers: { 'content-type': 'text/html' } })
      if (url.pathname === '/api/image') {
        const hash = url.searchParams.get('hash')
        const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
        if (!/^[A-Za-z0-9+/]{43}=$/.test(hash || '')) return Response.json({ error: 'Invalid hash' }, { status: 400, headers })
        try {
          const source = await fs.readFile(path.join(images, encodeURIComponent(hash) + '.dataurl'), 'utf8')
          return Response.json({ source }, { headers })
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
          return Response.json({ error: 'Missing image' }, { status: 404, headers })
        }
      }
      // Keep this fixture server from proxying feed/alias reads upstream.
      if ((url.pathname.startsWith('/api/') && !['/api/application', '/api/media'].includes(url.pathname)) ||
          (!['GET', 'HEAD'].includes(request.method) && url.pathname !== '/api/application' &&
           !url.pathname.startsWith('/blobs/'))) return new Response(null, { status: 403 })
      return handler(request)
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const origin = `http://127.0.0.1:${server.address().port}`
    const node = { origin, data, images, async stop() {
      if (!nodes.delete(node)) return
      await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() })
    } }
    nodes.add(node)
    return node
  }
  const close = async () => {
    await Promise.all([...nodes].map(node => node.stop()))
    await fs.rm(directory, { recursive: true, force: true })
  }
  try {
    const inventory = await buildRecoveryFixtures(fixtures)
    const a = await start('a')
    await ingestRecoveryFixtures({ fixtures, ...a })
    const aOrigin = a.origin
    await a.stop()
    const bData = path.join(directory, 'b/data')
    await fs.mkdir(bData, { recursive: true })
    for (const name of ['application', 'andfs', 'media', 'blobs', 'recovery-apds-images']) {
      await fs.cp(path.join(a.data, name), path.join(bData, name), { recursive: true })
    }
    const b = await start('b')
    const imageFile = path.join(b.images, encodeURIComponent(inventory.media.apds_image.hash) + '.dataurl')
    return { directory, b, aOrigin, inventory, imageFile, close, async assertIntegrity({ imageURL = b.origin + '/api/image' } = {}) {
      return assertRecoveryIntegrity({ aOrigin, ...b, fixtures, inventory, imageURL })
    } }
  } catch (error) { await close(); throw error }
}
