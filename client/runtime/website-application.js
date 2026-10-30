// Transitional website startup boundary. This still owns a whole document and
// singleton APDS session; it is deliberately not the public embed mount API.
import { apds } from 'apds'
import { route } from '../../route.js'
import { connect } from '../../connect.js'
import { navbar } from '../../navbar.js'
import { send } from '../../send.js'
import { startSync } from '../../sync.js'
import { createImagePopover } from '../ui/image-popover.js'

let started = false
export const startWebsiteApplication = async () => {
  if (started) throw new Error('The website application is already started')
  started = true
  await apds.start('wiredovedbversion1')
  document.body.appendChild(await navbar())
  document.body.appendChild(createImagePopover({
    getImage: (hash) => apds.get(hash),
    requestImage: send,
    delegateRoot: document.body,
  }))
  const connection = connect()
  await route()
  await connection
  await startSync(send)
  if (!window.location.hash) window.location.hash = '#'
}
