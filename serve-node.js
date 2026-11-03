import { createWiredoveHandler } from './server/handler.js'
import { createNodeServer } from './server/node-http.js'

const server = createNodeServer(await createWiredoveHandler())
server.listen(Number(process.env.PORT || 8000), process.env.HOST || '0.0.0.0', () => {
  console.log(`Wiredove (Node) listening on ${server.address().address}:${server.address().port}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(error => { process.exitCode = error ? 1 : 0 })
  setTimeout(() => server.closeAllConnections(), 5000).unref()
})
