import { apds } from 'apds'
import { send } from './send.js'
import { queueSend } from './network_queue.js'
import { noteInterest } from './sync.js'
import { isBlockedAuthor } from './moderation.js'
import { attachCachedRows, getFeedRow, upsertFeedRow } from './feed_row_cache.js'
import { adaptiveConcurrency } from './adaptive_concurrency.js'
import { perfMeasure } from './perf.js'

const HOME_SEED_COUNT = 3
const HOME_BACKFILL_DEPTH = 6
const COMMUNITY_QUERY_CONCURRENCY = adaptiveConcurrency({ base: 4, min: 1, max: 8, type: 'network' })
const HOME_EXPAND_CONCURRENCY = adaptiveConcurrency({ base: 3, min: 1, max: 6 })
const FEED_ROWS_POLL_MS = 5000
const FEED_ROWS_ENABLED = false
const feedRowsEnabled = () => FEED_ROWS_ENABLED

const parseOpenedTimestamp = (opened) => {
  if (!opened || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isNaN(ts) ? 0 : ts
}

const isHash = (value) => typeof value === 'string' && value.length === 44

const getOpenedFromQuery = async (hash) => {
  if (!hash) { return null }
  const query = await apds.query(hash)
  if (Array.isArray(query) && query[0] && query[0].opened) {
    return query[0].opened
  }
  if (query && query.opened) {
    return query.opened
  }
  return null
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

const expandSeedChain = async (startHash, isActive) => {
  if (!startHash || !isActive()) { return [] }
  const discovered = []
  const visited = new Set([startHash])
  let cursor = startHash
  let depth = 0
  while (cursor && depth < HOME_BACKFILL_DEPTH && isActive()) {
    const sig = await apds.get(cursor)
    if (!sig) {
      queueSend(cursor, { priority: 'low' })
      break
    }
    const opened = await getOpenedFromQuery(cursor)
    if (!opened || opened.length < 14) { break }
    const contentHash = opened.substring(13)
    const content = await apds.get(contentHash)
    if (!content) {
      queueSend(contentHash, { priority: 'low' })
      break
    }
    const yaml = await apds.parseYaml(content)
    const previous = yaml?.previous
    if (!isHash(previous) || visited.has(previous)) { break }
    queueSend(previous, { priority: 'low' })
    const prevOpened = await getOpenedFromQuery(previous)
    const ts = parseOpenedTimestamp(prevOpened)
    discovered.push({ hash: previous, opened: prevOpened, ts, row: getFeedRow(previous) })
    visited.add(previous)
    cursor = previous
    depth += 1
  }
  return discovered
}

const expandHomeLog = async (log, isActive) => {
  if (!Array.isArray(log) || !log.length || !isActive()) { return log || [] }
  const entries = [...log]
  const seen = new Set(entries.map(entry => entry?.hash).filter(Boolean))
  const seeds = entries.slice(0, HOME_SEED_COUNT)
  const chains = await mapLimit(seeds, HOME_EXPAND_CONCURRENCY, async (seed) => {
    return expandSeedChain(seed?.hash, isActive)
  })
  for (const chain of chains) {
    if (!Array.isArray(chain) || !chain.length) { continue }
    for (const entry of chain) {
      if (!entry?.hash || seen.has(entry.hash)) { continue }
      entries.push(entry)
      seen.add(entry.hash)
    }
  }
  return entries
}

export class FeedOrchestrator {
  constructor({ src, signal = null, isActive = () => true, store }) {
    this.src = src
    this.signal = signal
    this.isActive = isActive
    this.store = store
    this.pollTimer = null
  }

  stop() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  async fetchFeedRows({ kind = 'home', key = '', since = 0, limit = 40, timeoutMs = 1800 } = {}) {
    if (!feedRowsEnabled()) { return { rows: [], nextSince: since } }
    const timeoutController = new AbortController()
    let externalAbort = null
    if (this.signal) {
      if (this.signal.aborted) { return { rows: [], nextSince: since } }
      externalAbort = () => timeoutController.abort()
      this.signal.addEventListener('abort', externalAbort, { once: true })
    }
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs)
    try {
      let path = '/feed-rows/home'
      if (kind === 'author') {
        path = '/feed-rows/author/' + encodeURIComponent(key || '')
      } else if (kind === 'alias') {
        path = '/feed-rows/alias/' + encodeURIComponent(key || '')
      }
      const url = new URL(path, window.location.origin)
      url.searchParams.set('since', String(since))
      url.searchParams.set('limit', String(limit))
      const res = await fetch(url.toString(), { cache: 'no-store', signal: timeoutController.signal })
      if (!res.ok) { return { rows: [], nextSince: since } }
      const data = await res.json().catch(() => null)
      const rows = Array.isArray(data?.rows) ? data.rows : []
      const nextSince = Number.isFinite(data?.nextSince) ? data.nextSince : since
      return { rows, nextSince }
    } catch {
      return { rows: [], nextSince: since }
    } finally {
      clearTimeout(timer)
      if (this.signal && externalAbort) {
        this.signal.removeEventListener('abort', externalAbort)
      }
    }
  }

  async mergeRows(rows) {
    if (!this.isActive()) { return 0 }
    const withCache = attachCachedRows(rows || [])
    withCache.forEach((row) => {
      if (row?.hash) { upsertFeedRow(row) }
    })
    return this.store.upsertMany(withCache)
  }

  async startHome() {
    let log = await perfMeasure('route.query', async () => apds.query(), 'home')
    if (!this.isActive()) { return { log: [] } }
    log = attachCachedRows(log || [])
    if (!this.isActive()) { return { log } }

    // Keep local feed as source of truth for initial paint. Remote feed rows are additive only.
    if (!feedRowsEnabled()) {
      void this.runHomeBackfill(log || [])
      return { log }
    }
    const since = this.store.getSince() || 0
    void (async () => {
      const seedRowsResult = await perfMeasure(
        'route.feedRows.home',
        async () => this.fetchFeedRows({ kind: 'home', since, limit: 50 }),
        'home'
      )
      if (!this.isActive()) { return }
      await this.mergeRows(seedRowsResult.rows || [])
      if (!this.isActive()) { return }
      this.startHomePolling(seedRowsResult.nextSince || this.store.getSince() || since)
    })()

    void this.runHomeBackfill(log || [])
    return { log }
  }

  startHomePolling(initialSince = 0) {
    if (!feedRowsEnabled()) { return }
    this.stop()
    const state = { since: initialSince }
    const tick = async () => {
      if (!this.isActive()) { return }
      const result = await this.fetchFeedRows({
        kind: 'home',
        since: state.since,
        limit: 30,
        timeoutMs: 2200
      })
      if (!this.isActive()) { return }
      state.since = Number.isFinite(result.nextSince) ? Math.max(state.since, result.nextSince) : state.since
      await this.mergeRows(result.rows || [])
      if (!this.isActive()) { return }
      this.pollTimer = setTimeout(() => { void tick() }, FEED_ROWS_POLL_MS)
    }
    this.pollTimer = setTimeout(() => { void tick() }, FEED_ROWS_POLL_MS)
  }

  async runHomeBackfill(log) {
    if (!this.isActive()) { return }
    const expanded = await expandHomeLog(log, this.isActive)
    if (!this.isActive()) { return }
    await this.store.upsertMany(expanded || [])
  }

  async startAuthor(pubkey) {
    const log = await perfMeasure('route.query', async () => apds.query(pubkey), 'pubkey')
    if (!this.isActive()) { return { log: [] } }
    const withCachedRows = attachCachedRows(log || [])

    if (!feedRowsEnabled()) {
      return { log: withCachedRows || [] }
    }
    const since = this.store.getSince() || 0
    void (async () => {
      const seedRowsResult = await perfMeasure(
        'route.feedRows.author',
        async () => this.fetchFeedRows({ kind: 'author', key: pubkey, since, limit: 50 }),
        'pubkey'
      )
      if (!this.isActive()) { return }
      await this.mergeRows(seedRowsResult.rows || [])
    })()

    return { log: withCachedRows || [] }
  }

  async startAlias(alias) {
    const ar = await perfMeasure(
      'route.directory.fetch',
      async () => fetch('https://pub.wiredove.net/' + alias).then(r => r.json()),
      'community'
    )
    if (!this.isActive()) { return { query: [], primaryKey: null } }
    if (ar) { localStorage.setItem(alias, JSON.stringify(ar)) }
    const pubkeys = Array.isArray(ar) ? ar : []
    const batched = await perfMeasure('route.community.queryBatch', async () => mapLimit(pubkeys, COMMUNITY_QUERY_CONCURRENCY, async (pubkey) => {
      if (!this.isActive()) { return [] }
      if (await isBlockedAuthor(pubkey)) { return [] }
      await noteInterest(pubkey)
      await send(pubkey)
      const q = await apds.query(pubkey)
      const rows = Array.isArray(q) ? q : (q ? [q] : [])
      const withCachedRows = attachCachedRows(rows)
      await this.store.upsertMany(withCachedRows)
      return withCachedRows
    }), 'community')
    if (!this.isActive()) { return { query: [], primaryKey: null } }
    const query = batched.flat()
    if (!feedRowsEnabled()) {
      const primaryKey = Array.isArray(ar) && ar.length ? ar[0] : null
      return { query, primaryKey }
    }
    const since = this.store.getSince() || 0
    void (async () => {
      const seedRowsResult = await perfMeasure(
        'route.feedRows.alias',
        async () => this.fetchFeedRows({ kind: 'alias', key: alias, since, limit: 50 }),
        'community'
      )
      if (!this.isActive()) { return }
      await this.mergeRows(seedRowsResult.rows || [])
    })()

    const primaryKey = Array.isArray(ar) && ar.length ? ar[0] : null
    return { query, primaryKey }
  }

  async startSearch(queryHash) {
    const log = await perfMeasure('route.query', async () => apds.query(queryHash), 'search')
    if (!this.isActive()) { return { log: [] } }
    const withCachedRows = attachCachedRows(log || [])
    return { log: withCachedRows || [] }
  }
}
