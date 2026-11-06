// Optional cross-repository acceptance against the actual Timeline service:
// deno run --allow-read --allow-write --allow-net --allow-env tests/andfs-timeline.integration.js /absolute/path/to/evbogue.com/timeline
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { createAndFsMediaService } from '../andfs_media_server.js';
import { createAndFSMediaClient, readAndFSMedia } from '../client/andfs.js';
import { createProtocol } from '../client/protocol.js';
import { createWiredoveRelay } from '../client/relay.js';
import { loadWiredoveFeed } from '../client/feed.js';
import { createAndFS } from '../vendor/andfs/andfs.js';
import { memoryStore } from '../vendor/andfs/stores.js';
import { an } from '../vendor/anproto/an.js';

const directory = Deno.args[0];
if (!directory?.startsWith('/')) throw new Error('Pass the absolute Timeline source directory');
const { createTimeline } = await import(pathToFileURL(directory + '/server.js').href);
const { yaml, verify: timelineVerify } = await import(pathToFileURL(directory + '/protocol.js').href);
const timelineAndFS = await import(pathToFileURL(directory + '/vendor/andfs/andfs.js').href);
const protocol = createProtocol({ an, yaml });
const key = await an.gen();
const temp = await Deno.makeTempDir();
const servers = [];
const listen = (handler) => {
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler);
  servers.push(server);
  return `http://127.0.0.1:${server.addr.port}`;
};
// Local test relay, using the normal gossip HTTP contract. No public network writes.
const values = new Map(), latest = new Map(), signatures = [];
let relayOnline = true;
const relayURL = listen(async request => {
  if (!relayOnline) return new Response(null, { status: 503 });
  if (new URL(request.url).pathname === '/gossip/poll') return Response.json({ messages: [...values.values()], nextSince: 1 });
  const value = await request.text();
  if (value.length === 44) return Response.json({ messages: [values.get(value) || latest.get(value)].filter(Boolean) });
  values.set(await an.hash(value), value);
  try {
    const proof = await protocol.open(value);
    latest.set(proof.author, value); signatures.push(value);
  } catch { /* A content value. */ }
  return Response.json({ messages: [] });
});
const relay = createWiredoveRelay({ baseURL: relayURL });
const config = { owner: key.slice(0, 44), relay: relayURL, maxMediaBytes: 33554432, mediaQuotaBytes: 1073741824 };
let timeline = await createTimeline({ directory: temp + '/timeline', config });
let wiredove = await createAndFsMediaService({ dataDir: temp + '/wiredove' });
const wiredoveURL = listen(async request => await wiredove.handleRequest(request) || new Response(null, { status: 404 }));
const timelineURL = listen(request => timeline.fetch(request)) + '/timeline';
const requestJSON = async (path, body) => {
  const response = await fetch(timelineURL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(response.ok, await response.clone().text());
  return await response.json();
};
const uploader = (source) => createAndFSMediaClient({
  files: createAndFS({ store: memoryStore() }),
  endpoint: source + '/api/media', origin: () => source,
  signPayload: payload => protocol.signPayload(payload, key)
});
let previous, lastMeta;
const report = [];
try {
  for (const [index, mime] of ['audio/wav', 'video/webm'].entries()) {
    const data = Uint8Array.from({ length: 600000 + index }, (_, i) => i % 251);
    // Independent implementations must yield identical manifests and blocks.
    const a = await createAndFS({ store: memoryStore() }).add(data);
    const b = await timelineAndFS.createAndFS({ store: memoryStore() }).add(data);
    assert.deepEqual(a.manifest, b.manifest);
    assert.equal(a.manifestHash, b.manifestHash);
    const meta = await uploader(wiredoveURL).upload(new File([data], 'fixture', { type: mime }));
    lastMeta = meta;
    const root = await protocol.compose(key, `Local AndFS test\n\n${meta.media_url}`, { ...meta, ...(previous ? { previous } : {}) });
    relayOnline = false;
    await assert.rejects(() => relay.publish(root), /503/);
    relayOnline = true;
    await relay.publish(root);
    await relay.publish(root); // Duplicate delivery.
    const sync = await requestJSON('/api/sync', {});
    assert.ok(sync.added >= 1);
    let rows = (await (await fetch(timelineURL + '/api/posts')).json()).posts;
    const received = rows.find(row => row.id === root.id);
    assert.ok(received, 'Timeline did not replicate Wiredove post');
    assert.equal(received.signature, root.signature);
    assert.equal(received.content, root.content);
    await timelineVerify(received.signature, received.content);
    // The Timeline syncs the post, not the blocks: only the Wiredove host
    // holds the original upload at this point. Origin-free `/#hash`
    // references (since fcab6e8, 2026-10-31) carry no source, so the
    // consumer must name it.
    assert.deepEqual(await readAndFSMedia(received.parsed, { baseURL: wiredoveURL }), data);

    const replyMeta = await uploader(timelineURL).upload(new File([data], 'reply', { type: mime }), { reply: root.id, replyto: root.author });
    const reply = await protocol.compose(key, `Local media reply\n\n${replyMeta.media_url}`, { ...replyMeta, previous: root.id, reply: root.id, replyto: root.author });
    const saved = await requestJSON('/api/posts', reply);
    assert.equal(saved.relayed, true);
    timeline = await createTimeline({ directory: temp + '/timeline', config });
    wiredove = await createAndFsMediaService({ dataDir: temp + '/wiredove' });
    const loaded = await loadWiredoveFeed({ feed: root.author, baseURL: relayURL, protocol });
    const back = loaded.find(row => row.id === reply.id);
    assert.ok(back, 'Wiredove did not retrieve Timeline reply');
    assert.equal(back.content, reply.content);
    assert.equal(back.signature, reply.signature);
    assert.equal(back.parsed.reply, root.id);
    assert.equal(back.parsed.replyto, root.author);
    assert.equal(back.parsed.previous, root.id);
    // The reply media was uploaded to the Timeline host only; the original
    // upload lives on the Wiredove host. Each read names its source.
    assert.deepEqual(await readAndFSMedia(back.parsed, { baseURL: timelineURL }), data);
    assert.deepEqual(await readAndFSMedia(meta, { baseURL: wiredoveURL }), data);
    // Both hosts return the same stored block bytes, beyond just matching manifest IDs.
    const manifest = JSON.parse(new TextDecoder().decode(a.manifest));
    for (const id of [a.manifestHash, ...manifest.chunks]) {
      const left = await fetch(`${wiredoveURL}/blobs/${id}`), right = await fetch(`${timelineURL}/blobs/${id}`);
      assert.deepEqual(new Uint8Array(await left.arrayBuffer()), new Uint8Array(await right.arrayBuffer()));
    }
    previous = reply.id;
    report.push(`${mime}: matching blocks; Wiredove → local gossip relay → Timeline; Timeline reply → relay → Wiredove; exact signatures/content; media verified after both services restart`);
  }
  // Unavailable media fails loudly on both hosts instead of returning
  // wrong or empty bytes.
  const missing = 'A'.repeat(43);
  // The AndFS verifier reports the missing manifest before any bytes move.
  await assert.rejects(() => readAndFSMedia({ andfs: missing, media_url: '/#' + missing }, { baseURL: wiredoveURL }), /No verified source for blob/);
  const missingResponse = await fetch(`${timelineURL}/blobs/${missing}`);
  assert.ok(!missingResponse.ok, 'Timeline should not serve unknown blocks');
  // Reverse-order import: the reply arrives before its parent.
  const root2 = await protocol.compose(key, `Reverse-order root\n\n${lastMeta.media_url}`, { ...lastMeta, previous });
  const reply2 = await protocol.compose(key, 'Reverse-order reply', { ...lastMeta, previous: root2.id, reply: root2.id, replyto: root2.author });
  const imported = await requestJSON('/api/import', { posts: [{ signature: reply2.signature, content: reply2.content }, { signature: root2.signature, content: root2.content }] });
  assert.equal(imported.imported, 2);
  const rows2 = (await (await fetch(timelineURL + '/api/posts')).json()).posts;
  const back2 = rows2.find(row => row.id === reply2.id);
  assert.ok(back2, 'Timeline did not import the reply-first pair');
  assert.equal(back2.parsed.reply, root2.id);
  assert.equal(back2.parsed.previous, root2.id);
  report.push('unavailable media rejected on both hosts; reply-before-parent import lands with its links intact');
  // Edit-first sync: the edit reaches the relay before its target post.
  const root3 = await protocol.compose(key, `Edit-order root\n\n${lastMeta.media_url}`, { ...lastMeta, previous });
  const edit3 = await protocol.compose(key, 'Edit-order root, edited', { edit: root3.id, previous: root3.id });
  await relay.publish(edit3);
  await relay.publish(root3);
  const timeline3 = await createTimeline({ directory: temp + '/timeline3', config });
  const timeline3URL = listen(request => timeline3.fetch(request)) + '/timeline';
  const sync3 = await (await fetch(timeline3URL + '/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  assert.ok(sync3.added >= 2);
  const rows3 = (await (await fetch(timeline3URL + '/api/posts')).json()).posts;
  const stored3 = rows3.find(row => row.id === edit3.id);
  assert.ok(stored3, 'Timeline did not sync the edit-first pair');
  assert.equal(stored3.parsed.edit, root3.id);
  assert.ok(rows3.find(row => row.id === root3.id), 'Timeline did not sync the edit target');
  report.push('edit published before its target syncs with its links intact');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all(servers.map(server => server.shutdown()));
  await Deno.remove(temp, { recursive: true });
}
