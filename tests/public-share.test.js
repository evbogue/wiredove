import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nacl from '../vendor/anproto/lib/nacl-fast-es.js'
import { an } from '../vendor/anproto/an.js'
import { yaml } from '../vendor/apds/yaml.js'
import { createProtocol } from '../client/protocol.js'
import { createPublicShare } from '../server/public-share.js'
import { createApplicationBackend } from '../application_backend.js'

nacl.setPRNG(bytes => crypto.getRandomValues(bytes))
const protocol = createProtocol({ an, yaml })
const origin = 'https://share.example'
const webID = value => value.replace(/\+/g, '-').replace(/\//g, '_').slice(0, -1)

test('public shares resolve signed content, reserve collision-safe aliases, and verify after restart', async t => {
  const dataDir = await fs.mkdtemp(join(tmpdir(), 'wiredove-shares-'))
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }))
  const archive = await createApplicationBackend({ dataDir: join(dataDir, 'archive') })
  const key = await an.gen()
  const parent = await protocol.compose(key, 'Parent post', { name: 'Author <name>' })
  const image = 'B'.repeat(43)
  const reply = await protocol.compose(key, '[Link](https://example.org) <script>alert(0)</script>\n\n![Verified &#91;photo&#93; &#38; caption](/#' + image + ')\n\n![Unavailable photo](/#' + 'C'.repeat(43) + ')', { reply: parent.id })
  for (const record of [parent, reply]) {
    const response = await archive.handleRequest(new Request(origin + '/api/application', { method: 'POST', body: JSON.stringify(record) }))
    assert.equal(response.status, 200)
  }
  const pathID = webID(reply.id)
  const conflict = pathID.slice(0, 8) + 'A'.repeat(35)
  await fs.writeFile(join(dataDir, 'aliases.json'), JSON.stringify([[pathID.slice(0, 8), conflict]]))
  const options = { origin, dataDir, readRecords: archive.readRecords, readMedia: request => {
    assert.equal(request.method, 'HEAD')
    if (request.url !== origin + '/media/' + image) return new Response(null, { status: 404 })
    return new Response(null, { headers: { 'Content-Type': 'image/png' } })
  } }
  let share = await createPublicShare(options)
  const request = (path, method) => share(new Request(origin + path, { method }))
  const issue = id => request('/api/share?id=' + id, 'POST').then(response => response.json())
  const [a, b] = await Promise.all([issue(pathID), issue(pathID)])
  assert.equal(a.url, origin + '/' + pathID.slice(0, 9))
  assert.deepEqual(a, b)

  share = await createPublicShare(options)
  assert.equal((await issue(pathID)).url, a.url)
  assert.equal((await request('/' + pathID.slice(0, 8))).status, 404)
  const response = await request('/' + pathID.slice(0, 9))
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/)
  assert(html.includes('<meta property="og:url" content="' + origin + '/' + pathID + '">'))
  assert(html.includes('<meta property="og:image" content="' + origin + '/media/' + image + '">'))
  assert(html.includes('<img src="/media/' + image + '" alt="Verified [photo] &amp; caption" loading="lazy">'))
  assert(html.includes('Unavailable photo'))
  assert(!html.includes('/media/' + 'C'.repeat(43)))
  assert(html.includes('href="https://example.org/"'))
  assert(html.includes('Parent post'))
  assert(!html.includes('>Parent message<'))
  assert(html.includes('Author &lt;name&gt;'))
  assert(!html.includes('<script>'))
  assert(html.includes('class="bar-brand"'))
  assert(html.includes('M16 7h.01'))
  assert(html.includes('aria-label="App" title="App"'))
  assert(html.includes('M5 12h14'))
  assert(!html.includes('/dove_sm.png'))
  assert(html.includes('href="/?enter=shared#' + reply.id + '"'))
  assert(html.includes('class="date" href="/?enter=shared#' + reply.id + '"'))
  assert(html.includes('class="date" href="/?enter=shared#' + parent.id + '"'))
  assert.equal((await request('/' + pathID, 'HEAD')).body, null)
  assert.equal((await request('/api/share?id=' + pathID)).status, 405)
  assert.equal((await request('/' + pathID, 'POST')).status, 405)
  const profile = await issue(webID(reply.author))
  assert.equal(new URL(profile.url).pathname.length, 9)
  const profileHTML = await (await request(new URL(profile.url).pathname)).text()
  assert(profileHTML.includes('<h1>'))
  assert(profileHTML.includes('href="/?enter=shared#' + reply.author + '"'))
  assert(profileHTML.includes('/wiredove-share-bird.png'))
  const records = await (await request('/api/public-record?id=' + pathID)).json()
  assert.deepEqual(records.records.map(record => record.id), [reply.id, parent.id])

  const appOrigin = 'http://127.0.0.1:5176'
  share = await createPublicShare({ ...options, appOrigin })
  const prototypeHTML = await (await request('/' + pathID)).text()
  assert(prototypeHTML.includes('href="' + appOrigin + '/#' + reply.id + '" aria-label="App"'))
  assert(prototypeHTML.includes('class="date" href="' + appOrigin + '/#' + parent.id + '"'))
  const prototypeProfile = await (await request(new URL(profile.url).pathname)).text()
  assert(prototypeProfile.includes('href="' + appOrigin + '/#' + reply.author + '" aria-label="App"'))
})
