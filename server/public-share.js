import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { andfsImageMetadata, isAndFSPlayableMedia } from '../client/andfs.js'
import { parseMessageBody } from '../client/ui/body.js'
import { createProtocol } from '../client/protocol.js'
import { an } from '../vendor/anproto/an.js'
import { yaml } from '../vendor/apds/yaml.js'
import { renderSharePage } from './public-share-page.js'

const webID = value => value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const signedID = value => value.replace(/-/g, '+').replace(/_/g, '/') + '='
const fullID = /^[\w-]{43}$/
const aliasPattern = /^[\w-]{8,42}$/

function publicOrigin(value) {
  const url = new URL(value)
  if (url.href !== url.origin + '/' || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('Public sharing requires an HTTPS origin or loopback HTTP')
  }
  return url.origin
}

export async function createPublicShare({ origin, appOrigin, upstream, dataDir, readRecords, readMedia }) {
  if (!origin) return null
  const canonicalOrigin = publicOrigin(origin)
  const appURL = appOrigin && publicOrigin(appOrigin)
  const appHref = id => appURL ? appURL + "/#" + id : "/?enter=shared#" + id
  const upstreamOrigin = upstream && publicOrigin(upstream)
  await fs.mkdir(dataDir, { recursive: true })
  const aliasFile = join(dataDir, 'aliases.json')
  let aliases
  try { aliases = new Map(JSON.parse(await fs.readFile(aliasFile, 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error; aliases = new Map() }
  const reverse = new Map([...aliases].map(([alias, id]) => [id, alias]))
  let aliasQueue = Promise.resolve()
  const protocols = createProtocol({ an, yaml })
  const posts = new Map()
  const profiles = new Map()
  const edits = new Map()
  const authors = new Map()
  let cursor = 0
  let loadedAt = -Infinity
  let refreshing

  function refresh() {
    if (refreshing) return refreshing
    if (upstreamOrigin && Date.now() - loadedAt < 5000) return Promise.resolve()
    refreshing = (async () => {
      while (true) {
        let page
        if (upstreamOrigin) {
          const url = new URL('/gossip/poll', upstreamOrigin)
          url.searchParams.set('since', cursor)
          const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) })
          if (!response.ok) throw Error('Public feed unavailable')
          const { messages, nextSince } = await response.json()
          if (!Array.isArray(messages) || messages.length % 2 || messages.length > 512) throw Error('Invalid public feed')
          const records = []
          for (let index = 0; index < messages.length; index += 2) {
            records.push({ signature: messages[index], content: messages[index + 1] })
          }
          page = { records, cursor: nextSince, more: Boolean(records.length) }
        } else {
          page = await readRecords(cursor)
        }
        if (!Number.isSafeInteger(page.cursor) || page.cursor < cursor || (page.more && page.cursor === cursor)) {
          throw Error('Invalid public feed cursor')
        }
        for (const record of page.records) {
          const post = await protocols.verify(record.signature, record.content, { maxBytes: 2 * 1024 * 1024 }).catch(() => null)
          if (!post || (record.id && post.id !== record.id) || String(post.parsed?.type || '').startsWith('git-')) continue
          const author = webID(post.author)
          const current = profiles.get(author)
          if (!current || post.timestamp > current.timestamp) profiles.set(author, post)
          if ((typeof post.parsed?.body !== 'string' || !post.parsed.body.trim()) && !isAndFSPlayableMedia(post.parsed)) continue
          if (typeof post.parsed.edit === 'string') {
            const key = post.parsed.edit + ':' + post.author
            if (!edits.has(key) || post.timestamp > edits.get(key).timestamp) edits.set(key, post)
            continue
          }
          const id = webID(post.id)
          posts.set(id, post)
          if (!authors.has(author)) authors.set(author, new Map())
          authors.get(author).set(id, post)
        }
        cursor = page.cursor
        if (!page.more) break
      }
      loadedAt = Date.now()
    })().finally(() => { refreshing = null })
    return refreshing
  }

  function reserve(id) {
    const result = aliasQueue.then(async () => {
      if (reverse.has(id)) return reverse.get(id)
      for (let length = 8; length < id.length; length += 1) {
        const alias = id.slice(0, length)
        if (aliases.has(alias)) continue
        const next = new Map(aliases).set(alias, id)
        const temp = aliasFile + '.' + crypto.randomUUID() + '.tmp'
        try {
          await fs.writeFile(temp, JSON.stringify([...next]), { mode: 0o600 })
          await fs.rename(temp, aliasFile)
        } finally {
          await fs.unlink(temp).catch(() => {})
        }
        aliases = next
        reverse.set(id, alias)
        return alias
      }
      return id
    })
    aliasQueue = result.catch(() => {})
    return result
  }

  function imageReferences(blocks) {
    return blocks.flatMap(block => block.images || imageReferences(block.children || []))
  }

  async function localMediaPath(id, accepts) {
    if (!readMedia) return null
    const path = '/media/' + id
    try {
      const media = await readMedia(new Request(canonicalOrigin + path, { method: 'HEAD' }))
      return media?.ok && accepts(media.headers.get('Content-Type') || '') ? path : null
    } catch {
      return null
    }
  }

  async function resolveImages(blocks, paths) {
    await Promise.all(imageReferences(blocks).map(async image => {
      if (paths.has(image.src)) return
      const reference = andfsImageMetadata(image.src, canonicalOrigin)
      if (!reference) return
      const available = localMediaPath(reference.andfs, mime => /^image\/(png|jpeg|webp|gif)$/.test(mime))
      paths.set(image.src, available)
      await available
    }))
  }

  return async function handleShare(request) {
    const url = new URL(request.url)
    const token = url.pathname.slice(1)
    const issue = url.pathname === '/api/share'
    const bootstrap = url.pathname === '/api/public-record'
    if (!issue && !bootstrap && !fullID.test(token) && !aliasPattern.test(token)) return null
    if (!(issue ? ['POST'] : ['GET', 'HEAD']).includes(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: issue ? 'POST' : 'GET, HEAD' } })
    }
    const id = issue || bootstrap ? url.searchParams.get('id') : fullID.test(token) ? token : aliases.get(token)
    if (!fullID.test(id || '')) return new Response('Public item not found', { status: 404 })
    try {
      await refresh()
    } catch {
      if (!posts.has(id) && !profiles.has(id)) return new Response('Public feed unavailable', { status: 503 })
    }
    const post = posts.get(id)
    const profile = profiles.get(id)
    if (!post && !profile) return new Response('Public item not found', { status: 404 })
    if (issue) {
      const alias = await reserve(id)
      return Response.json({ url: canonicalOrigin + '/' + alias }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const canonical = canonicalOrigin + '/' + id
    const ref = post && (post.parsed.replyHash || post.parsed.reply)
    const parent = typeof ref === 'string' ? posts.get(webID(ref)) : null
    const items = !post && profile && [...(authors.get(id)?.values() || [])]
      .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id)).slice(0, 12)
    function editOf(item) {
      const edit = item && edits.get(item.id + ':' + item.author)
      return edit && edit.timestamp >= item.timestamp ? edit : null
    }
    if (bootstrap) {
      const records = [post || profile, parent, editOf(post), ...(items || [])].filter(Boolean)
      return Response.json({ records: records.map(({ id, signature, content }) => ({ id, signature, content })) },
        { headers: { 'Cache-Control': 'no-store' } })
    }
    function present(item) {
      const edit = editOf(item)
      return edit ? { ...item, parsed: { ...item.parsed, body: edit.parsed.body } } : item
    }
    const displayed = present(post)
    const displayedParent = present(parent)
    const displayedItems = items && items.map(present)
    const paths = new Map()
    const cards = [displayed, displayedParent, ...(displayedItems || [])].filter(Boolean)
    const bodies = cards.map(item => item.parsed.body)
    const playbackPaths = new Map(await Promise.all(cards.filter(item => isAndFSPlayableMedia(item.parsed)).map(async item => {
      const { andfs, mime } = item.parsed
      return [item.id, await localMediaPath(andfs, contentType => contentType === mime)]
    })))
    if (!displayed) bodies.push(profile.parsed.bio)
    await Promise.all(bodies.map(body => resolveImages(parseMessageBody(body), paths)))
    const imagePaths = new Map(await Promise.all([...paths].map(async ([src, path]) => [src, await path])))
    const firstImage = displayed && imageReferences(parseMessageBody(displayed.parsed.body)).find(image => imagePaths.get(image.src))
    const previewImage = firstImage && { path: imagePaths.get(firstImage.src), alt: firstImage.alt }
    const html = renderSharePage({ canonicalOrigin, canonical,
      id: signedID(id), post: displayed, profile, parent: displayedParent, items: displayedItems,
      webID, appHref, previewImage, imagePaths, playbackPaths })
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}
