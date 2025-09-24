import { apds } from 'apds'
import { makeRoom } from './gossip.js'
import { makeWs} from './websocket.js'

await apds.start('wiredovedbversion1')

export const connect = async () => {
  await makeWs('wss://pub.wiredove.net/')
  await makeRoom('wiredovev1')    
}
