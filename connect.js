import { bogbot } from 'bogbot'
import { makeRoom } from './gossip.js'

const pubkeys = new Set()

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
