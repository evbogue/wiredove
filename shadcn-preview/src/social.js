import { saveIdentityBackupFile, validateIdentityBackup } from '../../client/core/identity-backup.js'
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

export const remotePreviewFeed = import.meta.env.WIREDOVE_PREVIEW_REMOTE_FEED

export async function readFeed(hosted, signal, previous) {
  const polls = hosted || remotePreviewFeed
  const posts = new Map(previous?.posts.map(post => [post.id, post]))
  const authors = new Set(previous?.authors)
  const path = remotePreviewFeed ? '/api/preview-feed' : hosted ? '/gossip/poll' : '/api/application'
  let cursor = previous?.cursor ?? 0
  while (true) {
    const url = new URL(path, endpoint)
    url.searchParams.set(polls ? 'since' : 'after', cursor)
    const page = await readJSON(url, signal)
    const pairs = polls ? page.messages : null
    if (polls && (!Array.isArray(pairs) || pairs.length % 2 || pairs.length > 512)) {
      throw new Error('Invalid hosted feed page')
    }
    const records = polls
      ? pairs.filter((_, index) => index % 2 === 0).map((signature, index) => ({ signature, content: pairs[index * 2 + 1] }))
      : page.records
    const next = polls ? page.nextSince : page.cursor
    const more = polls ? records.length > 0 : page.more
    if (!Array.isArray(records) || !Number.isSafeInteger(next) || next < cursor || (more && next === cursor)) {
      throw new Error('Invalid archive cursor')
    }
    for (const record of records) {
      if (!record || typeof record !== 'object') continue
      const { id, signature, content } = record
      if (!polls && typeof id !== 'string') continue
      signal.throwIfAborted()
      const post = await protocol.verify(signature, content, { maxBytes: 2 * 1024 * 1024 }).catch(() => null)
      if (!post || (!polls && post.id !== id)) continue
      if (posts.has(post.id)) continue
      authors.add(post.author)
      if (typeof post.parsed?.body !== 'string' || !post.parsed.body.trim()
          || String(post.parsed.type || '').startsWith('git-')) continue
      posts.set(post.id, post)
    }
    if (!more) return { posts: [...posts.values()].sort(newestFirst), authors, cursor: next }
    cursor = next
  }
}

export async function readConfirmedReply(record) {
  const post = await protocol.verify(record.signature, record.content)
  if (post.id !== record.id) throw new Error('Publication ID does not match its signature.')
  return !post.parsed.edit && post.parsed.reply ? post : null
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

function identityStore(hosted) {
  return createBrowserStore(databaseName(hosted) + ':application')
}

async function ensureIdentity(apds) {
  if (!await apds.pubkey()) await apds.put('keypair', await apds.generate())
  return apds.pubkey()
}

export async function createPreviewIdentity() {
  return navigator.locks.request(databaseName(hostedPreview), async () => {
    const apds = await openIdentity(hostedPreview)
    return ensureIdentity(apds)
  })
}

export async function importPreviewIdentity(file, expectedKey) {
  if (file.size > 16 * 1024) throw new Error('Choose a Wiredove identity backup file.')
  let keypair
  try { keypair = await validateIdentityBackup(await file.text()) }
  catch { throw new Error('This file is not a valid Wiredove identity backup.') }
  return navigator.locks.request(databaseName(hostedPreview), async () => {
    const apds = await openIdentity(hostedPreview)
    const current = await apds.pubkey() || null
    if (current !== expectedKey) throw new Error('The identity changed. Reopen Profile and try again.')
    if (keypair === await apds.keypair()) return current
    const store = identityStore(hostedPreview)
    if ((await store.get('outbox'))?.length) throw new Error('Retry pending delivery before importing another identity.')
    await store.set('identity-needs-pull', keypair.slice(0, 44))
    await apds.put('keypair', keypair)
    return apds.pubkey()
  })
}

export async function downloadPreviewIdentity() {
  const apds = await openIdentity(hostedPreview)
  const keypair = await apds.keypair()
  if (!keypair) throw new Error('Create or import an identity first.')
  saveIdentityBackupFile(keypair)
}

let writer
async function openWriter(hosted) {
  writer ||= (async () => {
    const apds = await openIdentity(hosted)
    const store = identityStore(hosted)
    const session = createArtifactSession({ protocol: apds, store, endpoint, anbotSocial: hosted })
    await session.recover()
    return { apds, session, store }
  })().catch(error => { writer = null; throw error })
  return writer
}

export async function pendingPost(hosted) {
  const [record] = await identityStore(hosted).get('outbox') || []
  if (!record) return false
  const { edit, reply } = await yaml.parse(record.content)
  return { postId: edit || reply || null }
}

export async function publishPost(hosted, body, name, metadata = {}, editAuthor) {
  return navigator.locks.request(databaseName(hosted), async () => {
    const { apds, session, store } = await openWriter(hosted)
    const author = await apds.pubkey()
    if (metadata.edit && (!author || author !== editAuthor)) throw new Error('Only the original author can edit this message.')
    if (!author) await ensureIdentity(apds)
    if (author && await store.get('identity-needs-pull') === author) {
      await session.pull()
      await store.delete('identity-needs-pull')
    }
    return session.publish(body, { ...metadata, ...(name ? { name } : {}) })
  })
}

export async function retryPost(hosted) {
  return navigator.locks.request(databaseName(hosted), async () => {
    const { session } = await openWriter(hosted)
    const [record] = await session.retry()
    if (!record) return null
    const { edit } = await yaml.parse(record.content)
    return { ...record, target: edit || record.id }
  })
}
