import { serializeWebsiteWrite } from './signing-queue.js'
import { apds } from 'apds'
import { connect, disconnect } from '../../connect.js'
import { send } from '../../send.js'
import { startSync, stopSync } from '../../sync.js'
import { pauseQueue, resumeQueue } from '../../network_queue.js'
import { createServiceSession } from './service-session.js'

export const websiteSession = createServiceSession({
  serialize: serializeWebsiteWrite,
  startStorage: name => apds.start(name),
  async startServices() {
    pauseQueue()
    try {
      await connect()
      await startSync(send)
      resumeQueue()
    } catch (error) {
      stopSync()
      await disconnect()
      pauseQueue()
      throw error
    }
    return async () => {
      pauseQueue()
      stopSync()
      await disconnect()
    }
  },
  async flushStorage() {
    await apds.put('hashlog', JSON.stringify(await apds.getHashLog()))
    await apds.put('openedlog', JSON.stringify(await apds.getOpenedLog()))
  },
})
