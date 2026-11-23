import { isMessageHash } from '../../client/protocol.js'

export const messageHref = id => '#message/' + encodeURIComponent(id)
export const authorHref = id => '#author/' + encodeURIComponent(id)

export function socialRoute(hash) {
  const [kind, value] = hash.split('/')
  if (kind !== 'message' && kind !== 'author') return null
  try {
    const id = decodeURIComponent(value || '')
    return { kind, id: isMessageHash(id) ? id : null }
  } catch {
    return { kind, id: null }
  }
}

export function authorName(post) {
  return (typeof post.parsed.name === 'string' && post.parsed.name.trim()) || post.author.slice(0, 12)
}

export function indexMessages(records) {
  const posts = records.filter(post => !post.parsed.edit)
  const byId = new Map(posts.map(post => [post.id, post]))
  const replies = new Map()
  const edits = new Map()
  function add(index, id, record) {
    if (!index.has(id)) index.set(id, [])
    index.get(id).push(record)
  }

  for (const post of records) {
    const original = byId.get(post.parsed.edit)
    if (original && original.author === post.author && post.timestamp >= original.timestamp) {
      add(edits, original.id, post)
    }
    const parent = post.parsed.replyHash || post.parsed.reply
    if (!post.parsed.edit && isMessageHash(parent)) add(replies, parent, post)
  }
  return { posts, byId, edits, replies }
}
