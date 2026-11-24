import { completeHashRequest, queueSend, subscribeHashRequest } from '../../network_queue.js'
import { subscribeRenderer } from '../../client/runtime/render-delivery.js'
import { isMessageHash } from '../../client/protocol.js'
import { createBrowserStore } from '../../client/runtime/browser-store.js'
import { an } from '../../vendor/anproto/an.js'
import { hostedPreview, openIdentity, protocol, remotePreviewFeed } from './social'

const maxRecordBytes = 2 * 1024 * 1024
const maxPending = 1800
const historyDepth = 32
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
    listeners.forEach(listener => listener())
  }, 0)
}

export function subscribePeerPosts(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function peerPostsSnapshot() {
  return snapshot
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
    queueSend(proof.contentHash, { priority: request?.priority || 'normal', retry })
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
  if (typeof blob !== 'string' || blob.length > maxRecordBytes) return
  const id = await an.hash(blob)
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
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(blob)) completeHashRequest(id)
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
  const apds = await startPeerSync()
  const value = await apds.get(id)
  if (typeof value === 'string' && /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(value)
      && await an.hash(value) === id) return value
  queueSend(id, { priority: 'normal', retry })
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
