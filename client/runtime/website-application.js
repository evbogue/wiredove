// Transitional website startup boundary. This still owns a whole document and
// singleton APDS session; it is deliberately not the public embed mount API.
import { mountApplication } from './mount.js'
import { createWindowNavigation } from './application-context.js'
import { subscribeRenderer } from './render-delivery.js'
import { websiteSession } from './website-session.js'

let started = false
export const startWebsiteApplication = async () => {
  if (started) throw new Error('The website application is already started')
  started = true
  let lease
  let application
  try {
    lease = await websiteSession.acquire('wiredovedbversion1')
    const host = document.createElement('main')
    document.body.append(host)
    application = await mountApplication(host, { session: lease, layout: 'page',
      navigation: createWindowNavigation(window) })
    application.cleanup.push(subscribeRenderer(application.render))
    if (!window.location.hash) window.location.hash = '#'
    return application
  } catch (error) {
    if (application) await application.destroy()
    else await lease?.release()
    started = false
    throw error
  }
}
