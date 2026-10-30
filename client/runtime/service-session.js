// A session explicitly shares a page-lifetime storage/identity adapter. Releasing
// the last lease stops network work; it never clears or migrates identity data.
export const createServiceSession = ({ startStorage, startServices, flushStorage = async () => {}, serialize = operation => operation() }) => {
  let storageReady
  let database
  let stopServices
  let leases = 0
  let transitions = Promise.resolve()
  let writes = Promise.resolve()
  const transition = operation => {
    const result = transitions.then(operation)
    transitions = result.catch(() => {})
    return result
  }
  const runExclusive = operation => {
    const result = writes.then(() => serialize(operation))
    writes = result.catch(() => {})
    return result
  }
  return {
    runExclusive,
    acquire(name) {
      return transition(async () => {
        if (typeof name !== 'string' || !name) throw new Error('A database name is required')
        if (database && database !== name) throw new Error('This shared session already owns another database')
        database = name
        // Never restart a singleton storage implementation after a failed start:
        // it may already have created timers or opened a database handle.
        storageReady ||= Promise.resolve().then(() => startStorage(name))
        await storageReady
        if (!leases) stopServices = await startServices()
        leases += 1
        let released = false
        let releasePromise
        return { runExclusive(operation) {
          if (released) return Promise.reject(new Error('Session lease has been released'))
          return runExclusive(operation)
        }, release() {
          if (released) return releasePromise
          released = true
          releasePromise = transition(async () => {
            leases -= 1
            if (leases) return
            const stop = stopServices
            stopServices = null
            try { await runExclusive(async () => {}); await stop?.() }
            finally { await flushStorage() }
          })
          return releasePromise
        } }
      })
    },
  }
}
