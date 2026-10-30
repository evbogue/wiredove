import { createApplicationBackend } from '../application_backend.js'
import { createAndFsMediaService } from '../andfs_media_server.js'
const dataDir = Deno.args[0]
const backend = await createApplicationBackend({ dataDir: dataDir + '/application' })
const media = await createAndFsMediaService({ dataDir })
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen: ({ port }) => console.log(port) }, async request => {
  const response = await backend.handleRequest(request) || await media.handleRequest(request)
  if (response) return response
  const url = new URL(request.url)
  if (url.pathname === '/website') return new Response(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><script type="importmap">{"imports":{"apds":"https://esm.sh/gh/evbogue/apds@4934fac/apds.js","h":"https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js"}}</script><script type="module">import {startWebsiteApplication} from '/client/runtime/website-application.js';window.app=await startWebsiteApplication({network:false});window.ready=true;</script>`, { headers: { 'content-type': 'text/html' } })
  try {
    if (decodeURIComponent(url.pathname).split('/').some(part => part === '..') || url.pathname.startsWith('/data/')) return new Response(null, { status: 404 })
    const bytes = await Deno.readFile('.' + url.pathname)
    return new Response(bytes, { headers: { 'access-control-allow-origin': '*', 'content-type': url.pathname.endsWith('.ttf') ? 'font/ttf' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.png') ? 'image/png' : 'text/javascript' } })
  } catch { return new Response(null, { status: 404 }) }
})
await server.finished
