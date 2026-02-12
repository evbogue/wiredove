const listeners = new Set()
const pending = new Map()
let nextId = 1
let lastResult = null

const snapshot = () => ({
  pendingCount: pending.size,
  lastResult
})

const notify = () => {
  const state = snapshot()
  listeners.forEach((listener) => {
    try {
      listener(state)
    } catch (err) {
      console.warn('publish status listener failed', err)
    }
  })
}

export const getPublishStatusSnapshot = () => snapshot()

export const beginPublishVerification = (meta = {}) => {
  const id = `pub-${Date.now()}-${nextId++}`
  pending.set(id, {
    ...meta,
    startedAt: Date.now()
  })
  notify()
  return id
}

export const finishPublishVerification = (id, result = {}) => {
  if (id && pending.has(id)) {
    pending.delete(id)
  }
  lastResult = {
    ok: Boolean(result.ok),
    missing: Array.isArray(result.missing) ? result.missing : [],
    attempts: Number.isFinite(result.attempts) ? result.attempts : 0,
    reason: result.reason || '',
    at: Date.now()
  }
  notify()
}

export const subscribePublishStatus = (listener) => {
  listeners.add(listener)
  listener(snapshot())
  return () => {
    listeners.delete(listener)
  }
}
