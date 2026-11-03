import { createWiredoveHandler } from '../server/handler.js'
import { createNodeServer } from '../server/node-http.js'

const dataDir = process.argv[2]
const handler = await createWiredoveHandler({ env: { DATA_DIR: dataDir, VAPID_CONFIG_PATH: dataDir + '/config.json' } })
const server = createNodeServer(request => {
  if (new URL(request.url).pathname === '/website') return new Response(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><script type="importmap">{"imports":{"apds":"https://esm.sh/gh/evbogue/apds@4934fac/apds.js","h":"https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js"}}</script><script type="module">import {startWebsiteApplication} from '/client/runtime/website-application.js';window.app=await startWebsiteApplication({network:false});window.ready=true;</script>`, { headers: { 'content-type': 'text/html' } })
  return handler(request)
})
server.listen(0, '127.0.0.1', () => console.log(server.address().port))
