import { makeRoom } from './gossip.js'
import { makeWs } from './websocket.js'
import { send } from './send.js'
import { getBootstrapConfig } from './bootstrap_config.js'

export const connect = async () => {
  const { apdsUrl, room, seed, disableRoom } = getBootstrapConfig()
  makeWs(apdsUrl)
  if (!disableRoom) {
    makeRoom(room)
  }
  if (seed) {
    send(seed)
  }
}
