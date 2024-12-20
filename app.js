import { bogbot } from 'bogbot'
import { route } from './route.js'
import { identify } from './identify.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'

if (await bogbot.pubkey()) {
  document.body.appendChild(navbar)
  await route()
  await connect()
} else {
  await identify() 
}

