import { makeRoom, stopRoom } from './gossip.js'
import { makeWs, stopNetwork } from './websocket.js'
import { send } from './send.js'

export const PUBLIC_RELAY = 'wss://pub.wiredove.net/'

export const connect = async () => {
  //await makeWs('ws://localhost:9000')
  //await makeWs('wss://apds.anproto.com/')
  await makeWs(PUBLIC_RELAY, { waitForReady: false, primary: true })
  await makeRoom('wiredovev1')
  send('evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k=')
}

export const disconnect = async () => {
  stopNetwork()
  await stopRoom()
}
