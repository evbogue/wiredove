import { apds } from 'apds'
import { route } from './route.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'
import { lookup } from './lookup.js'

await apds.start('wiredovedbversion1')
await lookup.load()
document.body.appendChild(await navbar())
await route()
await connect()

if (!window.location.hash) { window.location = '#' } 
