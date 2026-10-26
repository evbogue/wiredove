import { serveDir } from 'https://deno.land/std@0.224.0/http/file_server.ts'
import { createNotificationsService } from './notifications_server.js'
import { createAndFsMediaService } from './andfs_media_server.js'

const notifications = await createNotificationsService()
const BLOB_DIR = Deno.env.get('BLOB_DIR') || './data/blobs'
await Deno.mkdir(BLOB_DIR, { recursive: true })
const media = await createAndFsMediaService({
  dataDir: Deno.env.get('MEDIA_DATA_DIR') || './data',
  maxMediaBytes: Number(Deno.env.get('MEDIA_MAX_BYTES') || 32 * 1024 * 1024),
  quotaBytes: Number(Deno.env.get('MEDIA_QUOTA_BYTES') || 1024 * 1024 * 1024)
})

const validBlobId = (id) => /^anblob:v1:(raw|chunked):sha256:[A-Za-z0-9_-]+$/.test(id)

const blobPath = (id) => `${BLOB_DIR}/${encodeURIComponent(id)}`

const handleBlobRequest = async (request) => {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/blobs/')) return null

  const encoded = url.pathname.slice('/blobs/'.length)
  let id
  try {
    id = decodeURIComponent(encoded)
  } catch {
    return new Response('bad blob id', { status: 400 })
  }
  if (!validBlobId(id)) return new Response('bad blob id', { status: 400 })

  const path = blobPath(id)

  if (request.method === 'PUT') {
    const bytes = new Uint8Array(await request.arrayBuffer())
    const temp = `${path}.${crypto.randomUUID()}.tmp`
    await Deno.writeFile(temp, bytes)
    await Deno.rename(temp, path)
    return new Response(null, { status: 204 })
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      const stat = await Deno.stat(path)
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(stat.size),
        'cache-control': 'public, max-age=31536000, immutable'
      })
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
      return new Response(await Deno.readFile(path), { status: 200, headers })
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return new Response(null, { status: 404 })
      throw err
    }
  }

  return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD, PUT' } })
}

Deno.serve({ port: Number(Deno.env.get('PORT') || 8000) }, async (r) => {
  let pathname
  try { pathname = decodeURIComponent(new URL(r.url).pathname) }
  catch { return new Response(null, { status: 400 }) }
  if (/^\/(?:data(?:\/|$)|config\.json$|\.git(?:\/|$))/.test(pathname)) {
    return new Response(null, { status: 404 })
  }
  const mediaResponse = await media.handleRequest(r)
  if (mediaResponse) return mediaResponse
  const blobResponse = await handleBlobRequest(r)
  if (blobResponse) return blobResponse
  const handled = await notifications.handleRequest(r)
  if (handled) return handled
  const response = await serveDir(r, { quiet: 'True' })
  if (pathname.startsWith('/client/') || (pathname.startsWith('/vendor/andfs/') || pathname.startsWith('/vendor/cropperjs/')) ||
      ['/embed.js', '/style.css'].includes(new URL(r.url).pathname)) {
    response.headers.set('Access-Control-Allow-Origin', '*')
  }
  return response
})
