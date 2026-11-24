import { hash, MAX_MANIFEST, validHash } from '../../vendor/andfs/andfs.js'
import { previewMediaStore } from './social'

const relayOrigins = new Map()
let roomTransport
const slots = 8

export function setMediaRelay(url, enabled) {
  const origin = new URL(url.replace(/^ws/, 'http')).origin
  if (enabled) relayOrigins.set(url, origin)
  else relayOrigins.delete(url)
}

export function attachMediaRoom(room, peers) {
  const [ask, onAsk] = room.makeAction('andfs-get')
  const [send, onBlock] = room.makeAction('andfs-block')
  const pending = new Map()
  const serving = new Map()
  let transfers = 0
  const transport = {
    async get(id) {
      const targets = peers()
      if (!targets.length) return
      const existing = pending.get(id)
      if (existing) return existing.promise
      if (pending.size >= slots) return
      let finish
      const promise = new Promise(resolve => { finish = resolve })
      const cancel = () => settle()
      const timeout = setTimeout(cancel, 4500)
      function settle(bytes) {
        clearTimeout(timeout)
        pending.delete(id)
        finish(bytes)
      }
      pending.set(id, { promise, settle })
      void Promise.resolve().then(() => ask(id, targets)).catch(cancel)
      return promise
    },
  }
  onAsk(async (id, peer) => {
    const active = serving.get(peer) || 0
    if (!validHash(id) || !peers().includes(peer) || transfers >= slots || active >= 2) return
    serving.set(peer, active + 1)
    transfers++
    try {
      const bytes = await previewMediaStore.get(id)
      if (bytes && roomTransport === transport && peers().includes(peer)) await send(bytes, peer, { id })
    } catch {
      // Missing blocks are left for other peers or sources.
    } finally {
      transfers--
      const remaining = serving.get(peer) - 1
      if (remaining) serving.set(peer, remaining)
      else serving.delete(peer)
    }
  })
  onBlock(async (data, peer, meta) => {
    const id = meta?.id
    const entry = pending.get(id)
    if (!entry || !peers().includes(peer)) return
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    if (bytes instanceof Uint8Array && bytes.byteLength <= MAX_MANIFEST && await hash(bytes) === id
        && pending.get(id) === entry) entry.settle(bytes)
  })
  roomTransport = transport
  return () => {
    if (roomTransport === transport) roomTransport = undefined
    for (const entry of pending.values()) entry.settle()
  }
}

async function verifiedResponse(url, id, signal) {
  const response = await fetch(url, { signal, redirect: 'error' })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    return
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_MANIFEST) return
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  if (await hash(bytes) === id) return bytes
}

export async function fetchPeerMedia(url, { signal } = {}) {
  const primary = new URL(url, location.origin)
  const id = primary.pathname.split('/').at(-1)
  if (!validHash(id)) return new Response(null, { status: 404 })
  const candidates = new Set([primary.href, ...[...relayOrigins.values()].map(origin => origin + '/blobs/' + id)])
  const controller = new AbortController()
  const scoped = AbortSignal.any([controller.signal, AbortSignal.timeout(5000), ...(signal ? [signal] : [])])
  const sources = [...candidates].map(candidate => verifiedResponse(candidate, id, scoped))
  if (roomTransport) sources.push(roomTransport.get(id))
  try {
    const bytes = await Promise.any(sources.map(async source => {
      const value = await source
      if (!value) throw new Error('Block unavailable')
      return value
    }))
    return new Response(bytes)
  } catch {
    signal?.throwIfAborted()
    return new Response(null, { status: 404 })
  } finally {
    controller.abort()
  }
}
