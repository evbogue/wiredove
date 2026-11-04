import nacl from "../vendor/anproto/lib/nacl-fast-es.js";
nacl.setPRNG(bytes => crypto.getRandomValues(bytes));
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as nodeTest } from "node:test";
const test = globalThis.Deno?.test || nodeTest;
import { runMonitor } from '../scripts/monitor-posts.js'
import { createProtocol } from '../client/protocol.js'
import { an } from '../vendor/anproto/an.js'
const assert = (value, message) => { if (!value) throw new Error(message) }
const rejects = async fn => { let failed = false; try { await fn() } catch { failed = true } assert(failed, 'Expected failure') }

test('monitor CLI baseline, atomic restart/deduplication, retry, invalid state and overlapping runs', async () => {
  const directory = globalThis.Deno ? await Deno.makeTempDir() : await fs.mkdtemp(join(tmpdir(), "wiredove-monitor-"))
  const path = directory + '/state.json'
  try {
    const protocol = createProtocol({ an, yaml: { parse: JSON.parse, create: JSON.stringify } })
    const content = JSON.stringify({ body: 'Monitor fixture' })
    const signature = await an.sign(await an.hash(content), await an.gen())
    const id = await an.hash(signature)
    const contentHash = await an.hash(content)
    const messages = new Map([[id, [signature]], [contentHash, [content]]])
    let entries = [{ event: 'message', id: 'baseline', message: 'Old entry' }]
    const reports = []
    const urls = []
    const options = { protocol, relay: { gossip: async key => messages.get(key) || [] },
      fetchImpl: async url => { urls.push(String(url)); return new Response(entries.map(entry => JSON.stringify(entry)).join('\n')) },
      report: async post => { reports.push(post.id) }, info: () => {} }
    const readState = async () => JSON.parse(await fs.readFile(path, "utf8"))
    await runMonitor(path, options)
    assert((await readState()).cursor === 'baseline', 'Baseline missing')
    assert(reports.length === 0, 'Reported old history')
    entries = [{ event: 'message', id: 'new', message: 'https://wiredove.net/#' + id }]
    await runMonitor(path, options)
    assert(new URL(urls.at(-1)).searchParams.get('since') === 'baseline', 'Cursor not sent to ntfy')
    assert(reports.length === 1 && reports[0] === id, 'Verified post missing')
    entries = [{ event: 'message', id: 'duplicate', message: 'https://wiredove.net/#' + signature }]
    await runMonitor(path, options)
    assert(reports.length === 1, 'Duplicate after restart')
    assert((await readState()).cursor === 'duplicate', 'Duplicate cursor not advanced')
    entries = [{ event: 'message', id: 'retry', message: 'https://wiredove.net/#' + id }]
    messages.set(contentHash, ['tampered'])
    await rejects(() => runMonitor(path, options))
    assert((await readState()).cursor === 'duplicate', 'Advanced past unavailable content')
    messages.set(contentHash, [content])
    await runMonitor(path, options)
    assert((await readState()).cursor === 'retry', 'Recovery failed')
    await fs.writeFile(path + '.lock', '')
    await rejects(() => runMonitor(path, options))
    await fs.rm(path + '.lock')
    const saved = await fs.readFile(path, "utf8")
    await rejects(() => runMonitor(path, { ...options, fetchImpl: async () => new Response('', { status: 503 }) }))
    assert(await fs.readFile(path, "utf8") === saved, 'Network failure reset state')
    await fs.writeFile(path, '{broken')
    await rejects(() => runMonitor(path, options))
    assert(await fs.readFile(path, "utf8") === '{broken', 'Malformed state reset silently')
    assert((await fs.readdir(directory)).every(file => file === 'state.json'), 'Temporary files or locks leaked')
  } finally { await fs.rm(directory, { recursive: true }) }
})
