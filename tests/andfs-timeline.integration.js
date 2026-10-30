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
let previous;
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
    assert.deepEqual(await readAndFSMedia(received.parsed), data);

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
    assert.deepEqual(await readAndFSMedia(back.parsed), data);
    assert.deepEqual(await readAndFSMedia(meta), data);
    // Both hosts return the same stored block bytes, beyond just matching manifest IDs.
    const manifest = JSON.parse(new TextDecoder().decode(a.manifest));
    for (const id of [a.manifestHash, ...manifest.chunks]) {
      const left = await fetch(`${wiredoveURL}/blobs/${id}`), right = await fetch(`${timelineURL}/blobs/${id}`);
      assert.deepEqual(new Uint8Array(await left.arrayBuffer()), new Uint8Array(await right.arrayBuffer()));
    }
    previous = reply.id;
    report.push(`${mime}: matching blocks; Wiredove → local gossip relay → Timeline; Timeline reply → relay → Wiredove; exact signatures/content; media verified after both services restart`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all(servers.map(server => server.shutdown()));
  await Deno.remove(temp, { recursive: true });
}
