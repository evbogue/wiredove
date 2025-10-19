import { apds } from 'apds'
import { makeRoom } from './gossip.js'
import { makeWs} from './websocket.js'

await apds.start('wiredovedbversion1')

export const connect = async () => {
  //await makeWs('ws://localhost:9000')
  await makeWs('wss://apds.anproto.com/')
  //await makeWs('wss://pub.wiredove.net/')
  await makeRoom('wiredovev1')    
}
