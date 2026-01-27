import { apds } from 'apds'
import { render } from './render.js'
import { noteReceived, registerNetworkSenders } from './network_queue.js'
import { getModerationState, isBlockedAuthor } from './moderation.js'

const pubs = new Set()
const wsBackoff = new Map()
const HTTP_POLL_INTERVAL_MS = 5000
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

const deliverWs = (msg) => {
  pubs.forEach(pub => {
    pub.send(msg)
  })
}

const isHash = (msg) => typeof msg === 'string' && msg.length === 44

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
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const messages = Array.isArray(data.messages) ? data.messages : []
      for (const msg of messages) {
        await handleIncoming(msg)
      }
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
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: msg
    })
    if (!res.ok) { return }
    const data = await res.json()
    const messages = Array.isArray(data.messages) ? data.messages : []
    for (const reply of messages) {
      await handleIncoming(reply)
    }
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
      const last = q[q.length - 1]
      const ts = parseInt(last?.ts || '0', 10)
      if (Number.isFinite(ts)) {
        httpState.lastSince = ts
      }
    }
  } catch (err) {
    console.warn('http gossip seed failed', err)
  }
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
    let p = []
      try {
        p = await apds.getPubkeys() || []
      } catch (err) {
        console.warn('getPubkeys failed', err)
        p = []
      }
      let selfPub = null
      try {
        selfPub = await apds.pubkey()
      } catch (err) {
        console.warn('pubkey failed', err)
        selfPub = null
      }
      const moderation = await getModerationState()
      const blocked = new Set(moderation.blockedAuthors || [])
      for (const pub of p) {
        if (blocked.has(pub)) { continue }
        ws.send(pub)
        if (selfPub && pub === selfPub) {
          const latest = await apds.getLatest(pub)
          if (!latest) { continue }
          if (latest.hash) {
            ws.send(latest.hash)
          } else if (latest.sig) {
            const sigHash = await apds.hash(latest.sig)
            ws.send(sigHash)
          }
        }
      }
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
