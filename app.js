import { bogbot } from 'bogbot'
import { route } from './route.js'
import { identify } from './identify.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'

document.body.appendChild(navbar)

if (await bogbot.keypair()) {
  await route()
  await connect()
}

