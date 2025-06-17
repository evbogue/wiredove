import { bogbot } from 'bogbot'
import { route } from './route.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'

if (!window.location.hash) { window.location = '#' }

await bogbot.start('wiredovedbversion1')

document.body.appendChild(await navbar())

await route()
await bogbot.query()
await connect()

//await bogbot.keypair().then(async (pubkey) => {
//  if (pubkey) { await connect()}
//})
