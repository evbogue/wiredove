import { pauseQueue } from '../../network_queue.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'
import { createServiceSession } from './service-session.js'
import { createBrowserStore } from './browser-store.js'
import { createArtifactSession } from './artifact-session.js'
import { serializeWebsiteWrite } from './signing-queue.js'
import { subscribeRenderer, deliverToRenderers } from './render-delivery.js'

const sourceOrigin = new URL(import.meta.url).origin
let selected
let manager
let artifacts
// The pinned APDS module is a singleton: all mounts in this module graph share
// one explicitly selected identity/database/backend. Conflicts are rejected.
export const acquireDefaultSession = async ({ database = 'wiredovedbversion1', backendURL = sourceOrigin, mediaURL = sourceOrigin, canonicalURL = sourceOrigin + '/', capabilities = {} } = {}) => {
  const httpURL = value => {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Expected an HTTP(S) service URL')
    return url.href.replace(/\/$/, '')
  }
  const policy = { database, backendURL: httpURL(backendURL), mediaURL: httpURL(mediaURL), canonicalURL: httpURL(canonicalURL), capabilities: { compose: true, reply: true, upload: true, recording: false, notifications: false, ...capabilities } }
  const selection = JSON.stringify(policy)
  if (selected && selected !== selection) throw Error('This application graph already owns another service configuration')
  if (!manager) {
    selected = selection
    const store = createBrowserStore(database + ':application')
    artifacts = createArtifactSession({ protocol: apds, store, endpoint: policy.backendURL + '/api/application', receive: async signature => { await deliverToRenderers('shouldWe', signature); await deliverToRenderers('blob', signature) } })
    manager = createServiceSession({ serialize: serializeWebsiteWrite,
      startStorage: name => apds.start(name),
      async startServices() {
        pauseQueue()
        artifacts.start()
        await artifacts.recover()
        // Offline startup retains local content and pending publications.
        await artifacts.pull().catch(() => {})
        const timer = setInterval(() => { void artifacts.pull().catch(() => {}) }, 3000)
        return async () => { clearInterval(timer); await artifacts.stop() }
      }, flushStorage: artifacts.flush,
    })
  }
  const lease = await manager.acquire(database)
  return { ...lease, policy, artifacts, subscribeRenderer,
    publish: (body, metadata) => lease.runExclusive(() => artifacts.publish(body, metadata)),
    retry: () => lease.runExclusive(() => artifacts.retry()),
    refresh: () => artifacts.pull(),
  }
}
