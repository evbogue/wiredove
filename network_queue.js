const SEND_DELAY_MS = 100
const HASH_RETRY_MS = 800
const HASH_QUEUE_COOLDOWN_MS = 30000
const queue = []
const pending = new Map()
const hashCooldown = new Map()
let drainTimer = null
let draining = false
let nextHashTarget = 'ws'

const senders = {
  ws: null,
  hasWs: null,
  gossip: null,
  hasGossip: null
}

const getKey = (msg) => {
  if (typeof msg === 'string') { return msg }
  return null
}

const isHash = (msg) => typeof msg === 'string' && msg.length === 44

const flipTarget = (target) => (target === 'ws' ? 'gossip' : 'ws')

export const registerNetworkSenders = (config = {}) => {
  if (config.sendWs) { senders.ws = config.sendWs }
  if (config.hasWs) { senders.hasWs = config.hasWs }
  if (config.sendGossip) { senders.gossip = config.sendGossip }
  if (config.hasGossip) { senders.hasGossip = config.hasGossip }
}

const isTargetReady = (target) => {
  if (target === 'ws') { return senders.hasWs?.() }
  if (target === 'gossip') { return senders.hasGossip?.() }
  return false
}

const sendToTarget = (target, msg) => {
  if (target === 'ws') { senders.ws?.(msg) }
  if (target === 'gossip') { senders.gossip?.(msg) }
}

const cleanupItem = (item, index) => {
  if (item.key) { pending.delete(item.key) }
  queue.splice(index, 1)
}

const pickHashTarget = (item) => {
  const wsReady = isTargetReady('ws')
  const gossipReady = isTargetReady('gossip')
  if (!item.sent.ws && !item.sent.gossip) {
    const preferred = nextHashTarget
    const preferredReady = preferred === 'ws' ? wsReady : gossipReady
    if (preferredReady) { return preferred }
    const fallback = flipTarget(preferred)
    const fallbackReady = fallback === 'ws' ? wsReady : gossipReady
    if (fallbackReady) { return fallback }
    return null
  }
  if (item.sent.ws && item.sent.gossip) { return null }
  const firstTarget = item.firstTarget
  if (!firstTarget) { return null }
  const otherTarget = flipTarget(firstTarget)
  const otherReady = otherTarget === 'ws' ? wsReady : gossipReady
  if (!item.sent[otherTarget] && otherReady && Date.now() - item.sentAt[firstTarget] >= HASH_RETRY_MS) {
    return otherTarget
  }
  return null
}

const drainQueue = () => {
  drainTimer = null
  if (draining) {
    drainTimer = setTimeout(drainQueue, SEND_DELAY_MS)
    return
  }
  draining = true
  try {
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i]
      if (item.kind === 'hash') {
        const target = pickHashTarget(item)
        if (!target) { continue }
        sendToTarget(target, item.msg)
        item.sent[target] = true
        item.sentAt[target] = Date.now()
        if (!item.firstTarget) {
          item.firstTarget = target
          nextHashTarget = flipTarget(target)
        }
        if (item.sent.ws && item.sent.gossip) {
          cleanupItem(item, i)
        }
        break
      }
      const wsReady = !item.sent.ws && isTargetReady('ws')
      const gossipReady = !item.sent.gossip && isTargetReady('gossip')
      if (!wsReady && !gossipReady) { continue }
      if (wsReady) {
        sendToTarget('ws', item.msg)
        item.sent.ws = true
      }
      if (gossipReady) {
        sendToTarget('gossip', item.msg)
        item.sent.gossip = true
      }
      const wsDone = item.sent.ws
      const gossipDone = item.sent.gossip
      if (wsDone && gossipDone) { cleanupItem(item, i) }
      break
    }
  } finally {
    draining = false
  }
  if (queue.length) {
    drainTimer = setTimeout(drainQueue, SEND_DELAY_MS)
  }
}

export const queueSend = (msg) => {
  const key = getKey(msg)
  if (key && pending.has(key)) {
    const item = pending.get(key)
    if (!drainTimer) { drainTimer = setTimeout(drainQueue, 0) }
    return false
  }
  if (isHash(msg)) {
    const now = Date.now()
    const last = hashCooldown.get(msg) || 0
    if (now - last < HASH_QUEUE_COOLDOWN_MS) { return false }
    hashCooldown.set(msg, now)
  }
  const item = {
    msg,
    key,
    kind: isHash(msg) ? 'hash' : 'blob',
    sent: { ws: false, gossip: false },
    sentAt: { ws: 0, gossip: 0 },
    firstTarget: null
  }
  queue.push(item)
  if (key) { pending.set(key, item) }
  if (!drainTimer) { drainTimer = setTimeout(drainQueue, 0) }
  return true
}

export const noteReceived = (msg) => {
  const key = getKey(msg)
  if (!key) { return }
  const item = pending.get(key)
  if (!item) { return }
  pending.delete(key)
  const idx = queue.indexOf(item)
  if (idx >= 0) { queue.splice(idx, 1) }
}

export const getQueueSize = () => queue.length

export const clearQueue = () => {
  queue.length = 0
  pending.clear()
  hashCooldown.clear()
  if (drainTimer) {
    clearTimeout(drainTimer)
    drainTimer = null
  }
  draining = false
}
