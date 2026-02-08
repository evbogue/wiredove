import { apds } from 'apds'

const replyIndex = new Map()
let buildPromise = null
let built = false

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

const indexLogMessage = async (msg) => {
  if (!msg || !msg.hash || !msg.text) { return false }
  const yaml = await apds.parseYaml(msg.text)
  const parent = getReplyParent(yaml)
  if (!parent) { return false }
  return addReplyToIndex(parent, msg.hash, msg.ts, msg.opened || null)
}

const buildFromLog = async (log = null) => {
  const source = log || await apds.getOpenedLog()
  if (!Array.isArray(source) || !source.length) { return }
  for (const msg of source) {
    await indexLogMessage(msg)
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
