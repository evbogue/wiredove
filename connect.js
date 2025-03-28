import { bogbot } from 'bogbot'
import { makeRoom } from './gossip.js'

const pubkeys = new Set()

const ws = new WebSocket('wss://pub.wiredove.net/')
ws.onopen = async (e) => {
  console.log('OPEN')
  const log = await bogbot.query()
  for (const msg of log) {
    ws.send(msg.sig)
    ws.send(msg.text)
    ws.send(msg.hash)
    ws.send(msg.opened.substring(13))
  }
}



export const connect = async () => {
  const log = await bogbot.getOpenedLog()
  const pubkey = await bogbot.pubkey()
  pubkeys.add(pubkey)

  for (const msg of log) {
    pubkeys.add(msg.author)
  }

  if (pubkeys.size > 0) {
    pubkeys.forEach(async pubkey => {
      await makeRoom(pubkey, pubkeys)
    })
  }

}
