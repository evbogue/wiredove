import { makeRoom } from './gossip.js'
import { makeWs } from './websocket.js'
import { send } from './send.js'

export const connect = async () => {
  //await makeWs('ws://localhost:9000')
  //await makeWs('wss://apds.anproto.com/')
  makeWs('wss://pub.wiredove.net/')
  makeRoom('wiredovev1')
  send('evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k=')
}
