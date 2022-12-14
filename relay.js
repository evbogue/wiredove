import { serveDir } from "https://deno.land/std@0.165.0/http/file_server.ts"
import { listenAndServe } from "https://deno.land/std@0.144.0/http/server.ts"

const sockets = new Set()
const channel = new BroadcastChannel("")

channel.onmessage = e => {
  (e.target != channel) && channel.postMessage(e.data)
  console.log(e.data)
  sockets.forEach(s => s.send(e.data))
}

await listenAndServe(":8080", (r) => {
  try {
    const { socket, response } = Deno.upgradeWebSocket(r)
    sockets.add(socket)
    socket.onmessage = channel.onmessage
    socket.onclose = _ => sockets.delete(socket)
    return response
  } catch {
    return serveDir(r, {fsRoot: '', showDirListing: true, quiet: true})
  }
})

