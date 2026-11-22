import { createArtifactSession } from '../../client/runtime/artifact-session.js'
import { createBrowserStore } from '../../client/runtime/browser-store.js'
import { createProtocol } from '../../client/protocol.js'
import { an } from '../../vendor/anproto/an.js'
import { yaml } from '../../vendor/apds/yaml.js'

const databaseName = hosted => 'wiredove-shadcn-preview-' + (hosted ? 'hosted' : 'archive')
const protocol = createProtocol({ an, yaml })
const endpoint = new URL('/api/application', location.origin)
const apdsURL = 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'

async function readJSON(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Feed request failed (${response.status})`)
  return response.json()
}

export async function readFeed(hosted, signal) {
  const posts = new Map()
  let cursor = 0
  while (true) {
    const url = hosted ? new URL('/gossip/poll', endpoint) : new URL(endpoint)
    url.searchParams.set(hosted ? 'since' : 'after', cursor)
    const page = await readJSON(url, signal)
    const pairs = hosted ? page.messages : null
    if (hosted && (!Array.isArray(pairs) || pairs.length % 2 || pairs.length > 512)) {
      throw new Error('Invalid hosted feed page')
    }
    const records = hosted
      ? pairs.filter((_, index) => index % 2 === 0).map((signature, index) => ({ signature, content: pairs[index * 2 + 1] }))
      : page.records
    const next = hosted ? page.nextSince : page.cursor
    const more = hosted ? records.length > 0 : page.more
    if (!Array.isArray(records) || !Number.isSafeInteger(next) || next < cursor || (more && next === cursor)) {
      throw new Error('Invalid archive cursor')
    }
    for (const record of records) {
      if (!record || typeof record !== 'object') continue
      const { id, signature, content } = record
      if (!hosted && typeof id !== 'string') continue
      signal.throwIfAborted()
      const post = await protocol.verify(signature, content, { maxBytes: 2 * 1024 * 1024 }).catch(() => null)
      if (!post || (!hosted && post.id !== id) || typeof post.parsed?.body !== 'string'
          || !post.parsed.body.trim() || String(post.parsed.type || '').startsWith('git-')) continue
      posts.set(post.id, post)
    }
    if (posts.size > 50) {
      for (const post of [...posts.values()].sort(newestFirst).slice(50)) posts.delete(post.id)
    }
    if (!more) return [...posts.values()].sort(newestFirst)
    cursor = next
  }
}

const newestFirst = (a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)

export const hostedPreview = import.meta.env.VITE_WIREDOVE_HOSTED === '1'
let storage
function openIdentity(hosted) {
  storage ||= (async () => {
    const { apds } = await import(/* @vite-ignore */ apdsURL)
    await apds.start(databaseName(hosted))
    return apds
  })().catch(error => { storage = null; throw error })
  return storage
}

export async function readPublicIdentity() {
  const apds = await openIdentity(hostedPreview)
  return apds.pubkey()
}

let writer
async function openWriter(hosted) {
  writer ||= (async () => {
    const database = databaseName(hosted)
    const apds = await openIdentity(hosted)
    const store = createBrowserStore(database + ':application')
    const session = createArtifactSession({ protocol: apds, store, endpoint, anbotSocial: hosted })
    await session.recover()
    return { apds, session }
  })().catch(error => { writer = null; throw error })
  return writer
}

export async function pendingPost(hosted) {
  const store = createBrowserStore(databaseName(hosted) + ':application')
  return Boolean((await store.get('outbox'))?.length)
}

export async function publishPost(hosted, body, name) {
  return navigator.locks.request(databaseName(hosted), async () => {
    const { apds, session } = await openWriter(hosted)
    if (!await apds.pubkey()) await apds.put('keypair', await apds.generate())
    return session.publish(body, name ? { name } : {})
  })
}

export async function retryPost(hosted) {
  return navigator.locks.request(databaseName(hosted), async () => {
    const { session } = await openWriter(hosted)
    await session.retry()
  })
}
