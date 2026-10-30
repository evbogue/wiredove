import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFeedQueries } from '../client/runtime/feed-queries.js'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
test('feed snapshots preserve APDS indexes, deduplicate and deterministically order ties', async () => {
  const rows = [{ hash: 'b', ts: 2 }, { hash: 'c', ts: 1 }, { hash: 'a', ts: 2 }, { hash: 'b', ts: 2 }]
  let selected
  const queries = createFeedQueries({ protocol: { query: async route => { selected = route; return rows } } })
  assert.deepEqual((await queries.query('?term')).map(r => r.hash), ['a', 'b', 'c'])
  assert.equal(selected, '?term')
  assert.equal(rows[0].hash, 'b')
  await queries.query(''); assert.equal(selected, undefined)
  queries.destroy()
})
test('route cancellation and disposal discard late snapshots', async () => {
  const wait = deferred(), controller = new AbortController()
  const queries = createFeedQueries({ protocol: { query: () => wait.promise } })
  const snapshot = queries.query('author', { signal: controller.signal })
  controller.abort(); wait.resolve([])
  await assert.rejects(snapshot, { name: 'AbortError' })
  queries.destroy()
  await assert.rejects(queries.query(), /disposed/)
})
test('refresh coalesces concurrent callers, reports failure and allows exact retry; disposal unsubscribes', async () => {
  const wait = deferred(); let calls = 0, events = 0, sourceListener, unsubscribed = false
  const queries = createFeedQueries({ protocol: {}, refresh: async () => { calls++; if (calls === 1) { await wait.promise; throw Error('offline') } },
    subscribe(listener) { sourceListener = listener; return () => { unsubscribed = true } } })
  queries.subscribe(() => { events++ })
  const a = queries.refresh(), b = queries.refresh()
  assert.equal(a, b)
  wait.resolve()
  await assert.rejects(a, /offline/)
  assert.equal(events, 0)
  await queries.refresh(); assert.equal(calls, 2); assert.equal(events, 1)
  sourceListener(); assert.equal(events, 2)
  queries.destroy(); sourceListener(); assert.equal(events, 2); assert.equal(unsubscribed, true)
  await assert.rejects(queries.refresh(), /disposed/)
})
