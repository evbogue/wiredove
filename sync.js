import { apds } from 'apds'
import { isBlockedAuthor } from './moderation.js'

const activity = new Map()

const TICK_MS = 15 * 1000
const REFRESH_MS = 5 * 60 * 1000
const BOOTSTRAP_MAX = 20

const HOT_INTEREST_MS = 15 * 60 * 1000
const HOT_SEEN_MS = 24 * 60 * 60 * 1000
const WARM_INTEREST_MS = 24 * 60 * 60 * 1000
const WARM_SEEN_MS = 30 * 24 * 60 * 60 * 1000

const MIN_REQUEST_MS = {
  hot: 15 * 1000,
  warm: 20 * 60 * 1000,
  cold: 6 * 60 * 60 * 1000
}

const BATCH = {
  hot: 4,
  warm: 2,
  cold: 1
}

let pubkeys = []
let tiered = { hot: [], warm: [], cold: [] }
let tierIndex = { hot: 0, warm: 0, cold: 0 }
let syncTimer = null
let lastRefresh = 0
let needsRebuild = true
let tickRunning = false

const nowMs = () => Date.now()

const getEntry = (pubkey) => {
  const existing = activity.get(pubkey)
  if (existing) { return existing }
  const entry = { lastSeen: 0, lastInterest: 0, lastRequested: 0 }
  activity.set(pubkey, entry)
  return entry
}

const parseOpenedTimestamp = (opened) => {
  if (!opened || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isNaN(ts) ? 0 : ts
}

const classify = (entry, now) => {
  const seenAge = entry.lastSeen ? now - entry.lastSeen : Infinity
  const interestAge = entry.lastInterest ? now - entry.lastInterest : Infinity
  if (interestAge <= HOT_INTEREST_MS || seenAge <= HOT_SEEN_MS) { return 'hot' }
  if (interestAge <= WARM_INTEREST_MS || seenAge <= WARM_SEEN_MS) { return 'warm' }
  return 'cold'
}

const rebuildTiers = () => {
  const next = { hot: [], warm: [], cold: [] }
  const now = nowMs()
  pubkeys.forEach(pubkey => {
    const entry = getEntry(pubkey)
    next[classify(entry, now)].push(pubkey)
  })
  tiered = next
  tierIndex = { hot: 0, warm: 0, cold: 0 }
  needsRebuild = false
}

const pickCandidates = (tier, count, now) => {
  const list = tiered[tier]
  if (!list.length) { return [] }
  const picked = []
  let attempts = 0
  while (picked.length < count && attempts < list.length) {
    const idx = tierIndex[tier] % list.length
    tierIndex[tier] = (tierIndex[tier] + 1) % list.length
    const pubkey = list[idx]
    const entry = getEntry(pubkey)
    if (now - entry.lastRequested >= MIN_REQUEST_MS[tier]) {
      picked.push(pubkey)
    }
    attempts += 1
  }
  return picked
}

const bootstrapActivity = async () => {
  let count = 0
  for (const pubkey of pubkeys) {
    if (count >= BOOTSTRAP_MAX) { break }
    const entry = getEntry(pubkey)
    if (entry.lastSeen) { continue }
    const latest = await apds.getLatest(pubkey)
    const opened = latest?.opened
    const ts = parseOpenedTimestamp(opened)
    if (ts) { entry.lastSeen = ts }
    count += 1
  }
}

const refreshPubkeys = async () => {
  try {
    const next = await apds.getPubkeys()
    pubkeys = Array.isArray(next) ? next : []
  } catch (err) {
    console.warn('getPubkeys failed', err)
    pubkeys = []
  }
  const filtered = []
  for (const pubkey of pubkeys) {
    if (!pubkey || pubkey.length !== 44) { continue }
    if (await isBlockedAuthor(pubkey)) { continue }
    filtered.push(pubkey)
  }
  pubkeys = filtered
  lastRefresh = nowMs()
  needsRebuild = true
  await bootstrapActivity()
}

export const noteSeen = async (pubkey) => {
  if (!pubkey || pubkey.length !== 44) { return }
  if (await isBlockedAuthor(pubkey)) { return }
  const entry = getEntry(pubkey)
  entry.lastSeen = nowMs()
  needsRebuild = true
}

export const noteInterest = async (pubkey) => {
  if (!pubkey || pubkey.length !== 44) { return }
  if (await isBlockedAuthor(pubkey)) { return }
  const entry = getEntry(pubkey)
  entry.lastInterest = nowMs()
  needsRebuild = true
}

export const startSync = async (sendFn) => {
  if (syncTimer) { return }
  await refreshPubkeys()
  syncTimer = setInterval(async () => {
    if (tickRunning) { return }
    tickRunning = true
    try {
    const now = nowMs()
    if (now - lastRefresh > REFRESH_MS) {
      await refreshPubkeys()
    }
    if (needsRebuild) { rebuildTiers() }
    const hot = pickCandidates('hot', BATCH.hot, now)
    const warm = pickCandidates('warm', BATCH.warm, now)
    const cold = pickCandidates('cold', BATCH.cold, now)
    const batch = [...hot, ...warm, ...cold]
    batch.forEach(pubkey => {
      const entry = getEntry(pubkey)
      entry.lastRequested = now
      sendFn(pubkey)
    })
    } finally {
      tickRunning = false
    }
  }, TICK_MS)
}
