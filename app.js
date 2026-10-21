import { apds } from 'apds'
import { route } from './route.js'
import { connect } from './connect.js'
import { navbar } from './navbar.js'
import { send } from './send.js'
import { startSync } from './sync.js'
import { createImagePopover } from './client/ui/image-popover.js'

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) { return }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('service worker registration failed', err)
    })
  }, { once: true })
}

await apds.start('wiredovedbversion1')
document.body.appendChild(await navbar())
document.body.appendChild(createImagePopover({
  getImage: (hash) => apds.get(hash),
  requestImage: send,
}))
const connectPromise = connect()
await route()
await connectPromise
await startSync(send)
registerServiceWorker()

if (!window.location.hash) { window.location = '#' } 
