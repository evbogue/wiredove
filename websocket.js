import { apds } from 'apds'
import { render } from './render.js'
import { noteReceived, registerNetworkSenders } from './network_queue.js'
import { getModerationState, isBlockedAuthor } from './moderation.js'
import { adaptiveConcurrency } from './adaptive_concurrency.js'
import { perfMeasure, perfStart, perfEnd } from './perf.js'

const HTTP_POLL_INTERVAL_MS = 5000
const INCOMING_BATCH_CONCURRENCY = adaptiveConcurrency({ base: 6, min: 2, max: 10, type: 'network' })
const httpState = {
  baseUrl: null,
  ready: false,
  pollTimer: null,
  lastSince: 0,
  cursor: '',
  announced: false
}
const DEFAULT_CONFIRM_TIMEOUT_MS = 12000
const DEFAULT_CONFIRM_INTERVAL_MS = 600
const DEFAULT_CONFIRM_LOOKBACK_MS = 2 * 60 * 1000

export const wsReady = Promise.resolve()

const isHash = (msg) => typeof msg === 'string' && msg.length === 44
const parseOpenedTimestamp = (opened) => {
  if (typeof opened !== 'string' || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isFinite(ts) ? ts : 0
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

const processIncomingBatch = async (messages) => {
  if (!Array.isArray(messages) || !messages.length) { return }
  const token = perfStart('net.batch.process')
  const seen = new Set()
  const deduped = messages.filter((msg) => {
    if (typeof msg !== 'string' || !msg.length) { return false }
    if (seen.has(msg)) { return false }
    seen.add(msg)
    return true
  })
  await mapLimit(deduped, INCOMING_BATCH_CONCURRENCY, async (msg) => {
    await handleIncoming(msg)
  })
  perfEnd(token)
}

const handleIncoming = async (msg) => {
  noteReceived(msg)
  if (isHash(msg)) {
    const blob = await apds.get(msg)
    if (blob) {
      await sendHttp(blob)
    }
    return
  }
  const author = msg.substring(0, 44)
  if (await isBlockedAuthor(author)) { return }
  await render.shouldWe(msg)
  await apds.make(msg)
  await apds.add(msg)
  await render.blob(msg)
}

const toHttpBase = (wsUrl) => wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalizeSince = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) { return 0 }
  return Math.max(0, Math.floor(parsed))
}

const applyHttpProgress = (data) => {
  if (!data || typeof data !== 'object') { return }
  if (typeof data.nextCursor === 'string' && data.nextCursor.length) {
    httpState.cursor = data.nextCursor
  }
  if (Number.isFinite(data.nextSince)) {
    httpState.lastSince = Math.max(httpState.lastSince, normalizeSince(data.nextSince))
  }
}

const resetHttpCursor = () => {
  httpState.cursor = ''
  httpState.announced = false
}

const pollHttpSince = async (since, options = {}) => {
  if (!httpState.ready || !httpState.baseUrl) { return null }
  const preferSince = options?.preferSince === true
  try {
    const url = new URL('/gossip/poll', httpState.baseUrl)
    if (!preferSince && httpState.cursor) {
      url.searchParams.set('cursor', httpState.cursor)
    } else {
      url.searchParams.set('since', String(normalizeSince(since)))
    }
    const res = await perfMeasure('net.http.poll', async () => fetch(url.toString(), { cache: 'no-store' }))
    if (res.status === 400) {
      const data = await res.json().catch(() => ({}))
      if (data?.error === 'invalid-cursor') {
        resetHttpCursor()
      }
      return { ok: false, status: res.status, invalidCursor: true }
    }
    if (!res.ok) { return { ok: false, status: res.status } }
    const data = await res.json()
    applyHttpProgress(data)
    return {
      ok: true,
      messages: Array.isArray(data.messages) ? data.messages : [],
      nextSince: Number.isFinite(data.nextSince) ? data.nextSince : null,
      nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : ''
    }
  } catch (err) {
    console.warn('http gossip poll failed', err)
    return { ok: false, error: err }
  }
}

const announceHttp = async () => {
  if (!httpState.ready || !httpState.baseUrl) { return null }
  try {
    let authors = []
    try {
      const next = await apds.getPubkeys()
      authors = Array.isArray(next) ? next : []
    } catch (err) {
      console.warn('http announce pubkeys failed', err)
    }
    const moderation = await getModerationState()
    const blocked = new Set(moderation.blockedAuthors || [])
    const announceable = authors.filter((pub) => !blocked.has(pub))
    const url = new URL('/gossip/announce', httpState.baseUrl)
    const res = await perfMeasure('net.http.announce', async () => fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authors: announceable,
        wantHashes: [],
        cursor: httpState.cursor,
        capabilities: {
          rows: true,
          blobs: true,
          cursorResume: true,
          batchPublish: true
        }
      })
    }))
    if (res.status === 400) {
      const data = await res.json().catch(() => ({}))
      if (data?.error === 'invalid-cursor') {
        resetHttpCursor()
      }
      return { ok: false, status: res.status, invalidCursor: true }
    }
    if (!res.ok) { return { ok: false, status: res.status } }
    const data = await res.json()
    applyHttpProgress(data)
    httpState.announced = true
    return {
      ok: true,
      messages: Array.isArray(data.messages) ? data.messages : [],
      nextSince: Number.isFinite(data.nextSince) ? data.nextSince : null,
      nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : ''
    }
  } catch (err) {
    console.warn('http gossip announce failed', err)
    return { ok: false, error: err }
  }
}

const scheduleHttpPoll = () => {
  if (httpState.pollTimer) { return }
  httpState.pollTimer = setTimeout(pollHttp, HTTP_POLL_INTERVAL_MS)
}

const pollHttp = async () => {
  httpState.pollTimer = null
  if (!httpState.ready) {
    scheduleHttpPoll()
    return
  }
  try {
    if (!httpState.announced) {
      const announced = await announceHttp()
      if (announced?.ok) {
        await processIncomingBatch(announced.messages)
      }
    }
    const polled = await pollHttpSince(httpState.lastSince)
    if (polled?.ok) {
      await processIncomingBatch(polled.messages)
    }
  } finally {
    scheduleHttpPoll()
  }
}

const sendHttp = async (msg) => {
  if (!httpState.ready) { return }
  try {
    const url = new URL('/gossip/publish', httpState.baseUrl)
    const res = await perfMeasure('net.http.send', async () => fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [msg], blobs: [] })
    }))
    if (!res.ok) { return }
    const data = await res.json()
    applyHttpProgress(data)
    const messages = Array.isArray(data.messages) ? data.messages : []
    await processIncomingBatch(messages)
  } catch (err) {
    console.warn('http gossip send failed', err)
  }
}

export const startHttpGossip = async (baseUrl) => {
  if (httpState.ready) { return }
  httpState.baseUrl = baseUrl
  httpState.ready = true
  httpState.announced = false
  try {
    const q = await apds.query()
    if (q && q.length) {
      let ts = 0
      q.forEach((entry) => {
        const value = Number.parseInt(entry?.ts || '0', 10)
        if (Number.isFinite(value) && value > ts) { ts = value }
      })
      if (Number.isFinite(ts)) {
        httpState.lastSince = ts
      }
    }
  } catch (err) {
    console.warn('http gossip seed failed', err)
  }
  httpState.cursor = ''
  const announced = await announceHttp()
  if (announced?.ok) {
    await processIncomingBatch(announced.messages)
  }
  void pollHttp()
  scheduleHttpPoll()
}

export const sendWs = async (msg) => {
  await sendHttp(msg)
}

export const hasWs = () => httpState.ready

export const confirmMessagesPersisted = async (messages, options = {}) => {
  const targets = Array.from(new Set((messages || []).filter((msg) => typeof msg === 'string' && msg.length)))
  if (!targets.length) { return { ok: true, missing: [], attempts: 0 } }
  if (!httpState.ready || !httpState.baseUrl) {
    return { ok: false, missing: targets, attempts: 0, reason: 'unconfirmed' }
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_CONFIRM_TIMEOUT_MS
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : DEFAULT_CONFIRM_INTERVAL_MS
  const lookbackMs = Number.isFinite(options.lookbackMs) ? options.lookbackMs : DEFAULT_CONFIRM_LOOKBACK_MS
  const deadline = Date.now() + Math.max(500, timeoutMs)
  const pending = new Set(targets)
  let cursor = normalizeSince(options.since ?? (Date.now() - lookbackMs))
  let attempts = 0

  while (Date.now() <= deadline && pending.size) {
    attempts += 1
    const polled = await pollHttpSince(cursor, { preferSince: true })
    if (polled?.ok) {
      polled.messages.forEach((msg) => pending.delete(msg))
      if (Number.isFinite(polled.nextSince)) {
        cursor = Math.max(cursor, normalizeSince(polled.nextSince))
      }
      if (!pending.size) {
        return { ok: true, missing: [], attempts }
      }
    }
    if (Date.now() + intervalMs > deadline) { break }
    await sleep(intervalMs)
  }

  return { ok: false, missing: Array.from(pending), attempts, reason: 'unconfirmed' }
}

registerNetworkSenders({
  sendWs,
  hasWs
})

export const makeWs = async (pub) => {
  // Websocket transport is intentionally disabled. HTTP gossip now provides the
  // primary sync path and is simpler to operate across restrictive/mobile
  // environments, so this bootstrap only starts the HTTP layer.
  const httpBase = toHttpBase(pub)
  await startHttpGossip(httpBase)
  return wsReady
}
