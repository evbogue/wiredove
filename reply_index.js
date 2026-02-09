import { apds } from 'apds'
import { adaptiveConcurrency } from './adaptive_concurrency.js'

const replyIndex = new Map()
let buildPromise = null
let built = false
const INDEX_PARSE_CONCURRENCY = adaptiveConcurrency({ base: 8, min: 2, max: 12 })

const parseOpenedTimestamp = (opened) => {
  if (!opened || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isNaN(ts) ? 0 : ts
}

const normalizeTs = (ts, opened) => {
  const parsed = Number.parseInt(ts || '0', 10)
  if (Number.isFinite(parsed) && parsed > 0) { return parsed }
  return parseOpenedTimestamp(opened)
}

const getReplyParent = (yaml) => {
  if (!yaml) { return null }
  return yaml.replyHash || yaml.reply || null
}

export const addReplyToIndex = (parentHash, replyHash, ts = 0, opened = null) => {
  if (!parentHash || !replyHash) { return false }
  const list = replyIndex.get(parentHash) || []
  if (list.some(item => item.hash === replyHash)) { return false }
  list.push({ hash: replyHash, ts: normalizeTs(ts, opened), opened })
  replyIndex.set(parentHash, list)
  return true
}

const mapLimit = async (items, limit, worker) => {
  if (!Array.isArray(items) || !items.length) { return [] }
  const results = new Array(items.length)
  let cursor = 0
  const lanes = Math.max(1, Math.min(limit, items.length))
  const runLane = async () => {
    while (true) {
      const index = cursor
      if (index >= items.length) { return }
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => runLane()))
  return results
}

const indexLogMessage = async (msg) => {
  if (!msg || !msg.hash || !msg.text) { return null }
  const yaml = await apds.parseYaml(msg.text)
  const parent = getReplyParent(yaml)
  if (!parent) { return null }
  return {
    parent,
    hash: msg.hash,
    ts: msg.ts,
    opened: msg.opened || null
  }
}

const buildFromLog = async (log = null) => {
  const source = log || await apds.getOpenedLog()
  if (!Array.isArray(source) || !source.length) { return }
  const indexed = await mapLimit(source, INDEX_PARSE_CONCURRENCY, async (msg) => {
    return indexLogMessage(msg)
  })
  for (const entry of indexed) {
    if (!entry) { continue }
    addReplyToIndex(entry.parent, entry.hash, entry.ts, entry.opened)
  }
}

export const ensureReplyIndex = async (log = null) => {
  if (built) { return }
  if (buildPromise) {
    await buildPromise
    return
  }
  buildPromise = (async () => {
    await buildFromLog(log)
    built = true
  })()
  try {
    await buildPromise
  } finally {
    buildPromise = null
  }
}

export const getRepliesForParent = (parentHash) => replyIndex.get(parentHash) || []

export const getReplyCount = (parentHash) => getRepliesForParent(parentHash).length
