import { queueSend } from './network_queue.js'

export const send = async (m, options = {}) => {
  console.log('SENDING' + m)
  queueSend(m, options)
}
