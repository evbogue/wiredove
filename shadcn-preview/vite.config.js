import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function browseFeedProxy(origin, backend) {
  const upstream = new URL('/gossip/poll', origin)

  function install(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url, 'http://localhost')
      const media = /^\/(?:blobs|media)\/[A-Za-z0-9_-]{43}$/.test(url.pathname)
      if (!media && url.pathname !== '/api/preview-feed') return next()
      const methods = media ? ['GET', 'HEAD'] : ['GET']
      if (!methods.includes(request.method)) {
        response.writeHead(405, { Allow: methods.join(', ') }).end()
        return
      }
      if (media) {
        const fetchMedia = source => fetch(new URL(url.pathname, source), {
          method: request.method, redirect: 'error', signal: AbortSignal.timeout(12000),
          headers: request.headers.range ? { Range: request.headers.range } : {},
        })
        try {
          let result = await fetchMedia(backend).catch(() => null)
          if (!result?.ok && result?.status !== 416) {
            await result?.body?.cancel()
            result = await fetchMedia(origin)
          }
          const headers = Object.fromEntries(['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']
            .filter(header => result.headers.has(header)).map(header => [header, result.headers.get(header)]))
          response.writeHead(result.status, headers)
          if (!result.body) {
            response.end()
            return
          }
          const stream = Readable.fromWeb(result.body)
          response.once('close', () => stream.destroy())
          stream.on('error', () => response.destroy())
          stream.pipe(response)
        } catch {
          response.writeHead(502).end()
        }
        return
      }
      const cursor = url.searchParams.get('since') ?? '0'
      if (!/^\d{1,16}$/.test(cursor)) {
        response.writeHead(400).end()
        return
      }
      const target = new URL(upstream)
      target.searchParams.set('since', cursor)
      try {
        const result = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(12000) })
        if (!result.ok || !result.headers.get('content-type')?.startsWith('application/json')) {
          await result.body?.cancel()
          response.writeHead(502).end()
          return
        }
        const body = await result.text()
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body)
      } catch {
        response.writeHead(502).end()
      }
    })
  }

  return { name: 'wiredove-preview-feed', enforce: 'pre', configureServer: install, configurePreviewServer: install }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'WIREDOVE_PREVIEW_')
  const backend = env.WIREDOVE_PREVIEW_BACKEND || 'http://127.0.0.1:8000'
  const feedBackend = env.WIREDOVE_PREVIEW_FEED_BACKEND
  const shareBackend = env.WIREDOVE_PREVIEW_SHARE_BACKEND
  const proxy = Object.fromEntries(
    ['/api/application', '/api/git', '/sync/status', '/gossip/poll', '/posts', '/wiredove/image', '/git/']
      .map(path => [path, { target: backend, changeOrigin: true }]),
  )
  proxy['^/media/[A-Za-z0-9_-]{43}$'] = { target: backend, changeOrigin: true }

  proxy['/api/media'] = { target: backend, changeOrigin: true }
  proxy['^/blobs/[A-Za-z0-9_-]{43}$'] = { target: backend, changeOrigin: true }
  proxy['^/blobs/anblob(?::|%3[Aa])v1(?::|%3[Aa])(?:raw|chunked)(?::|%3[Aa])sha256(?::|%3[Aa])[A-Za-z0-9_-]{43}$'] = {
    target: backend,
    changeOrigin: true,
    bypass: request => ['GET', 'HEAD'].includes(request.method) ? undefined : false,
  }
  if (shareBackend) proxy['/api/share'] = { target: shareBackend, changeOrigin: true }

  const transportFiles = [
    'websocket.js', 'gossip.js', 'network_queue.js', 'moderation.js',
    'adaptive_concurrency.js', 'perf.js', 'trystero-torrent.min.js', 'anproto_blob.js',
  ]

  return {
    plugins: [react(), tailwindcss(), feedBackend && browseFeedProxy(feedBackend, backend)],
    define: {
      'import.meta.env.WIREDOVE_PREVIEW_REMOTE_FEED': JSON.stringify(Boolean(feedBackend)),
      'import.meta.env.WIREDOVE_PREVIEW_SHARE_ORIGIN': JSON.stringify(shareBackend ? new URL(shareBackend).origin : null),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        apds: fileURLToPath(new URL('./src/peer-apds.js', import.meta.url)),
      },
    },
    server: {
      fs: { allow: ['.', '../client', '../vendor', ...transportFiles.map(file => '../' + file)].map(path => fileURLToPath(new URL(path, import.meta.url))) },
      proxy,
    },
    preview: { proxy },
  }
})
