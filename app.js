import { bogbot } from 'bogbot'
import { route } from './route.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'

if (!window.location.hash) { window.location = '#' }

await bogbot.start('wiredovedbversion1')

document.body.appendChild(await navbar())

if (await bogbot.keypair()) {
  await route()
  await connect()
}

