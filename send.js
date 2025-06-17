import { sendWs } from './websocket.js'
import { sendTry } from './gossip.js'

export const send = async (m) => {
  console.log('SENDING' + m)
  await sendWs(m)
  await sendTry(m)
}
