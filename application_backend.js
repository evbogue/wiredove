import { an } from './vendor/anproto/an.js'

// Append-only verified artifact archive. Scope is this backend's stored records,
// not the public network. Sequence cursors do not depend on author timestamps.
export const createApplicationBackend = async ({ dataDir = './data/application' } = {}) => {
  await Deno.mkdir(dataDir, { recursive: true })
  let queue = Promise.resolve()
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result }
  const file = `${dataDir}/records.json`
  let records
  try { records = JSON.parse(await Deno.readTextFile(file)) }
  catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; records = [] }
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json', 'cache-control': 'no-store' }
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers })
  return { async handleRequest(request) {
    const url = new URL(request.url)
    if (url.pathname !== '/api/application') return null
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    try {
      if (request.method === 'GET') {
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0)
        const page = records.slice(after, after + 100)
        return json({ records: page, cursor: after + page.length, more: after + page.length < records.length, scope: 'backend-archive' })
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
      if (Number(request.headers.get('content-length')) > 2 * 1024 * 1024) return json({ error: 'Artifact too large' }, 413)
      const reader = request.body?.getReader()
      const parts = []; let size = 0
      if (reader) while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 2 * 1024 * 1024) { await reader.cancel(); return json({ error: 'Artifact too large' }, 413) }
        parts.push(value)
      }
      const bytes = new Uint8Array(size); let offset = 0
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
      const text = new TextDecoder().decode(bytes)
      if (text.length > 2 * 1024 * 1024) return json({ error: 'Artifact too large' }, 413)
      const { id: claimedID, signature, content } = JSON.parse(text)
      if (typeof signature !== 'string' || typeof content !== 'string') throw Error('Missing signed artifact')
      const opened = await an.open(signature)
      if (!/^\d{13}/.test(opened) || opened.substring(13) !== await an.hash(content)) throw Error('Artifact verification failed')
      const id = await an.hash(signature)
      if (claimedID !== undefined && claimedID !== id) throw Error('Artifact ID mismatch')
      return await serial(async () => {
        if (!records.some(record => record.id === id)) {
          const next = [...records, { id, signature, content }]
          const temporary = `${file}.${crypto.randomUUID()}.tmp`
          await Deno.writeTextFile(temporary, JSON.stringify(next))
          await Deno.rename(temporary, file)
          records = next
        }
        return json({ id, saved: true })
      })
    } catch (error) { return json({ error: error.message }, 400) }
  } }
}
