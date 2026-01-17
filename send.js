import { queueSend } from './network_queue.js'

export const send = async (m) => {
  console.log('SENDING' + m)
  queueSend(m)
}
