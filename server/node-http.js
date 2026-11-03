import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// Canceling a Web body should drain the HTTP request, not destroy its socket
// before a 400/413 response can be sent (Readable.toWeb destroys on cancel).
function requestBody(incoming) {
  let cleanup
  return new ReadableStream({
    start(controller) {
      const data = bytes => { controller.enqueue(bytes); if (controller.desiredSize <= 0) incoming.pause() }
      const end = () => { cleanup(); controller.close() }
      const error = cause => { cleanup(); controller.error(cause) }
      cleanup = () => { incoming.off('data', data); incoming.off('end', end); incoming.off('error', error) }
      incoming.on('data', data); incoming.once('end', end); incoming.once('error', error)
    },
    pull() { incoming.resume() },
    cancel() { cleanup(); incoming.resume() },
  }, { highWaterMark: 65536, size: bytes => bytes.length })
}

// Backpressure and cancellation stay in the adapter; routes consume Web APIs.
export function createNodeServer(handler) {
  return createServer(async (incoming, outgoing) => {
    const controller = new AbortController()
    incoming.once('aborted', () => controller.abort())
    incoming.on('error', () => controller.abort())
    outgoing.once('close', () => { if (!outgoing.writableFinished) controller.abort() })
    try {
      const headers = new Headers()
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1])
      const request = new Request(new URL(incoming.url, `http://${incoming.headers.host || 'localhost'}`), {
        method: incoming.method, headers, signal: controller.signal,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: requestBody(incoming), duplex: 'half' } : {}),
      })
      const response = await handler(request)
      if (request.body && !request.bodyUsed) await request.body.cancel()
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (incoming.method === 'HEAD' || !response.body) {
        await response.body?.cancel(); outgoing.end()
      } else await pipeline(Readable.fromWeb(response.body), outgoing, { signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('HTTP request failed:', error.message)
      if (!outgoing.headersSent) { outgoing.writeHead(500, { 'content-type': 'text/plain' }); outgoing.end('Internal server error') }
      else outgoing.destroy()
    }
  })
}
