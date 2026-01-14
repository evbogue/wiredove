const SEND_DELAY_MS = 100
const queue = []
const pending = new Map()
let drainTimer = null
let draining = false

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

const normalizeTargets = (targets) => {
  if (!targets || targets === 'both') { return { ws: true, gossip: true } }
  if (targets === 'ws') { return { ws: true, gossip: false } }
  if (targets === 'gossip') { return { ws: false, gossip: true } }
  return { ws: true, gossip: true }
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

const cleanupItem = (item, index) => {
  if (item.key) { pending.delete(item.key) }
  queue.splice(index, 1)
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
      const wsReady = item.targets.ws && !item.sent.ws && isTargetReady('ws')
      const gossipReady = item.targets.gossip && !item.sent.gossip && isTargetReady('gossip')
      if (!wsReady && !gossipReady) { continue }
      if (wsReady) {
        sendToTarget('ws', item.msg)
        item.sent.ws = true
      }
      if (gossipReady) {
        sendToTarget('gossip', item.msg)
        item.sent.gossip = true
      }
      const wsDone = !item.targets.ws || item.sent.ws
      const gossipDone = !item.targets.gossip || item.sent.gossip
      if (wsDone && gossipDone) {
        cleanupItem(item, i)
      }
      break
    }
  } finally {
    draining = false
  }
  if (queue.length) {
    drainTimer = setTimeout(drainQueue, SEND_DELAY_MS)
  }
}

export const queueSend = (msg, targets = 'both') => {
  const key = getKey(msg)
  const targetFlags = normalizeTargets(targets)
  if (key && pending.has(key)) {
    const item = pending.get(key)
    item.targets.ws = item.targets.ws || targetFlags.ws
    item.targets.gossip = item.targets.gossip || targetFlags.gossip
    if (!drainTimer) { drainTimer = setTimeout(drainQueue, 0) }
    return
  }
  const item = {
    msg,
    key,
    targets: targetFlags,
    sent: { ws: false, gossip: false }
  }
  queue.push(item)
  if (key) { pending.set(key, item) }
  if (!drainTimer) { drainTimer = setTimeout(drainQueue, 0) }
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
