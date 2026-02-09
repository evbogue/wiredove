import { getFeedRow, parseOpenedTimestamp, upsertFeedRow } from './feed_row_cache.js'

const normalizeTs = (entry) => {
  if (!entry) { return 0 }
  if (entry.ts) {
    const parsed = Number.parseInt(entry.ts, 10)
    if (Number.isFinite(parsed) && parsed > 0) { return parsed }
  }
  return parseOpenedTimestamp(entry.opened)
}

export class FeedStore {
  constructor(src, options = {}) {
    this.src = src
    this.entries = new Map()
    this.isActive = typeof options.isActive === 'function' ? options.isActive : () => true
    this.since = 0
  }

  normalize(entry) {
    if (!entry || !entry.hash) { return null }
    const ts = normalizeTs(entry)
    const cachedRow = entry.row || getFeedRow(entry.hash)
    if (cachedRow) {
      upsertFeedRow(cachedRow)
    }
    return {
      hash: entry.hash,
      opened: entry.opened || null,
      ts,
      row: cachedRow || null
    }
  }

  async upsert(entry) {
    if (!this.isActive()) { return false }
    const normalized = this.normalize(entry)
    if (!normalized || !normalized.ts) { return false }
    const prev = this.entries.get(normalized.hash)
    if (prev && prev.ts >= normalized.ts && prev.row && !normalized.row) {
      normalized.row = prev.row
    }
    this.entries.set(normalized.hash, normalized)
    this.since = Math.max(this.since, normalized.ts)
    if (!this.isActive()) { return false }
    await window.__feedEnqueue?.(this.src, normalized)
    return true
  }

  async upsertMany(entries) {
    if (!Array.isArray(entries) || !entries.length) { return 0 }
    let count = 0
    for (const entry of entries) {
      if (!this.isActive()) { break }
      const ok = await this.upsert(entry)
      if (ok) { count += 1 }
    }
    return count
  }

  getSince() {
    return this.since
  }
}
