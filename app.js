import { apds } from 'apds'
import { route } from './route.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'
import { send } from './send.js'
import { startSync } from './sync.js'

await apds.start('wiredovedbversion1')
document.body.appendChild(await navbar())
await route()
await connect()
await startSync(send)

if (!window.location.hash) { window.location = '#' } 
