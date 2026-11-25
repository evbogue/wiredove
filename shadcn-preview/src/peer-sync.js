import { completeHashRequest, queueSend, subscribeHashRequest } from '../../network_queue.js'
import { subscribeRenderer } from '../../client/runtime/render-delivery.js'
import { isMessageHash } from '../../client/protocol.js'
import { createBrowserStore } from '../../client/runtime/browser-store.js'
import { an } from '../../vendor/anproto/an.js'
import { hostedPreview, isFeedPost, openIdentity, protocol, remotePreviewFeed } from './social'
import { fetchLegacyPeerImage, legacyImage, maxLegacyImageBytes } from './peer-media'

const maxRecordBytes = 2 * 1024 * 1024
const maxPending = 1800
const historyDepth = 32
const day = 24 * 60 * 60 * 1000
const recentLimit = 50
const wantedImages = new Map()
const imageFetches = new Map()
let recentReady = false
let publishedRecentReady = false
let recentFloor = 0
let priming
const cache = createBrowserStore('wiredove-shadcn-peer-records-' + (hostedPreview ? 'hosted' : 'archive'))
const posts = new Map()
const listeners = new Set()
const signaturesByBody = new Map()
const requested = new Map()
const lookupListeners = new Map()
let startup
let publishQueued = false
let snapshot = []

function changed() {
  if (publishQueued) return
  publishQueued = true
  setTimeout(() => {
    publishQueued = false
    snapshot = [...posts.values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id))
    publishedRecentReady = recentReady
    listeners.forEach(listener => listener())
  }, 250)
}

export function subscribePeerPosts(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function peerPostsSnapshot() {
  return snapshot
}

export const recentPeerFeedReady = () => publishedRecentReady

export function primePeerFeed(relay) {
  priming ||= (async () => {
    if (!relay) return
    const signal = AbortSignal.timeout(4500)
    const origin = relay.replace(/^ws/, 'http')
    const now = Date.now()
    const checked = new Set()
    const recentTimestamps = []
    for (const windowDays of [7, 30]) {
      let since = now - day * windowDays
      for (let page = 0; page < 6; page++) {
        const request = new URL('/gossip/poll', origin)
        request.searchParams.set('since', since)
        request.searchParams.set('limit', '200')
        const response = await fetch(request, { signal, cache: 'no-store' })
        if (!response.ok) return
        const { messages, nextSince } = await response.json()
        if (!Array.isArray(messages) || messages.length > 200 || !Number.isSafeInteger(nextSince)) return
        const records = []
        for (let index = 0; index + 1 < messages.length; index++) {
          const signature = messages[index]
          const proof = await protocol.open(signature).catch(() => null)
          if (!proof || blocked(proof.author)) continue
          const content = messages[index + 1]
          const post = await protocol.verify(signature, content, { maxBytes: maxRecordBytes }).catch(() => null)
          if (!post?.parsed || typeof post.parsed !== 'object') continue
          index++
          if (checked.has(post.id)) continue
          checked.add(post.id)
          records.push(post)
          if (!post.parsed.edit && isFeedPost(post.parsed)) {
            recentTimestamps.push(post.timestamp)
          }
        }
        for (const post of records) {
          if (!posts.has(post.id)) posts.set(post.id, post)
          void cache.set(post.id, { signature: post.signature, content: post.content }).catch(() => {})
        }
        void mirrorArchive(records)
        if (messages.length < 200 || nextSince <= since) break
        since = nextSince
      }
      if (recentTimestamps.length >= recentLimit) break
    }
    recentFloor = recentTimestamps.sort((a, b) => b - a)[recentLimit - 1] || 0
  })().catch(() => {}).finally(() => {
    recentReady = true
    changed()
  })
  return priming
}

export async function acceptPeerBlob(blob) {
  if (typeof blob !== 'string') return false
  if (!/^data:(?:image|audio|video)\//i.test(blob)) return true
  if (blob.length > maxLegacyImageBytes || !legacyImage.test(blob)) return false
  return (wantedImages.get(await an.hash(blob)) || 0) > Date.now()
}

function remember(map, key, value) {
  if (map.size >= maxPending && !map.has(key)) map.delete(map.keys().next().value)
  map.set(key, value)
}

function blocked(author) {
  try {
    const policy = JSON.parse(localStorage.getItem('wiredove-shadcn:message-moderation') || '{}')
    return policy.blocked?.includes(author)
  } catch {
    return false
  }
}

async function accept(apds, signature, proof, { cached, retry = false } = {}) {
  if (blocked(proof.author)) return
  const id = await an.hash(signature)
  if (posts.has(id)) return posts.get(id)
  const request = requested.get(id) || requested.get(proof.author)
  const content = cached ? cached.content : await apds.get(proof.contentHash)
  if (typeof content !== 'string') {
    const waiting = signaturesByBody.get(proof.contentHash) || new Map()
    if (waiting.size < 16) waiting.set(id, signature)
    remember(signaturesByBody, proof.contentHash, waiting)
    for (const target of [id, proof.author]) {
      const lookup = requested.get(target)
      if (!lookup) continue
      lookup.body = proof.contentHash
      lookupListeners.get(target)?.forEach(listener => listener(proof.contentHash))
    }
    queueSend(proof.contentHash, { priority: request?.priority || (proof.timestamp < recentFloor ? 'low' : 'normal'), retry })
    return
  }
  const post = await protocol.verify(signature, content, { maxBytes: maxRecordBytes }).catch(() => null)
  if (!post || !post.parsed || typeof post.parsed !== 'object') return
  completeHashRequest(proof.contentHash)
  completeHashRequest(id)
  completeHashRequest(proof.author)
  requested.delete(id)
  requested.delete(proof.author)
  signaturesByBody.get(proof.contentHash)?.delete(id)
  if (posts.has(id)) return posts.get(id)
  posts.set(id, post)
  changed()
  if (!cached) {
    await cache.set(id, { signature, content }).catch(() => {})
    const previous = post.parsed.previous
    const depth = request?.depth ?? historyDepth
    if (depth > 0 && isMessageHash(previous) && previous !== id) {
      void requestHash(previous, { priority: 'low', depth: depth - 1 }).catch(() => {})
    }
  }
  return post
}

async function received(apds, blob) {
  if (typeof blob !== 'string') return
  const image = legacyImage.test(blob)
  if (!image && blob.length > maxRecordBytes) return
  const id = await an.hash(blob)
  if (image) {
    wantedImages.delete(id)
    completeHashRequest(id)
    return
  }
  const waiting = signaturesByBody.get(id)
  if (waiting) {
    signaturesByBody.delete(id)
    await Promise.all([...waiting.values()].map(async signature => {
      const proof = await protocol.open(signature)
      await accept(apds, signature, proof)
    }))
  }
  const proof = await protocol.open(blob).catch(() => null)
  if (proof) await accept(apds, blob, proof)
}

export function startPeerSync() {
  startup ||= (async () => {
    const apds = await openIdentity(hostedPreview)
    subscribeRenderer({
      shouldWe() {},
      blob: blob => received(apds, blob).catch(error => console.warn('Peer record processing failed', error)),
    })
    void cache.entries().then(async records => {
      for (const [, record] of records) {
        const proof = await protocol.open(record.signature).catch(() => null)
        if (proof) await accept(apds, record.signature, proof, { cached: record })
      }
    }).catch(error => console.warn('Peer cache could not be loaded', error))
    return apds
  })().catch(error => { startup = undefined; throw error })
  return startup
}

export async function requestHash(id, { priority = 'high', retry = false, depth = historyDepth } = {}) {
  if (!isMessageHash(id) || posts.has(id)) return
  const apds = await startPeerSync()
  const prior = requested.get(id)
  if (!prior || priority === 'high' || (priority === 'normal' && prior.priority === 'low')) {
    remember(requested, id, { priority, depth })
  }
  const raw = await apds.get(id)
  const latest = raw ? null : await apds.getLatest(id)
  const proof = await protocol.open(raw || latest?.sig).catch(() => null)
  if (proof && (!raw || await an.hash(raw) === id)) {
    await accept(apds, raw || latest.sig, proof, { retry })
    return
  }
  queueSend(id, { priority, retry })
}

export function subscribePeerRequest(id, listener) {
  let body
  let stopBody
  const stop = subscribeHashRequest(id, status => {
    if (!body || status.state === 'received') listener(status)
  })
  function watchBody(hash) {
    if (body === hash) return
    stopBody?.()
    body = hash
    stopBody = subscribeHashRequest(hash, listener)
  }
  const watchers = lookupListeners.get(id) || new Set()
  watchers.add(watchBody)
  lookupListeners.set(id, watchers)
  const queuedBody = requested.get(id)?.body
  if (queuedBody) watchBody(queuedBody)
  return () => {
    stop()
    stopBody?.()
    watchers.delete(watchBody)
    if (!watchers.size) lookupListeners.delete(id)
  }
}

export async function resolvePeerImage(id, { retry } = {}) {
  if (!isMessageHash(id)) return null
  const apds = await startPeerSync()
  const value = await apds.get(id)
  if (typeof value === 'string' && legacyImage.test(value)
      && await an.hash(value) === id) return value
  remember(wantedImages, id, Date.now() + 60000)
  queueSend(id, { priority: 'normal', retry })
  if (!imageFetches.has(id)) {
    const lookup = fetchLegacyPeerImage(id).then(async image => {
      if (!image) return
      await apds.make(image)
      wantedImages.delete(id)
      completeHashRequest(id)
    }).catch(() => {}).finally(() => imageFetches.delete(id))
    imageFetches.set(id, lookup)
  }
  return null
}
resolvePeerImage.subscribe = subscribeHashRequest

export function announcePeerPost(record) {
  if (remotePreviewFeed) return
  queueSend(record.content, { priority: 'normal' })
  queueSend(record.signature, { priority: 'normal' })
}

const mirrored = new Set()
let mirrorWork = Promise.resolve()

export function mirrorArchive(records) {
  const pending = records.filter(record => !mirrored.has(record.id))
  if (!pending.length) return mirrorWork
  pending.forEach(record => mirrored.add(record.id))
  mirrorWork = mirrorWork.then(async () => {
    const apds = await startPeerSync()
    for (const record of pending) {
      if (blocked(record.author)) {
        mirrored.delete(record.id)
        continue
      }
      try {
        if (!await apds.get(record.contentHash)) await apds.make(record.content)
        if (!await apds.get(record.id)) await apds.add(record.signature)
      } catch {
        mirrored.delete(record.id)
      }
    }
  }).catch(() => pending.forEach(record => mirrored.delete(record.id)))
  return mirrorWork
}
