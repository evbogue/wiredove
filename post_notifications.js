import { isMessageHash } from './client/protocol.js'
import { ntfy } from './ntfy.js'

// A queued send or a poll echo alone does not prove the content is retrievable.
export async function announceConfirmedPost({ hash, signature, content, opened, confirmation, relay, notify = ntfy }) {
  if (!confirmation?.ok) return false
  if (!isMessageHash(hash) || !/^\d{13}[A-Za-z0-9+/]{43}=$/.test(opened)) {
    throw new Error('Invalid publication reference')
  }
  if (!(await relay.gossip(hash)).includes(signature) ||
      !(await relay.gossip(opened.slice(13))).includes(content)) {
    throw new Error('Published signature or content is not retrievable')
  }
  await notify(hash)
  return true
}

// Accept only Wiredove post links. Old signature links are resolved and verified
// by the caller; old raw-YAML links and unrelated public-topic messages are ignored.
export function notificationReference(message) {
  try {
    const url = new URL(message)
    if (url.origin !== 'https://wiredove.net' || url.pathname !== '/' || url.search || url.username || url.password) return null
    const reference = decodeURIComponent(url.hash.slice(1))
    return isMessageHash(reference) || (reference.length === 208 && isMessageHash(reference.slice(0, 44)) && /^[A-Za-z0-9+/]{162}==$/.test(reference.slice(44))) ? reference : null
  } catch { return null }
}

// Resolve a notification through the same exact-byte ANProto verifier as feeds.
export async function resolveNotificationPost(reference, { protocol, relay }) {
  const signatures = reference.length === 208 ? [reference] : await relay.gossip(reference)
  for (const signature of signatures) {
    let proof
    try { proof = await protocol.open(signature) } catch { continue }
    for (const content of await relay.gossip(proof.contentHash)) {
      let post
      try { post = await protocol.verify(signature, content) } catch { continue }
      if (reference.length === 208 || post.id === reference) return post
    }
  }
  throw new Error('Post unavailable or unverifiable; cursor retained for retry')
}

// resolvePost must authenticate the exact signature/content pair. State is saved
// only after reporting succeeds, so unavailable posts are retried next run.
export async function consumeNotifications(entries, { state, resolvePost, report, save }) {
  const seen = new Set(state.seen || [])
  for (const entry of entries) {
    if (entry.event !== 'message' || typeof entry.id !== 'string' || !/^[A-Za-z0-9]+$/.test(entry.id)) continue
    if (entry.id === state.cursor) continue
    const reference = notificationReference(entry.message)
    if (reference) {
      const post = await resolvePost(reference)
      if (!isMessageHash(post.id)) throw new Error('Invalid verified message ID')
      if (!seen.has(post.id)) {
        await report(post)
        seen.add(post.id)
      }
    }
    const next = { cursor: entry.id, seen: [...seen] }
    await save(next)
    Object.assign(state, next)
  }
}
