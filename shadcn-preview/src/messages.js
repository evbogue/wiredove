import { isMessageHash } from '../../client/protocol.js'

export const socialHref = id => '#' + id

export function socialRoute(hash, messages, authors, identity) {
  // Recognize links from earlier preview builds as well as Wiredove's bare IDs.
  const [, legacy, value] = /^(author|message|post)\/(.*)$/.exec(hash) || []
  let id
  try { id = decodeURIComponent(legacy ? value : hash) }
  catch { return legacy ? { kind: 'unknown', id: null } : null }
  if (!isMessageHash(id)) return legacy ? { kind: 'unknown', id: null } : null
  if (legacy === 'author') return { kind: 'author', id }
  if (legacy || messages.byId.has(id)) return { kind: 'message', id }
  if (id === identity || authors.has(id)) return { kind: 'author', id }
  return { kind: 'unknown', id }
}

export function authorName(post) {
  return (typeof post.parsed.name === 'string' && post.parsed.name.trim()) || post.author.slice(0, 12)
}

export function indexMessages(records) {
  const posts = records.filter(post => !post.parsed.edit)
  const byId = new Map(posts.map(post => [post.id, post]))
  const byAuthor = new Map()
  const replies = new Map()
  const edits = new Map()
  function add(index, id, record) {
    if (!index.has(id)) index.set(id, [])
    index.get(id).push(record)
  }

  for (const post of posts) add(byAuthor, post.author, post)
  for (const post of records) {
    const original = byId.get(post.parsed.edit)
    if (original && original.author === post.author && post.timestamp >= original.timestamp) {
      add(edits, original.id, post)
    }
    const parent = post.parsed.replyHash || post.parsed.reply
    if (!post.parsed.edit && isMessageHash(parent)) add(replies, parent, post)
  }
  return { posts, byId, byAuthor, edits, replies }
}
