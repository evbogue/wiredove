const SEND_DELAY_MS = 100
const HASH_RETRY_MS = 800
const HASH_QUEUE_COOLDOWN_MS = 30000
const MAX_QUEUE_ITEMS = 1800

const PRIORITY_ORDER = ['high', 'normal', 'low']
const PRIORITY_RANK = { high: 3, normal: 2, low: 1 }

const queues = {
  high: [],
  normal: [],
  low: []
}

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

const normalizePriority = (priority) => {
  if (priority === 'high' || priority === 'normal' || priority === 'low') { return priority }
  return 'normal'
}

const totalQueueSize = () => queues.high.length + queues.normal.length + queues.low.length

const getKey = (msg) => (typeof msg === 'string' ? msg : null)

const isHash = (msg) => typeof msg === 'string' && msg.length === 44

const flipTarget = (target) => (target === 'ws' ? 'gossip' : 'ws')

const removeFromQueue = (queue, item) => {
  const idx = queue.indexOf(item)
  if (idx >= 0) {
    queue.splice(idx, 1)
    return true
  }
  return false
}

const promoteItem = (item, nextPriority) => {
  const current = item.priority
  if (PRIORITY_RANK[nextPriority] <= PRIORITY_RANK[current]) { return }
  removeFromQueue(queues[current], item)
  item.priority = nextPriority
  queues[nextPriority].push(item)
}

const trimOverflow = () => {
  while (totalQueueSize() > MAX_QUEUE_ITEMS) {
    const low = queues.low.shift()
    if (low) {
      if (low.key) { pending.delete(low.key) }
      continue
    }
    const normal = queues.normal.shift()
    if (normal) {
      if (normal.key) { pending.delete(normal.key) }
      continue
    }
    // Never drop high-priority traffic automatically unless the queue is only high.
    const high = queues.high.shift()
    if (!high) { break }
    if (high.key) { pending.delete(high.key) }
  }
}

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

const removeItem = (item, lane, index) => {
  if (item.key) { pending.delete(item.key) }
  queues[lane].splice(index, 1)
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

const trySendItem = (item, lane, index) => {
  if (item.kind === 'hash') {
    const target = pickHashTarget(item)
    if (!target) { return false }
    sendToTarget(target, item.msg)
    item.sent[target] = true
    item.sentAt[target] = Date.now()
    if (!item.firstTarget) {
      item.firstTarget = target
      nextHashTarget = flipTarget(target)
    }
    if (item.sent.ws && item.sent.gossip) {
      removeItem(item, lane, index)
    }
    return true
  }

  const wsReady = !item.sent.ws && isTargetReady('ws')
  const gossipReady = !item.sent.gossip && isTargetReady('gossip')
  if (!wsReady && !gossipReady) { return false }
  if (wsReady) {
    sendToTarget('ws', item.msg)
    item.sent.ws = true
  }
  if (gossipReady) {
    sendToTarget('gossip', item.msg)
    item.sent.gossip = true
  }
  if (item.sent.ws && item.sent.gossip) {
    removeItem(item, lane, index)
  }
  return true
}

const drainQueue = () => {
  drainTimer = null
  if (draining) {
    drainTimer = setTimeout(drainQueue, SEND_DELAY_MS)
    return
  }
  draining = true
  try {
    let sent = false
    for (const lane of PRIORITY_ORDER) {
      const queue = queues[lane]
      for (let i = 0; i < queue.length; i += 1) {
        if (trySendItem(queue[i], lane, i)) {
          sent = true
          break
        }
      }
      if (sent) { break }
    }
  } finally {
    draining = false
  }
  if (totalQueueSize() > 0) {
    drainTimer = setTimeout(drainQueue, SEND_DELAY_MS)
  }
}

export const queueSend = (msg, options = {}) => {
  const priority = normalizePriority(options.priority)
  const key = getKey(msg)
  if (key && pending.has(key)) {
    const existing = pending.get(key)
    promoteItem(existing, priority)
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
    priority,
    kind: isHash(msg) ? 'hash' : 'blob',
    sent: { ws: false, gossip: false },
    sentAt: { ws: 0, gossip: 0 },
    firstTarget: null
  }
  queues[priority].push(item)
  if (key) { pending.set(key, item) }
  trimOverflow()
  if (!drainTimer) { drainTimer = setTimeout(drainQueue, 0) }
  return true
}

export const noteReceived = (msg) => {
  const key = getKey(msg)
  if (!key) { return }
  const item = pending.get(key)
  if (!item) { return }
  pending.delete(key)
  removeFromQueue(queues[item.priority], item)
}

export const getQueueSize = () => totalQueueSize()

export const clearQueue = () => {
  queues.high.length = 0
  queues.normal.length = 0
  queues.low.length = 0
  pending.clear()
  hashCooldown.clear()
  if (drainTimer) {
    clearTimeout(drainTimer)
    drainTimer = null
  }
  draining = false
}
