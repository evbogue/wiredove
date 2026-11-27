import { createAndFSMediaClient, isAndFSPlayableMedia } from '../../client/andfs.js'
import { apdsAndFS, MAX_MANIFEST } from '../../vendor/andfs/andfs.js'
import { saveIdentityBackupFile, validateIdentityBackup } from '../../client/core/identity-backup.js'
import { createArtifactSession } from '../../client/runtime/artifact-session.js'
import { createBrowserStore } from '../../client/runtime/browser-store.js'
import { createProtocol } from '../../client/protocol.js'
import { an } from '../../vendor/anproto/an.js'
import { yaml } from '../../vendor/apds/yaml.js'
import { gitCardType, withGitActivity } from './git-records'
import { mergeAuthorProfile } from './author-profiles'

const databaseName = hosted => 'wiredove-shadcn-preview-' + (hosted ? 'hosted' : 'archive')
export const protocol = createProtocol({ an, yaml })
const endpoint = new URL('/api/application', location.origin)
const apdsURL = 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'

async function readJSON(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Feed request failed (${response.status})`)
  return response.json()
}

export const remotePreviewFeed = import.meta.env.WIREDOVE_PREVIEW_REMOTE_FEED

// Replay verified history so earlier repository records can appear in Social.
const checkpointKey = 'checkpoint-with-git-cards'
const feedCache = createBrowserStore(databaseName(remotePreviewFeed || import.meta.env.VITE_WIREDOVE_HOSTED === '1') + ':feed')

export async function readStoredFeed() {
  return await feedCache.get(checkpointKey) || await feedCache.get('checkpoint')
}

export function isFeedPost(parsed) {
  return Boolean(gitCardType(parsed)) || !String(parsed?.type || '').startsWith('git-')
    && ((typeof parsed?.body === 'string' && Boolean(parsed.body.trim())) || isAndFSPlayableMedia(parsed))
}

export async function readFeed(hosted, signal, previous) {
  if (previous?.version !== 2) previous = undefined
  const polls = hosted || remotePreviewFeed
  const posts = new Map(previous?.posts.map(post => [post.id, post]))
  const authors = new Set(previous?.authors)
  const profiles = new Map(previous?.profiles)
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
      mergeAuthorProfile(profiles, post)
      if (!isFeedPost(post.parsed)) continue
      posts.set(post.id, post)
    }
    if (!more) {
      if (previous?.cursor === next) return previous
      const snapshot = { posts: [...posts.values()].sort(newestFirst), authors, profiles, cursor: next, version: 2 }
      await feedCache.set(checkpointKey, snapshot).catch(() => {})
      return snapshot
    }
    cursor = next
  }
}

// ANBot's opaque cursor includes Git receipts and updates. Its numeric
// Wiredove-compatible Social poll includes the repository record only.
export async function readGitFeed(signal, previous = { cursor: null, records: new Map(), posts: [] }) {
  let cursor = previous.cursor
  const records = new Map(previous.records)
  while (true) {
    const url = new URL('/gossip/poll', endpoint)
    if (cursor) url.searchParams.set('since', cursor)
    const response = await fetch(url, { signal, cache: 'no-store' })
    if (response.status === 404) return previous
    if (!response.ok) throw new Error(`Git activity request failed (${response.status})`)
    const page = await response.json()
    if (!Array.isArray(page.records)) return previous
    if (!page.records.length) return cursor === previous.cursor ? previous : { cursor, records, posts: withGitActivity(records) }
    if (typeof page.nextSince !== 'string' || !page.nextSince || page.nextSince === cursor) {
      throw new Error('Invalid Git activity cursor')
    }
    for (const record of page.records) {
      signal.throwIfAborted()
      const post = await readLocalPost(record).catch(() => null)
      if (post?.parsed.anbot !== 1) continue
      if (gitCardType(post.parsed) || post.parsed.type === 'git-update') records.set(post.id, post)
      if (post.parsed.type !== 'git-push-receipt') continue
      const push = await readLocalPost(post.parsed.announcement).catch(() => null)
      if (gitCardType(push?.parsed) === 'Git push' && post.parsed.repo?.format === 'anproto'
        && push.parsed.repoId === post.parsed.repo.id) {
        const { commits, count } = post.parsed
        const recent = Array.isArray(commits) ? commits.slice(0, 20).filter(commit =>
          /^[a-f0-9]{40}$/.test(commit?.hash) && typeof commit?.subject === 'string') : []
        records.set(post.id, { ...post, push: { ...push, gitSummary: { recent, count: Number.isSafeInteger(count) ? Math.max(count, recent.length) : recent.length } } })
      }
    }
    cursor = page.nextSince
  }
}

export async function readLocalPost(record) {
  const post = await protocol.verify(record.signature, record.content)
  if (post.id !== record.id) throw new Error('Publication ID does not match its signature.')
  return post
}

export async function readPendingPublication(hosted) {
  const [record] = await identityStore(hosted).get('outbox') || []
  return record ? readLocalPost(record) : null
}

const newestFirst = (a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)

export const hostedPreview = import.meta.env.VITE_WIREDOVE_HOSTED === '1'
let storage
export function openIdentity(hosted) {
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

const composerDrafts = identityStore(hostedPreview)

export function readComposerDraft(key) {
  return navigator.locks.request(key, () => composerDrafts.get(key))
}

export function saveComposerDraft(key, draft) {
  return navigator.locks.request(key, () => composerDrafts.set(key, draft))
}

export function clearComposerDraft(key, revision) {
  return navigator.locks.request(key, async () => {
    if ((await composerDrafts.get(key))?.revision === revision) await composerDrafts.delete(key)
  })
}

export async function createPreviewIdentity(candidate) {
  return navigator.locks.request(databaseName(hostedPreview), async () => {
    const apds = await openIdentity(hostedPreview)
    if (await apds.pubkey()) throw new Error('An identity was saved in another tab. Reload to open its profile.')
    await apds.put('keypair', candidate)
    return apds.pubkey()
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

export async function downloadPreviewIdentity(expectedKey) {
  const apds = await openIdentity(hostedPreview)
  const keypair = await apds.keypair()
  if (!keypair) throw new Error('Create or import an identity first.')
  if (keypair.slice(0, 44) !== expectedKey) throw new Error('The identity changed. Reload to open its profile.')
  saveIdentityBackupFile(keypair)
}

let writer
async function openWriter(hosted) {
  writer ||= (async () => {
    const apds = await openIdentity(hosted)
    const store = identityStore(hosted)
    const session = createArtifactSession({
      protocol: apds, store, endpoint, anbotSocial: hosted,
      beforeDeliver: record => deliverMedia(record, store, apds),
    })
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

let localFiles
function openLocalFiles() {
  return localFiles ||= openIdentity(hostedPreview).then(apdsAndFS).catch(error => {
    localFiles = undefined
    throw error
  })
}

export const previewMediaStore = {
  async get(id) {
    return (await openLocalFiles()).getBlock(id, { maxBytes: MAX_MANIFEST })
  },
  async put(id, bytes) {
    const files = await openLocalFiles()
    if (await files.putBlock(bytes) !== id) throw Error('Unexpected AndFS block hash')
  },
}

const mediaKey = (author, id) => 'media-upload:' + author + ':' + id

async function deliverMedia(record, store, apds) {
  const author = record.signature.slice(0, 44)
  const { body, andfs, image, image_original: original } = await yaml.parse(record.content)
  const ids = new Set(Array.from((typeof body === 'string' ? body : '').matchAll(/\/#([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/g), match => match[1]))
  if (andfs) ids.add(andfs)
  for (const reference of [image, original]) {
    if (typeof reference === 'string' && /^\/#[-_A-Za-z0-9]{43}$/.test(reference)) ids.add(reference.slice(2))
  }
  const jobs = []
  for (const id of ids) {
    const key = mediaKey(author, id)
    const media = await store.get(key)
    if (media) jobs.push({ key, media })
  }
  if (!jobs.length) return
  const files = await openLocalFiles()
  const keypair = await apds.keypair()
  const uploader = createAndFSMediaClient({
    files, signPayload: payload => protocol.signPayload(payload, keypair),
    fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60000) }),
  })
  for (const { key, media } of jobs) {
    const bytes = await files.get(media.andfs)
    await uploader.upload(new File([bytes], media.media_name, { type: media.mime }))
    await store.delete(key)
  }
}

async function stageMedia(file, files, store, author) {
  const { manifestHash } = await files.add(file)
  const media = {
    type: file.type.split('/')[0], andfs: manifestHash, mime: file.type,
    media_name: file.name, media_size: file.size, media_url: '/#' + manifestHash,
  }
  if (store) await store.set(mediaKey(author, manifestHash), media)
  return media
}

async function withProfilePhoto(metadata, photo, store, author) {
  if (!photo) return metadata
  const files = await openLocalFiles()
  const original = await stageMedia(photo.original, files, store, author)
  const crop = await stageMedia(photo.file, files, store, author)
  return { ...metadata, image: crop.media_url, image_original: original.media_url, image_crop: photo.crop }
}

const localProfileKey = author => 'local-profile:' + author

export async function readLocalProfile(author) {
  const record = await identityStore(hostedPreview).get(localProfileKey(author))
  if (!record) return null
  const profile = await readLocalPost(record)
  return profile.author === author ? profile : null
}

export async function saveLocalProfile(author, metadata, photo) {
  return navigator.locks.request(databaseName(hostedPreview), async () => {
    const apds = await openIdentity(hostedPreview)
    const keypair = await apds.keypair()
    if (!keypair || keypair.slice(0, 44) !== author) throw Error('This identity cannot edit the profile.')
    const record = await protocol.compose(keypair, '', await withProfilePhoto(metadata, photo))
    const { id, signature, content } = record
    await identityStore(hostedPreview).set(localProfileKey(author), { id, signature, content })
    return record
  })
}

export async function publishProfile(hosted, author, metadata, photo) {
  return navigator.locks.request(databaseName(hosted), async () => {
    const { apds, session, store } = await openWriter(hosted)
    if (!author || await apds.pubkey() !== author) throw Error('This identity cannot edit the profile.')
    if ((await store.get('outbox'))?.length) throw Error('Retry the pending publication before saving your profile.')
    if (await store.get('identity-needs-pull') === author) {
      await session.pull()
      await store.delete('identity-needs-pull')
    }
    return session.publish('', await withProfilePhoto(metadata, photo, store, author))
  })
}

async function saveAttachments(attachments, store, author) {
  const files = await openLocalFiles()
  const images = []
  let playable
  for (const { file, alt } of attachments) {
    let media
    try {
      media = await stageMedia(file, files, store, author)
    } catch (error) {
      throw new Error(`Could not save ${file.name}. ${error.message}`)
    }
    if (media.type !== 'image') {
      playable = media
      continue
    }
    const label = alt.trim().replace(/[&\\[\]]/g, char => '&#' + char.charCodeAt(0) + ';')
    images.push(`![${label}](${media.media_url})`)
  }
  return { images: images.join('\n'), playable }
}

export async function publishPost(hosted, expectedKey, body, name, metadata = {}, editAuthor, attachments = []) {
  return navigator.locks.request(databaseName(hosted), async () => {
    const { apds, session, store } = await openWriter(hosted)
    const author = await apds.pubkey()
    if (metadata.edit && (!author || author !== editAuthor)) throw new Error('Only the original author can edit this message.')
    if (!author) throw new Error('Choose a public key before publishing.')
    if (author !== expectedKey) throw new Error('The identity changed. Reload before publishing.')
    if (author && await store.get('identity-needs-pull') === author) {
      await session.pull()
      await store.delete('identity-needs-pull')
    }
    if (attachments.length) {
      if ((await store.get('outbox'))?.length) throw Error('Retry the pending publication before uploading media.')
      const { images, playable } = await saveAttachments(attachments, store, author)
      body = [body, images, playable?.media_url].filter(Boolean).join('\n\n')
      if (playable) metadata = { ...metadata, ...playable }
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
