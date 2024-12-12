import { bogbot } from 'bogbot'
import { route } from './route.js'
import { identify } from './identify.js'

if (await bogbot.pubkey()) {
  await route()
}

if (!await bogbot.pubkey()) {
  await identify() 
}
