import test from 'node:test'
import assert from 'node:assert/strict'
import { ntfy } from '../ntfy.js'
import { announceConfirmedPost, notificationReference, consumeNotifications, resolveNotificationPost } from '../post_notifications.js'

const hash = 'a'.repeat(43) + '='
const contentHash = 'b'.repeat(43) + '='
const signature = 'c'.repeat(43) + '=' + 'd'.repeat(162) + '=='
const content = 'name: Test\n\nSigned body'
const opened = '1793290000000' + contentHash
const link = id => 'https://wiredove.net/#' + encodeURIComponent(id)

test('broadcast awaits one canonical hash URL and rejects raw YAML/signatures and failed delivery', async () => {
  const calls = []
  let release
  const pending = ntfy(hash, { fetchImpl: async (...args) => { calls.push(args); await new Promise(resolve => { release = resolve }); return new Response() } })
  let finished = false
  pending.then(() => { finished = true })
  await Promise.resolve()
  assert.equal(finished, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].body, 'https://wiredove.net/#' + hash)
  release(); await pending
  for (const invalid of [signature, content, '', null]) await assert.rejects(ntfy(invalid))
  await assert.rejects(ntfy(hash, { fetchImpl: async () => new Response('', { status: 503 }) }), /503/)
  await assert.rejects(ntfy(hash, { fetchImpl: async () => { throw Error('offline') } }), /offline/)
})

test('only confirmed and retrievable signature/content pairs generate a notification', async () => {
  const notified = []
  const reads = []
  const options = { hash, signature, content, opened, confirmation: { ok: true },
    relay: { gossip: async key => { reads.push(key); return key === hash ? [signature] : [content] } },
    notify: async id => { notified.push(id) } }
  assert.equal(await announceConfirmedPost({ ...options, confirmation: { ok: false } }), false)
  assert.deepEqual(reads, [])
  for (const missing of [hash, contentHash]) {
    await assert.rejects(announceConfirmedPost({ ...options, relay: { gossip: async key => key === missing ? [] : [signature] } }), /not retrievable/)
  }
  assert.deepEqual(notified, [])
  assert.equal(await announceConfirmedPost(options), true)
  assert.deepEqual(notified, [hash])
  await assert.rejects(announceConfirmedPost({ ...options, notify: async () => { throw Error('ntfy down') } }), /ntfy down/)
})

test('monitor accepts canonical and legacy signature links, ignoring raw YAML and foreign links', () => {
  assert.equal(notificationReference(link(hash)), hash)
  assert.equal(notificationReference(link(signature)), signature)
  for (const value of [link(content), 'https://evil.example/#' + hash, link(hash) + '%', 'https://wiredove.net/other#' + hash]) {
    assert.equal(notificationReference(value), null)
  }
})

test('monitor checkpoints verified IDs and deduplicates across restarts and legacy links', async () => {
  let disk = { cursor: 'baseline', seen: [] }
  const reported = []
  const entry = (id, message = link(hash)) => ({ event: 'message', id, message })
  const run = async entries => {
    const state = structuredClone(disk)
    await consumeNotifications(entries, { state,
      resolvePost: async () => ({ id: hash, content }), report: async post => reported.push(post.id),
      save: async next => { disk = structuredClone(next) } })
  }
  await run([entry('baseline'), entry('1'), entry('2', link(signature)), entry('3', link(content))])
  await run([entry('3', link(content)), entry('4')])
  assert.deepEqual(reported, [hash])
  assert.equal(disk.cursor, '4')
  assert.deepEqual(disk.seen, [hash])
})

test('unverified/unavailable posts and report failures leave cursor retryable', async () => {
  for (const failure of ['resolvePost', 'report', 'save']) {
    const state = { cursor: 'old', seen: [] }
    const options = { state, resolvePost: async () => ({ id: hash }), report: async () => {}, save: async () => {} }
    options[failure] = async () => { throw Error(failure) }
    await assert.rejects(consumeNotifications([{ event: 'message', id: 'new', message: link(hash) }], options), new RegExp(failure))
    assert.deepEqual(state, { cursor: 'old', seen: [] })
  }
})


test('monitor verifies real ANProto signatures and exact content, including legacy envelopes', async () => {
  const { default: nacl } = await import('../vendor/anproto/lib/nacl-fast-es.js')
  nacl.setPRNG(bytes => crypto.getRandomValues(bytes))
  const { an } = await import('../vendor/anproto/an.js')
  const { createProtocol } = await import('../client/protocol.js')
  const protocol = createProtocol({ an, yaml: { parse: JSON.parse, create: JSON.stringify } })
  const signedContent = JSON.stringify({ body: 'Verified monitor fixture' })
  const keypair = await an.gen()
  const signed = await an.sign(await an.hash(signedContent), keypair)
  const id = await an.hash(signed)
  const contentId = await an.hash(signedContent)
  const data = new Map([[id, [signed]], [contentId, [signedContent]]])
  const options = { protocol, relay: { gossip: async key => data.get(key) || [] } }
  assert.equal(notificationReference(link(signed)), signed)
  for (const reference of [id, signed]) {
    const post = await resolveNotificationPost(reference, options)
    assert.equal(post.id, id)
    assert.equal(post.content, signedContent)
  }
  // Correct content with a wrong message ID is still not the requested post.
  data.set(hash, [signed])
  await assert.rejects(resolveNotificationPost(hash, options), /unverifiable/)
  data.set(contentId, ['tampered'])
  await assert.rejects(resolveNotificationPost(id, options), /unverifiable/)
  data.set(contentId, [])
  await assert.rejects(resolveNotificationPost(id, options), /unavailable/)
  data.set(contentId, [signedContent])
  data.set(id, [signed.slice(0, 50) + (signed[50] === 'a' ? 'b' : 'a') + signed.slice(51)])
  await assert.rejects(resolveNotificationPost(id, options), /unverifiable/)
})
