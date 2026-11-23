// Website frame: shared mount/services with explicit legacy transport, window
// routing and browser capabilities. Service-worker registration stays in app.js.
import { getPeerTransportControls } from '../ui/workspace-sync-controls.js'
import { mountApplication } from './mount.js'
import { createWindowNavigation } from './application-context.js'
import { acquireDefaultSession } from './default-session.js'
import { connect, disconnect } from '../../connect.js'
import { startSync, stopSync } from '../../sync.js'
import { send } from '../../send.js'
import { resumeQueue, pauseQueue } from '../../network_queue.js'

export const anbotWebsiteServices = {
  database: 'anbot-wiredove-preview',
  anbotSocial: true,
  capabilities: { notifications: false, recording: false, upload: false },
}

let started = false
export const startWebsiteApplication = async ({ services = {}, network = true, onMounted } = {}) => {
  if (started) throw new Error('The website application is already started')
  started = true
  let lease
  let application
  try {
    lease = await acquireDefaultSession({ ...services, capabilities: { recording: true, notifications: true, ...services.capabilities } })
    lease.legacyNetwork = network
    lease.transportControls = getPeerTransportControls
    if (network) { await connect(); await startSync(send); resumeQueue() }
    const host = document.createElement('main')
    document.body.append(host)
    application = await mountApplication(host, { session: lease, layout: 'page', onMounted,
      navigation: createWindowNavigation(window) })
    application.cleanup.push(async () => { pauseQueue(); if (network) stopSync(); await disconnect() })
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
