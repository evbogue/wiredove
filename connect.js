import { makeRoom } from './gossip.js'
import { makeWs } from './websocket.js'
import { send } from './send.js'
import { getBootstrapConfig } from './bootstrap_config.js'

export const connect = async () => {
  const { apdsUrl, room, seed, disableRoom } = getBootstrapConfig()
  makeWs(apdsUrl)
  // Trystero is temporarily disabled by default because some mobile antivirus
  // and browser security tools throw disruptive alerts when its WebRTC/DHT
  // bootstrap path initializes. Keep the room config available so it can be
  // re-enabled later without redesigning the bootstrap flow.
  if (!disableRoom && false) {
    makeRoom(room)
  }
  if (seed) {
    send(seed)
  }
}
