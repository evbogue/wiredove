// Website frame: shared mount/services with explicit legacy transport, window
// routing and browser capabilities. Service-worker registration stays in app.js.
import { mountApplication } from './mount.js'
import { createWindowNavigation } from './application-context.js'
import { acquireDefaultSession } from './default-session.js'
import { connect, disconnect } from '../../connect.js'
import { startSync, stopSync } from '../../sync.js'
import { send } from '../../send.js'
import { resumeQueue, pauseQueue } from '../../network_queue.js'

let started = false
export const startWebsiteApplication = async ({ services = {}, network = true } = {}) => {
  if (started) throw new Error('The website application is already started')
  started = true
  let lease
  let application
  try {
    lease = await acquireDefaultSession({ ...services, capabilities: { recording: true, notifications: true, ...services.capabilities } })
    lease.legacyNetwork = network
    if (network) { await connect(); await startSync(send); resumeQueue() }
    const host = document.createElement('main')
    document.body.append(host)
    application = await mountApplication(host, { session: lease, layout: 'page',
      navigation: createWindowNavigation(window) })
    if (network) application.cleanup.push(async () => { pauseQueue(); stopSync(); await disconnect() })
    application.cleanup.push(() => { started = false })
    if (!window.location.hash) window.location.hash = '#'
    return application
  } catch (error) {
    if (network) { pauseQueue(); stopSync(); await disconnect() }
    if (application) await application.destroy()
    else await lease?.release()
    started = false
    throw error
  }
}
