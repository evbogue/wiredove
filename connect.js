import { bogbot } from 'bogbot'
import { makeRoom } from './gossip.js'

const pubkeys = new Set()

export const connect = async () => {
  const log = await bogbot.getLog()

  for (const hash of log) {
    try {
      const sig = await bogbot.find(hash)
      if (sig) {
        const opened = await bogbot.open(sig)
        pubkeys.add(sig.substring(0, 44))
      }
    } catch (err) { console.log(err)}
  }

  if (pubkeys.size > 0) {
    pubkeys.forEach(async pubkey => {
      await makeRoom(pubkey)
    })
  }
}
