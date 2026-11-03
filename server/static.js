import * as fs from 'node:fs/promises'
import { resolve, relative, sep, extname } from 'node:path'

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
}
const within = (root, file) => file === root || file.startsWith(root + sep)
const hidden = path => path.split(/[\\/]/).some(part => part.startsWith('.') || ['data', 'node_modules', 'config.json'].includes(part))

export function createStaticHandler({ root, privatePaths = [] }) {
  root = resolve(root)
  const privateFiles = privatePaths.map(path => resolve(path))
  return async request => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url).pathname) }
    catch { return new Response(null, { status: 400 }) }
    if (pathname.includes('\0') || hidden(pathname.slice(1))) return new Response(null, { status: 404 })
    let file = resolve(root, '.' + pathname)
    const allowed = target => within(root, target) && !hidden(relative(root, target)) && !privateFiles.some(path => within(path, target))
    if (!allowed(file)) return new Response(null, { status: 404 })
    try {
      file = await fs.realpath(file)
      if (!allowed(file)) return new Response(null, { status: 404 })
      let stat = await fs.stat(file)
      if (stat.isDirectory()) {
        if (!pathname.endsWith('/')) {
          const url = new URL(request.url); url.pathname += '/'
          return Response.redirect(url, 301)
        }
        file = await fs.realpath(resolve(file, 'index.html'))
        if (!allowed(file)) return new Response(null, { status: 404 })
        stat = await fs.stat(file)
      }
      if (!stat.isFile()) return new Response(null, { status: 404 })
      const modified = stat.mtime.toUTCString()
      const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`
      const headers = new Headers({ 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'last-modified': modified, etag, 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' })
      const match = request.headers.get('if-none-match')
      if ((match && (match === '*' || match.split(/,\s*/).includes(etag))) || (!match && request.headers.has('if-modified-since') && Date.parse(request.headers.get('if-modified-since')) >= Date.parse(modified))) return new Response(null, { status: 304, headers })
      let start = 0, end = stat.size, status = 200
      const range = request.headers.get('range'), ifRange = request.headers.get('if-range')
      if (range && (!ifRange || Date.parse(ifRange) >= Date.parse(modified))) {
        const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (parts) {
          start = parts[1] ? Number(parts[1]) : Math.max(0, stat.size - Number(parts[2]))
          end = parts[1] && parts[2] ? Math.min(stat.size, Number(parts[2]) + 1) : stat.size
        }
        if (!parts || (!parts[1] && !parts[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || start < 0 || end > stat.size) {
          headers.set('content-range', `bytes */${stat.size}`)
          return new Response(null, { status: 416, headers })
        }
        status = 206; headers.set('content-range', `bytes ${start}-${end - 1}/${stat.size}`)
      }
      headers.set('content-length', String(end - start))
      if (request.method === 'HEAD') return new Response(null, { status, headers })
      const handle = await fs.open(file, 'r')
      try {
        const bytes = new Uint8Array(end - start)
        let offset = 0
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, start + offset)
          if (!bytesRead) throw Error('Static file changed while reading')
          offset += bytesRead
        }
        return new Response(bytes, { status, headers })
      } finally { await handle.close() }
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return new Response(null, { status: 404 })
      throw error
    }
  }
}
