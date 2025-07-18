import { bogbot } from 'bogbot'
import { route } from './route.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'

await bogbot.start('wiredovedbversion1')
document.body.appendChild(await navbar())
await route()
await connect()

if (!window.location.hash) { window.location = '#' } 
