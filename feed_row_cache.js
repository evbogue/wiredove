const CACHE_KEY = 'wiredove.feedRowCache.v1'
const MAX_ROWS = 3000

let rows = null
let persistTimer = null

const nowMs = () => Date.now()

const loadRows = () => {
  if (rows) { return rows }
  rows = new Map()
  if (typeof localStorage === 'undefined') { return rows }
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) { return rows }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) { return rows }
    for (const item of parsed) {
      if (!item || typeof item.hash !== 'string' || item.hash.length !== 44) { continue }
      rows.set(item.hash, item)
    }
  } catch (err) {
    console.warn('feed row cache load failed', err)
  }
  return rows
}

const schedulePersist = () => {
  if (persistTimer) { return }
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (typeof localStorage === 'undefined') { return }
    try {
      const data = Array.from(loadRows().values())
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch (err) {
      console.warn('feed row cache persist failed', err)
    }
  }, 500)
}

const trimRows = () => {
  const map = loadRows()
  while (map.size > MAX_ROWS) {
    const firstKey = map.keys().next().value
    if (!firstKey) { break }
    map.delete(firstKey)
  }
}

export const parseOpenedTimestamp = (opened) => {
  if (!opened || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isFinite(ts) ? ts : 0
}

const summarize = (txt, maxLen = 140) => {
  if (!txt || typeof txt !== 'string') { return '' }
  const single = txt.replace(/\s+/g, ' ').trim()
  if (single.length <= maxLen) { return single }
  return single.substring(0, maxLen) + '...'
}

export const makeFeedRow = ({ hash, opened = null, author = '', contentHash = '', yaml = null, ts = 0 } = {}) => {
  if (!hash || typeof hash !== 'string' || hash.length !== 44) { return null }
  const openedTs = ts || parseOpenedTimestamp(opened)
  const preview = yaml && yaml.body
    ? summarize(yaml.body)
    : (yaml && yaml.bio ? summarize(yaml.bio) : '')
  const name = yaml && yaml.name ? yaml.name.trim() : ''
  return {
    hash,
    ts: openedTs || 0,
    opened: opened || null,
    author: author || '',
    contentHash: contentHash || '',
    name,
    preview,
    replyCount: 0,
    updatedAt: nowMs()
  }
}

export const upsertFeedRow = (row) => {
  if (!row || !row.hash) { return false }
  const map = loadRows()
  const prev = map.get(row.hash) || {}
  const next = {
    ...prev,
    ...row,
    updatedAt: nowMs()
  }
  map.delete(row.hash)
  map.set(row.hash, next)
  trimRows()
  schedulePersist()
  return true
}

export const getFeedRow = (hash) => {
  if (!hash || typeof hash !== 'string') { return null }
  const map = loadRows()
  return map.get(hash) || null
}

export const attachCachedRows = (log) => {
  if (!Array.isArray(log) || !log.length) { return log || [] }
  const map = loadRows()
  return log.map((entry) => {
    if (!entry || !entry.hash) { return entry }
    const row = map.get(entry.hash)
    if (!row) { return entry }
    return { ...entry, row }
  })
}
