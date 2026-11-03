import * as fs from 'node:fs/promises'
import { env as processEnv, cwd } from 'node:process'
import { resolve } from 'node:path'
import { createNotificationsService } from '../notifications_server.js'
import { createAndFsMediaService } from '../andfs_media_server.js'
import { createApplicationBackend } from '../application_backend.js'
import { createStaticHandler } from './static.js'

// Both listeners use this exact route graph and on-disk formats.
export async function createWiredoveHandler({ env = processEnv, root = cwd(), notificationsOptions = {} } = {}) {
  root = await fs.realpath(root)
  const dataDir = resolve(root, env.DATA_DIR || './data')
  const applicationDir = resolve(root, env.APPLICATION_DATA_DIR || `${dataDir}/application`)
  const blobDir = resolve(root, env.BLOB_DIR || `${dataDir}/blobs`)
  const mediaDir = resolve(root, env.MEDIA_DATA_DIR || dataDir)
  const configFile = resolve(root, env.VAPID_CONFIG_PATH || './config.json')
  const application = await createApplicationBackend({ dataDir: applicationDir })
  const notifications = await createNotificationsService({
    dataDir, subsFile: `${dataDir}/subscriptions.json`, stateFile: `${dataDir}/state.json`, configFile,
    vapidSubject: env.VAPID_SUBJECT, pushIconUrl: env.PUSH_ICON_URL, feedRowsUpstream: env.FEED_ROWS_UPSTREAM,
    ...notificationsOptions,
  })
  const media = await createAndFsMediaService({ dataDir: mediaDir,
    maxMediaBytes: Number(env.MEDIA_MAX_BYTES || 32 * 1024 * 1024),
    quotaBytes: Number(env.MEDIA_QUOTA_BYTES || 1024 * 1024 * 1024) })
  await fs.mkdir(blobDir, { recursive: true })
  const privatePaths = [dataDir, applicationDir, blobDir, mediaDir, configFile]
  // A configured data directory may itself be a symlink within the checkout.
  privatePaths.push(...await Promise.all(privatePaths.map(path => fs.realpath(path).catch(() => path))))
  const staticFiles = createStaticHandler({ root, privatePaths })
  const legacyBlob = async request => {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/blobs/')) return null
    let id
    try { id = decodeURIComponent(url.pathname.slice('/blobs/'.length)) }
    catch { return new Response('bad blob id', { status: 400 }) }
    if (!/^anblob:v1:(raw|chunked):sha256:[A-Za-z0-9_-]+$/.test(id)) return new Response('bad blob id', { status: 400 })
    const file = `${blobDir}/${encodeURIComponent(id)}`
    if (request.method === 'PUT') {
      const bytes = new Uint8Array(await request.arrayBuffer())
      const temp = `${file}.${crypto.randomUUID()}.tmp`
      try { await fs.writeFile(temp, bytes); await fs.rename(temp, file) }
      finally { await fs.unlink(temp).catch(() => {}) }
      return new Response(null, { status: 204 })
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD, PUT' } })
    try {
      const stat = await fs.stat(file)
      return new Response(request.method === 'HEAD' ? null : await fs.readFile(file), { headers: {
        'access-control-allow-origin': '*', 'content-type': 'application/octet-stream', 'content-length': String(stat.size), 'cache-control': 'public, max-age=31536000, immutable' } })
    } catch (error) { if (error.code === 'ENOENT') return new Response(null, { status: 404 }); throw error }
  }
  return async request => {
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url).pathname) }
    catch { return new Response(null, { status: 400 }) }
    if (/^\/(?:data(?:\/|$)|config\.json$|\.git(?:\/|$))/.test(pathname)) return new Response(null, { status: 404 })
    for (const service of [application.handleRequest, media.handleRequest, legacyBlob, notifications.handleRequest]) {
      const response = await service(request)
      if (response) return response
    }
    const response = await staticFiles(request)
    if (pathname.startsWith('/dist/app-v1/') || pathname === '/app-embed.js' || pathname.startsWith('/client/') || pathname.startsWith('/vendor/') || ['/embed.js', '/style.css'].includes(pathname)) response.headers.set('access-control-allow-origin', '*')
    return response
  }
}
