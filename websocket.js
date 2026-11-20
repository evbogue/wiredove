import { apds } from 'apds'
import { deliverToRenderers } from './client/runtime/render-delivery.js'
import { noteReceived, registerNetworkSenders } from './network_queue.js'
import { getModerationState, isBlockedAuthor } from './moderation.js'
import { adaptiveConcurrency } from './adaptive_concurrency.js'
import { perfMeasure, perfStart, perfEnd } from './perf.js'

const pubs = new Set()
let generation = 0
let primaryRelay = null
const connections = new Map()
const HTTP_POLL_INTERVAL_MS = 5000
const RECENT_LATEST_WINDOW_MS = 24 * 60 * 60 * 1000
const INCOMING_BATCH_CONCURRENCY = adaptiveConcurrency({ base: 6, min: 2, max: 10, type: 'network' })
const pollHistory = new Map()
const DEFAULT_CONFIRM_TIMEOUT_MS = 12000
const DEFAULT_CONFIRM_INTERVAL_MS = 600
const DEFAULT_CONFIRM_LOOKBACK_MS = 2 * 60 * 1000

let wsReadyResolver
const createWsReadyPromise = () => new Promise(resolve => {
  wsReadyResolver = resolve
})
export let wsReady = createWsReadyPromise()

const isWsOpen = (ws) => ws && ws.readyState === WebSocket.OPEN

const safeWsSend = (ws, msg) => {
  if (!isWsOpen(ws)) { return false }
  try {
    ws.send(msg)
    return true
  } catch (err) {
    console.warn('ws send failed', err)
    return false
  }
}

const deliverWs = (msg) => {
  pubs.forEach(pub => {
    const sent = safeWsSend(pub, msg)
    if (!sent && pub.readyState !== WebSocket.CONNECTING) {
      pubs.delete(pub)
    }
  })
}

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

const processIncomingBatch = async (messages, state) => {
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
    if (!state.abort.signal.aborted) await handleIncoming(msg, state)
  })
  perfEnd(token)
}

const handleIncoming = async (msg, state) => {
  const current = generation
  if (!isHash(msg)) noteReceived(msg)
  if (isHash(msg)) {
    const blob = await apds.get(msg)
    if (current !== generation || state?.abort.signal.aborted) return
    if (blob) {
      if (pubs.size) {
        deliverWs(blob)
      } else {
        await sendHttp(blob, state)
      }
    }
    return
  }
  const author = msg.substring(0, 44)
  if (await isBlockedAuthor(author) || state?.abort.signal.aborted) { return }
  await deliverToRenderers('shouldWe', msg)
  await apds.make(msg)
  await apds.add(msg)
  await deliverToRenderers('blob', msg)
}

const toHttpBase = (wsUrl) => wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalizeSince = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) { return 0 }
  return Math.max(0, Math.floor(parsed))
}

const pollHttpSince = async (state, since) => {
  const url = new URL('/gossip/poll', state.baseUrl)
  url.searchParams.set('since', String(normalizeSince(since)))
  try {
    const signal = AbortSignal.any([state.abort.signal, AbortSignal.timeout(5000)])
    const response = await perfMeasure('net.http.poll', () => fetch(url, { cache: 'no-store', signal }))
    if (!response.ok) return null
    const data = await response.json()
    if (!Array.isArray(data.messages)) return null
    return { messages: data.messages, nextSince: Number.isFinite(data.nextSince) ? data.nextSince : since }
  } catch {
    return null
  }
}

const pollHttp = async state => {
  const signal = state.abort.signal
  if (signal.aborted) return
  let delay = HTTP_POLL_INTERVAL_MS
  try {
    if (!state.catchUp && isWsOpen(state.socket)) {
      state.polling = 'Standby'
      return
    }
    const polled = await pollHttpSince(state, state.history.lastSince)
    if (signal.aborted) return
    if (!polled) { state.polling = 'Unavailable'; return }
    await processIncomingBatch(polled.messages, state)
    if (signal.aborted) return
    state.polling = 'Active'
    state.history.lastPollAt = Date.now()
    if (state.catchUp && polled.messages.length >= 200 && polled.nextSince > state.history.lastSince) delay = 0
    state.history.lastSince = Math.max(state.history.lastSince, polled.nextSince)
  } catch (error) {
    if (!signal.aborted) {
      state.polling = 'Unavailable'
      console.warn('APDS poll processing failed', error)
    }
  } finally {
    if (!signal.aborted) state.pollTimer = setTimeout(() => void pollHttp(state), delay)
  }
}

const sendHttp = async (msg, state = connections.get(primaryRelay)) => {
  if (!state || state.readOnly) return
  const signal = state.abort.signal
  try {
    const response = await perfMeasure('net.http.send', () => fetch(new URL('/gossip', state.baseUrl), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, body: msg,
    }))
    if (!response.ok) return
    const data = await response.json()
    if (!signal.aborted) await processIncomingBatch(data.messages, state)
  } catch (err) {
    if (!signal.aborted) console.warn('http gossip send failed', err)
  }
}

export const getRelayStatus = (url = primaryRelay) => {
  const state = connections.get(url)
  return {
    enabled: !!state,
    connected: pubs.has(state?.socket),
    polling: state?.polling || 'Off',
    lastPollAt: pollHistory.get(url)?.lastPollAt ?? null,
  }
}

export const sendWs = async (msg) => {
  deliverWs(msg)
  await Promise.all([...connections.values()].filter(state => !isWsOpen(state.socket)).map(state => sendHttp(msg, state)))
}

export const hasWs = () => [...connections.values()].some(state => !state.readOnly)

export const confirmMessagesPersisted = async (messages, options = {}) => {
  const targets = Array.from(new Set((messages || []).filter((msg) => typeof msg === 'string' && msg.length)))
  if (!targets.length) { return { ok: true, missing: [], attempts: 0 } }
  const relay = connections.get(primaryRelay)
  if (!relay) {
    return { ok: false, missing: targets, attempts: 0, reason: 'unconfirmed' }
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_CONFIRM_TIMEOUT_MS
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : DEFAULT_CONFIRM_INTERVAL_MS
  const lookbackMs = Number.isFinite(options.lookbackMs) ? options.lookbackMs : DEFAULT_CONFIRM_LOOKBACK_MS
  const deadline = Date.now() + Math.max(500, timeoutMs)
  const pending = new Set(targets)
  let cursor = normalizeSince(options.since ?? (Date.now() - lookbackMs))
  let attempts = 0

  while (!relay.abort.signal.aborted && Date.now() <= deadline && pending.size) {
    attempts += 1
    const polled = await pollHttpSince(relay, cursor)
    if (polled) {
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

export const makeWs = async (pub, { waitForReady = true, catchUp = false, primary = false, readOnly = false, waitForInitialPoll = false } = {}) => {
  if (connections.has(pub)) return waitForReady ? wsReady : undefined
  if (!readOnly && (primary || !primaryRelay)) primaryRelay = pub
  if (!pollHistory.has(pub)) pollHistory.set(pub, { lastSince: 0, lastPollAt: null })
  const state = {
    delayMs: 1000, timer: null, socket: null, abort: new AbortController(),
    baseUrl: toHttpBase(pub), catchUp, readOnly, history: pollHistory.get(pub), polling: 'Waiting', pollTimer: null,
  }
  connections.set(pub, state)
  const active = () => connections.get(pub) === state

  const scheduleReconnect = () => {
    if (!active() || state.timer) return
    state.timer = setTimeout(() => {
      state.timer = null
      connectWs()
      state.delayMs = Math.min(state.delayMs * 2, 60000)
    }, state.delayMs)
  }

  const connectWs = () => {
    if (!active()) return
    const ws = new WebSocket(pub)
    state.socket = ws

    ws.onopen = async () => {
      if (!active()) { ws.close(); return }
      pubs.add(ws)
      state.delayMs = 1000
      wsReadyResolver?.()
      const now = Date.now()
      let pubkeys = []
      try {
        const next = await apds.getPubkeys()
        pubkeys = Array.isArray(next) ? next : []
      } catch (err) {
        console.warn('getPubkeys failed', err)
      }
      const moderation = await getModerationState()
      const blocked = new Set(moderation.blockedAuthors || [])
      const announceable = pubkeys.filter(key => !blocked.has(key))
      await mapLimit(announceable, INCOMING_BATCH_CONCURRENCY, async key => {
        if (!active() || !safeWsSend(ws, key)) return
        const latest = await apds.getLatest(key)
        const openedTs = parseOpenedTimestamp(latest?.opened)
        if (active() && openedTs && now - openedTs <= RECENT_LATEST_WINDOW_MS && latest.sig) {
          safeWsSend(ws, latest.sig)
        }
      })
    }

    ws.onmessage = async event => {
      if (active()) await handleIncoming(event.data, state)
    }

    ws.onerror = () => {
      if (active()) ws.close()
    }

    ws.onclose = () => {
      pubs.delete(ws)
      if (state.socket === ws) state.socket = null
      if (!pubs.size) wsReady = createWsReadyPromise()
      scheduleReconnect()
    }
  }

  const httpOnly = readOnly || /^https?:/.test(pub)
  try {
    if (!httpOnly) connectWs()
  } catch (error) {
    stopWs(pub)
    throw error
  }
  const initialPoll = pollHttp(state)
  if (waitForInitialPoll) await initialPoll
  return waitForReady && !httpOnly ? wsReady : undefined
}

export const stopWs = pub => {
  const state = connections.get(pub)
  if (!state) return
  connections.delete(pub)
  state.abort.abort()
  clearTimeout(state.pollTimer)
  clearTimeout(state.timer)
  const ws = state.socket
  if (ws) {
    pubs.delete(ws)
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    ws.close()
  }
  if (!pubs.size) wsReady = createWsReadyPromise()
  if (primaryRelay === pub) primaryRelay = [...connections].find(([, entry]) => !entry.readOnly)?.[0] ?? null
}

export const stopNetwork = () => {
  generation += 1
  primaryRelay = null
  pollHistory.clear()
  for (const pub of connections.keys()) stopWs(pub)
  wsReady = createWsReadyPromise()
}
