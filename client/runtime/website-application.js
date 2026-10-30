// Transitional website startup boundary. This still owns a whole document and
// singleton APDS session; it is deliberately not the public embed mount API.
import { apds } from 'apds'
import { createApplication } from './application.js'
import { createWindowNavigation, createWindowScroll } from './application-context.js'
import { subscribeRenderer } from './render-delivery.js'
import { connect } from '../../connect.js'
import { send } from '../../send.js'
import { startSync } from '../../sync.js'
import { createImagePopover } from '../ui/image-popover.js'

let started = false
export const startWebsiteApplication = async () => {
  if (started) throw new Error('The website application is already started')
  started = true
  await apds.start('wiredovedbversion1')
  const application = await createApplication({ root: document.body,
    navigation: createWindowNavigation(window), scroll: createWindowScroll(window) })
  application.cleanup.push(subscribeRenderer(application.render))
  document.body.appendChild(createImagePopover({
    getImage: (hash) => apds.get(hash),
    requestImage: send,
    delegateRoot: document.body,
  }))
  const connection = connect()
  await application.start()
  await connection
  await startSync(send)
  if (!window.location.hash) window.location.hash = '#'
  return application
}
