import { bogbot } from 'bogbot'
import { route } from './route.js'
import { identify } from './identify.js'
import { connect } from './connect.js'

if (await bogbot.pubkey()) {
  await route()
  await connect()
} else {
  await identify() 
}

