import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWiredoveHandler } from './server/handler.js'
import { createNodeServer } from './server/node-http.js'
import { createStaticHandler } from './server/static.js'

const project = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(project, 'shadcn-preview/dist')
const { DATA_DIR, HOST = '127.0.0.1', PORT = '8793' } = process.env

if (!DATA_DIR) throw new Error('Set DATA_DIR to a dedicated preview state directory')
await access(resolve(root, 'index.html'))
const backend = await createWiredoveHandler({
  root,
  env: { ...process.env, DATA_DIR: resolve(DATA_DIR), VAPID_CONFIG_PATH: resolve(DATA_DIR, 'vapid.json') },
})
const shareAssets = createStaticHandler({ root: project })
const shareAssetPaths = new Set(['/public-share.css', '/wiredove-share-bird.png'])
const apiPaths = new Set(['/api/application', '/api/media', '/api/share'])
const notificationWrites = new Set(['/api/notifications/subscribe', '/api/notifications/unsubscribe'])
const previewFiles = new Set(['/', '/index.html', '/post-notifications.js', '/vapid-public-key', '/manifest.webmanifest', '/dove512x512.png'])
const readPaths = /^(?:\/(?:blobs|media)\/.+|\/api\/(?:public-record|git\/.+)|\/sync\/status|\/[A-Za-z0-9_-]{8,43})$/

const server = createNodeServer(async request => {
  const { pathname } = new URL(request.url)
  const read = request.method === 'GET' || request.method === 'HEAD'
  if (shareAssetPaths.has(pathname)) return shareAssets(request)
  if ((request.method === 'POST' && notificationWrites.has(pathname)) || apiPaths.has(pathname) || (read && readPaths.test(pathname))
      || (read && (previewFiles.has(pathname) || pathname.startsWith('/assets/')))) {
    return backend(request)
  }
  return new Response(null, { status: 404 })
})

server.listen(Number(PORT), HOST, () => {
  console.log(`Wiredove preview listening on ${HOST}:${PORT}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(error => { process.exitCode = error ? 1 : 0 })
  setTimeout(() => server.closeAllConnections(), 5000).unref()
})
