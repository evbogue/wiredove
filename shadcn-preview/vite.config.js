import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function readOnlyFeedProxy(origin) {
  const upstream = new URL('/gossip/poll', origin)

  function install(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url, 'http://localhost')
      if (url.pathname !== '/api/preview-feed') return next()
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' }).end()
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

  return { name: 'wiredove-preview-feed', configureServer: install, configurePreviewServer: install }
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

  if (shareBackend) proxy['/api/share'] = { target: shareBackend, changeOrigin: true }

  return {
    plugins: [react(), tailwindcss(), feedBackend && readOnlyFeedProxy(feedBackend)],
    define: {
      'import.meta.env.WIREDOVE_PREVIEW_REMOTE_FEED': JSON.stringify(Boolean(feedBackend)),
      'import.meta.env.WIREDOVE_PREVIEW_SHARE_ORIGIN': JSON.stringify(shareBackend ? new URL(shareBackend).origin : null),
    },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      fs: { allow: ['.', '../client', '../vendor'].map(path => fileURLToPath(new URL(path, import.meta.url))) },
      proxy,
    },
    preview: { proxy },
  }
})
