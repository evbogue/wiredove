import { apds } from 'apds'
import { render } from './render.js'
import { noteReceived, registerNetworkSenders } from './network_queue.js'
import { getModerationState, isBlockedAuthor } from './moderation.js'
import { adaptiveConcurrency } from './adaptive_concurrency.js'
import { perfMeasure, perfStart, perfEnd } from './perf.js'

const pubs = new Set()
const wsBackoff = new Map()
const HTTP_POLL_INTERVAL_MS = 5000
const RECENT_LATEST_WINDOW_MS = 24 * 60 * 60 * 1000
const INCOMING_BATCH_CONCURRENCY = adaptiveConcurrency({ base: 6, min: 2, max: 10, type: 'network' })
const httpState = {
  baseUrl: null,
  ready: false,
  pollTimer: null,
  lastSince: 0
}

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
      if (pubs.size) {
        deliverWs(blob)
      } else {
        await sendHttp(blob)
      }
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

const scheduleHttpPoll = () => {
  if (httpState.pollTimer) { return }
  httpState.pollTimer = setTimeout(pollHttp, HTTP_POLL_INTERVAL_MS)
}

const pollHttp = async () => {
  httpState.pollTimer = null
  if (!httpState.ready || pubs.size) {
    scheduleHttpPoll()
    return
  }
  try {
    const url = new URL('/gossip/poll', httpState.baseUrl)
    url.searchParams.set('since', String(httpState.lastSince))
    const res = await perfMeasure('net.http.poll', async () => fetch(url.toString(), { cache: 'no-store' }))
    if (res.ok) {
      const data = await res.json()
      const messages = Array.isArray(data.messages) ? data.messages : []
      await processIncomingBatch(messages)
      if (Number.isFinite(data.nextSince)) {
        httpState.lastSince = Math.max(httpState.lastSince, data.nextSince)
      }
    }
  } catch (err) {
    console.warn('http gossip poll failed', err)
  } finally {
    scheduleHttpPoll()
  }
}

const sendHttp = async (msg) => {
  if (!httpState.ready) { return }
  try {
    const url = new URL('/gossip', httpState.baseUrl)
    const res = await perfMeasure('net.http.send', async () => fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: msg
    }))
    if (!res.ok) { return }
    const data = await res.json()
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
  void pollHttp()
  scheduleHttpPoll()
}

export const sendWs = async (msg) => {
  if (pubs.size) {
    deliverWs(msg)
  } else {
    await sendHttp(msg)
  }
}

export const hasWs = () => pubs.size > 0 || httpState.ready

registerNetworkSenders({
  sendWs,
  hasWs
})

export const makeWs = async (pub) => {
  const httpBase = toHttpBase(pub)
  await startHttpGossip(httpBase)

  const getBackoff = () => {
    let state = wsBackoff.get(pub)
    if (!state) {
      state = { delayMs: 1000, timer: null }
      wsBackoff.set(pub, state)
    }
    return state
  }

  const scheduleReconnect = () => {
    const state = getBackoff()
    if (state.timer) return
    state.timer = setTimeout(() => {
      state.timer = null
      connectWs()
      state.delayMs *= 2
    }, state.delayMs)
  }

  const resetBackoff = () => {
    const state = getBackoff()
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }
    state.delayMs = 1000
  }

  const connectWs = () => {
    const ws = new WebSocket(pub)

    ws.onopen = async () => {
      console.log('OPEN')
    pubs.add(ws)
    resetBackoff()
    wsReadyResolver?.()
    const now = Date.now()
    let pubkeys = []
      try {
        const next = await apds.getPubkeys()
        pubkeys = Array.isArray(next) ? next : []
      } catch (err) {
        console.warn('getPubkeys failed', err)
        pubkeys = []
      }
      const moderation = await getModerationState()
      const blocked = new Set(moderation.blockedAuthors || [])
      const announceable = pubkeys.filter((pub) => !blocked.has(pub))
      await mapLimit(announceable, INCOMING_BATCH_CONCURRENCY, async (pub) => {
        if (!safeWsSend(ws, pub)) { return }
        const latest = await apds.getLatest(pub)
        if (!latest) { return }
        const openedTs = parseOpenedTimestamp(latest.opened)
        if (!openedTs || now - openedTs > RECENT_LATEST_WINDOW_MS) { return }
        if (!latest.sig) { return }
        safeWsSend(ws, latest.sig)
      })
      //below sends everything in the client to a dovepub pds server
      //const log = await apds.query()
      //if (log) {
      //  const ar = []
      //  for (const msg of log) {
      //    ws.send(msg.sig)
      //    if (msg.text) {
      //      ws.send(msg.text)
      //      const yaml = await apds.parseYaml(msg.text)
      //      //console.log(yaml)
      //      if (yaml.image && !ar.includes(yaml.image)) {
      //        const get = await apds.get(yaml.image)
      //        if (get) {
      //          ws.send(get)
      //          ar.push(yaml.image)
      //        }
      //      }
      //    }
      //    if (!msg.text) {
      //      const get = await apds.get(msg.opened.substring(13))
      //      if (get) {ws.send(get)}
      //    }
      //  }
      //}
    }

  ws.onmessage = async (m) => {
    await handleIncoming(m.data)
  }

    ws.onerror = () => {
      scheduleReconnect()
    }

    ws.onclose = async () => {
      console.log('CLOSED')
      pubs.delete(ws)
      if (!pubs.size) {
        wsReady = createWsReadyPromise()
      }
      scheduleReconnect()
    }
  }

  connectWs()
  return wsReady
}
