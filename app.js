import { bogbot } from 'bogbot'
import { route } from './route.js'
import { identify } from './identify.js'
import { makeRoom } from './gossip.js'

if (await bogbot.pubkey()) {
  await route()
  await makeRoom(await bogbot.pubkey())
}

if (!await bogbot.pubkey()) {
  await identify() 
}
