// Transitional website startup boundary. This still owns a whole document and
// singleton APDS session; it is deliberately not the public embed mount API.
import { apds } from 'apds'
import { createApplication } from './application.js'
import { createWindowNavigation, createWindowScroll } from './application-context.js'
import { subscribeRenderer } from './render-delivery.js'
import { websiteSession } from './website-session.js'
import { send } from '../../send.js'
import { createImagePopover } from '../ui/image-popover.js'

let started = false
export const startWebsiteApplication = async () => {
  if (started) throw new Error('The website application is already started')
  started = true
  let lease
  let application
  try {
    lease = await websiteSession.acquire('wiredovedbversion1')
    application = await createApplication({ root: document.body,
      navigation: createWindowNavigation(window), scroll: createWindowScroll(window), session: lease })
    application.cleanup.push(subscribeRenderer(application.render))
    document.body.appendChild(createImagePopover({
      getImage: (hash) => apds.get(hash),
      requestImage: send,
      delegateRoot: document.body,
    }))
    await application.start()
    if (!window.location.hash) window.location.hash = '#'
    return application
  } catch (error) {
    if (application) await application.destroy()
    else await lease?.release()
    started = false
    throw error
  }
}
