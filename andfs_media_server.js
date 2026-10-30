import { an } from './vendor/anproto/an.js'
import { createAndFS, MAX_MANIFEST, validHash } from './vendor/andfs/andfs.js'
import { diskStore, memoryStore } from './vendor/andfs/stores.js'

import { DEFAULT_MEDIA_MIME as PUBLIC_MIME } from './client/andfs.js'

const SIGNATURE_HASH = /^[A-Za-z0-9+/]{43}=$/
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
})
const publicHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Range',
  'access-control-expose-headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
  'x-content-type-options': 'nosniff',
  'cache-control': 'public, max-age=31536000, immutable'
}

async function readLimited(body, limit) {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const parts = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('Media upload is too large')
      parts.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

function byteRange(header, size) {
  if (!header) return { start: 0, end: size, status: 200 }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid byte range')
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] ? (match[2] ? Math.min(size, Number(match[2]) + 1) : size) : size
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end || end > size) {
    throw new Error('Invalid byte range')
  }
  return { start, end, status: 206 }
}

export async function createAndFsMediaService({
  dataDir = './data',
  maxMediaBytes = 32 * 1024 * 1024,
  quotaBytes = 1024 * 1024 * 1024,
  maxUploadsPerHour = 20
} = {}) {
  const andfsDir = `${dataDir}/andfs`
  const mediaDir = `${dataDir}/media`
  await Deno.mkdir(mediaDir, { recursive: true })
  const store = await diskStore(andfsDir)
  const files = createAndFS({ store })
  const media = new Map()
  const authorUploads = new Map()

  for await (const entry of Deno.readDir(mediaDir)) {
    if (!entry.isFile || !entry.name.endsWith('.json')) continue
    try {
      const row = JSON.parse(await Deno.readTextFile(`${mediaDir}/${entry.name}`))
      if (
        validHash(row.andfs) && PUBLIC_MIME.has(row.mime) &&
        Number.isSafeInteger(row.media_size) && row.media_size > 0 &&
        SIGNATURE_HASH.test(row.author || '')
      ) {
        media.set(row.andfs, row)
      }
    } catch (error) {
      console.warn('Skipping invalid media metadata', entry.name, error)
    }
  }

  const writeMetadata = async (row) => {
    const path = `${mediaDir}/${row.andfs}.json`
    const temp = `${path}.${crypto.randomUUID()}.tmp`
    try {
      await Deno.writeTextFile(temp, JSON.stringify(row))
      await Deno.rename(temp, path)
    } finally {
      await Deno.remove(temp).catch(() => {})
    }
  }

  const authorize = async (request) => {
    const signature = request.headers.get('X-ANProto-Signature')
    const content = request.headers.get('X-ANProto-Content')
    if (!signature || signature.length !== 208 || !content || content.length > 8192) throw new Error('Missing upload authorization')
    const author = signature.slice(0, 44)
    if (!SIGNATURE_HASH.test(author)) throw new Error('Invalid signer')
    let opened
    try {
      opened = await an.open(signature)
    } catch {
      throw new Error('Invalid ANProto signature')
    }
    if (!/^\d{13}[A-Za-z0-9+/]{43}=$/.test(opened)) throw new Error('Invalid signed upload authorization')
    const timestamp = Number(opened.slice(0, 13))
    if (Math.abs(Date.now() - timestamp) > 300000 || await an.hash(content) !== opened.slice(13)) {
      throw new Error('Upload authorization is invalid or expired')
    }
    let meta
    try {
      meta = JSON.parse(content)
    } catch {
      throw new Error('Invalid upload authorization JSON')
    }
    if (
      meta.action !== 'andfs-upload-v1' || !validHash(meta.andfs) ||
      !PUBLIC_MIME.has(meta.mime) || !Number.isSafeInteger(meta.media_size) ||
      meta.media_size < 1 || meta.media_size > maxMediaBytes ||
      (meta.reply !== undefined && !SIGNATURE_HASH.test(meta.reply)) ||
      (meta.replyto !== undefined && !SIGNATURE_HASH.test(meta.replyto)) ||
      ((meta.reply === undefined) !== (meta.replyto === undefined))
    ) throw new Error(`Unsupported media or size; maximum is ${Math.floor(maxMediaBytes / 1024 / 1024)} MiB`)
    return { author, meta }
  }

  const upload = async (request) => {
    try {
      const { author, meta } = await authorize(request)
      const previous = media.get(meta.andfs)
      if (previous) {
        if (previous.media_size !== meta.media_size || previous.mime !== meta.mime) throw new Error('Manifest metadata does not match the existing upload')
      }
      const now = Date.now()
      const recent = (authorUploads.get(author) || []).filter((time) => now - time < 3600000)
      if (!previous && recent.length >= maxUploadsPerHour) throw new Error('Media upload rate limit reached')
      const used = [...media.values()].reduce((sum, item) => sum + item.media_size, 0)
      if (!previous && used + meta.media_size > quotaBytes) throw new Error('Media storage quota reached')
      const declaredLengthHeader = request.headers.get('content-length')
      const declaredLength = declaredLengthHeader === null ? null : Number(declaredLengthHeader)
      if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength !== meta.media_size)) {
        throw new Error('Upload size does not match its authorization')
      }
      const bytes = await readLimited(request.body, meta.media_size)
      if (bytes.length !== meta.media_size) throw new Error('Incomplete media upload')
      const staging = createAndFS({ store: memoryStore() })
      const staged = await staging.add(bytes)
      if (staged.manifestHash !== meta.andfs) throw new Error('Media bytes do not match the signed AndFS manifest')
      // Rewriting verified blocks also repairs a missing/corrupt block on retry.
      const saved = previous || { andfs: meta.andfs, mime: meta.mime, media_size: meta.media_size, author }
      await files.add(bytes)
      await writeMetadata(saved)
      media.set(meta.andfs, saved)
      if (!previous) authorUploads.set(author, [...recent, now])
      return json(saved, previous ? 200 : 201)
    } catch (error) {
      return json({ error: error.message || 'Media upload failed' }, 400)
    }
  }

  const unavailableHeaders = { ...publicHeaders, 'cache-control': 'no-store' }

  const blockResponse = async (request, id) => {
    if (!validHash(id)) return json({ error: 'Invalid AndFS hash' }, 400)
    try {
      const bytes = await files.getBlock(id, { maxBytes: MAX_MANIFEST })
      const headers = new Headers({ ...publicHeaders, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) })
      return new Response(request.method === 'HEAD' ? null : bytes, { headers })
    } catch {
      return new Response(null, { status: 404, headers: unavailableHeaders })
    }
  }

  const mediaResponse = async (request, id) => {
    if (!validHash(id)) return json({ error: 'Invalid AndFS hash' }, 400)
    const meta = media.get(id)
    if (!meta) return new Response(null, { status: 404, headers: unavailableHeaders })
    try {
      const manifest = await files.manifest(id)
      if (manifest.size !== meta.media_size) throw new Error('Stored media size does not match its manifest')
      let range
      try {
        range = byteRange(request.headers.get('range'), manifest.size)
      } catch {
        return new Response(null, { status: 416, headers: { ...publicHeaders, 'content-range': `bytes */${manifest.size}` } })
      }
      const headers = new Headers({
        ...publicHeaders,
        'content-type': meta.mime,
        'content-length': String(range.end - range.start),
        'accept-ranges': 'bytes'
      })
      if (range.status === 206) headers.set('content-range', `bytes ${range.start}-${range.end - 1}/${manifest.size}`)
      return new Response(request.method === 'HEAD' ? null : files.read(id, range), { status: range.status, headers })
    } catch {
      return new Response(null, { status: 502, headers: unavailableHeaders })
    }
  }

  // Serialize quota/rate checks and commits, including concurrent duplicate retries.
  let uploads = Promise.resolve()
  const enqueueUpload = (request) => {
    const result = uploads.then(() => upload(request))
    uploads = result.catch(() => {})
    return result
  }

  return {
    async handleRequest(request) {
      const url = new URL(request.url)
      if (url.pathname === '/api/media' && request.method === 'POST') return await enqueueUpload(request)
      const match = /^\/(blobs|media)\/([A-Za-z0-9_-]{43})$/.exec(url.pathname)
      if (match && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: publicHeaders })
      if (match && ['GET', 'HEAD'].includes(request.method)) {
        return match[1] === 'blobs'
          ? await blockResponse(request, match[2])
          : await mediaResponse(request, match[2])
      }
      return null
    }
  }
}
