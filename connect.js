import { makeRoom } from './gossip.js'
import { makeWs } from './websocket.js'
import { send } from './send.js'

const getBootstrapConfig = () => {
  const params = new URLSearchParams(window.location.search)
  const apdsUrl = params.get('apds') || 'wss://pub.wiredove.net/'
  const room = params.get('room') || 'wiredovev1'
  const seed = params.get('seed') || 'evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k='
  const disableRoom = params.get('disableRoom') === '1'

  return { apdsUrl, room, seed, disableRoom }
}

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
