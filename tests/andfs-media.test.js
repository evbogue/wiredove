import { strict as assert } from 'node:assert';
import { createAndFsMediaService } from '../andfs_media_server.js';
import { an } from '../vendor/anproto/an.js';
import { createAndFS, SIZE } from '../vendor/andfs/andfs.js';
import { memoryStore } from '../vendor/andfs/stores.js';
import { createAndFSMediaClient, readAndFSMedia } from '../client/andfs.js';

async function fixture(options = {}) {
  const dataDir = await Deno.makeTempDir();
  const key = await an.gen();
  let service = await createAndFsMediaService({ dataDir, ...options });
  const fetchImpl = (url, init) => service.handleRequest(new Request(new URL(url, 'http://wiredove.test'), init));
  const files = createAndFS({ store: memoryStore() });
  const client = createAndFSMediaClient({ files, fetchImpl, origin: () => 'http://wiredove.test', signPayload: async content => an.sign(await an.hash(content), key) });
  return { dataDir, key, files, client, fetchImpl,
    restart: async () => { service = await createAndFsMediaService({ dataDir, ...options }); },
    close: () => Deno.remove(dataDir, { recursive: true }) };
}
function bytes(size = SIZE * 2 + 731) {
  return Uint8Array.from({ length: size }, (_, i) => i % 251);
}
async function authorized(f, data, changes = {}, body = data, signatureTransform = value => value) {
  const { manifestHash } = await f.files.add(data);
  const content = JSON.stringify({ action: 'andfs-upload-v1', andfs: manifestHash, mime: 'video/webm', media_size: data.length, ...changes });
  const signature = signatureTransform(await an.sign(await an.hash(content), f.key));
  return await f.fetchImpl('/api/media', { method: 'POST', headers: { 'X-ANProto-Content': content, 'X-ANProto-Signature': signature }, body });
}

Deno.test('image/audio/video uploads replicate to a fresh verified store, survive restart, and support ranges', async () => {
  const f = await fixture();
  try {
    for (const [index, mime] of ['audio/wav', 'video/webm', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'].entries()) {
      const data = bytes();
      data[0] = index;
      const meta = await f.client.upload(new File([data], 'fixture', { type: mime }));
      assert.equal(meta.type, mime.split('/')[0]);
      assert.equal('blob' in meta, false);
      await f.restart();
      // A second client has no uploader cache. Download every block over the public API.
      const replica = memoryStore();
      assert.deepEqual(await readAndFSMedia(meta, { store: replica, fetchImpl: f.fetchImpl }), data);
      const original = await f.files.manifest(meta.andfs);
      const copied = createAndFS({ store: replica });
      assert.deepEqual(await copied.manifest(meta.andfs), original);
      for (const id of [meta.andfs, ...original.chunks]) assert.deepEqual(await replica.get(id), await f.files.getBlock(id, { maxBytes: 1024 * 1024 }));
      const full = await f.fetchImpl(meta.media_url);
      assert.equal(full.status, 200);
      assert.deepEqual(new Uint8Array(await full.arrayBuffer()), data);
      for (const [range, start, end] of [['bytes=262130-262170', 262130, 262171], ['bytes=-99', data.length - 99, data.length], ['bytes=524280-', 524280, data.length]]) {
        const response = await f.fetchImpl(meta.media_url, { headers: { range } });
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), `bytes ${start}-${end - 1}/${data.length}`);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), data.slice(start, end));
      }
      const head = await f.fetchImpl(meta.media_url, { method: 'HEAD' });
      assert.equal(head.headers.get('content-length'), String(data.length));
      assert.equal((await head.arrayBuffer()).byteLength, 0);
      for (const range of ['bytes=999999-', 'bytes=-0', 'bytes=3-2', 'bytes=1-2,4-5']) assert.equal((await f.fetchImpl(meta.media_url, { headers: { range } })).status, 416);
      const preflight = await f.fetchImpl(meta.media_url, { method: 'OPTIONS' });
      assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    }
  } finally { await f.close(); }
});

Deno.test('invalid, expired, changed, empty, oversized and interrupted uploads never become available', async () => {
  const f = await fixture({ maxMediaBytes: 100 });
  try {
    const data = bytes(80);
    assert.equal((await f.fetchImpl('/api/media', { method: 'POST', body: data })).status, 400);
    assert.equal((await authorized(f, data, {}, data, sig => sig.slice(0, -8) + 'AAAAAAAA')).status, 400);
    const changed = data.slice(); changed[0]++;
    assert.equal((await authorized(f, data, {}, changed)).status, 400);
    assert.equal((await authorized(f, data, {}, data.slice(1))).status, 400);
    assert.equal((await authorized(f, new Uint8Array())).status, 400);
    assert.equal((await authorized(f, bytes(101))).status, 400);
    assert.equal((await authorized(f, data, { reply: 'A'.repeat(43) + '=' })).status, 400);
    const originalNow = Date.now;
    let oldSignature;
    const content = JSON.stringify({ action: 'andfs-upload-v1', andfs: (await f.files.add(data)).manifestHash, mime: 'audio/wav', media_size: data.length });
    try { Date.now = () => originalNow() - 600001; oldSignature = await an.sign(await an.hash(content), f.key); }
    finally { Date.now = originalNow; }
    assert.equal((await f.fetchImpl('/api/media', { method: 'POST', headers: { 'X-ANProto-Content': content, 'X-ANProto-Signature': oldSignature }, body: data })).status, 400);
    const interrupted = new ReadableStream({ start(c) { c.enqueue(data.slice(0, 5)); c.error(new Error('connection lost')); } });
    assert.equal((await authorized(f, data, {}, interrupted)).status, 400);
    assert.equal((await Array.fromAsync(Deno.readDir(`${f.dataDir}/media`))).length, 0);
    assert.equal((await Array.fromAsync(Deno.readDir(`${f.dataDir}/andfs/blocks`))).length, 0);
    assert.equal((await authorized(f, data)).status, 201, 'retry after interrupted upload failed');
  } finally { await f.close(); }
});

Deno.test('duplicate retries repair missing/corrupt blocks without duplicate quota or metadata', async () => {
  const f = await fixture({ quotaBytes: SIZE * 3, maxUploadsPerHour: 1 });
  try {
    const data = bytes();
    const meta = await f.client.upload(new File([data], 'clip.webm', { type: 'video/webm' }));
    const manifest = await f.files.manifest(meta.andfs);
    const block = `${f.dataDir}/andfs/blocks/${manifest.chunks[0]}`;
    for (const corrupt of [false, true]) {
      if (corrupt) await Deno.writeFile(block, new Uint8Array([0]));
      else await Deno.remove(block);
      const missing = await f.fetchImpl(`/blobs/${manifest.chunks[0]}`);
      assert.equal(missing.status, 404);
      assert.equal(missing.headers.get('cache-control'), 'no-store');
      const gateway = await f.fetchImpl(meta.media_url);
      await assert.rejects(() => gateway.arrayBuffer());
      await assert.rejects(() => readAndFSMedia(meta, { fetchImpl: f.fetchImpl }));
      assert.equal((await authorized(f, data)).status, 200);
      assert.deepEqual(await readAndFSMedia(meta, { fetchImpl: f.fetchImpl }), data);
    }
    assert.equal((await Array.fromAsync(Deno.readDir(`${f.dataDir}/media`))).length, 1);
    assert.equal((await authorized(f, bytes(12))).status, 400, 'rate limit was bypassed');
  } finally { await f.close(); }
});

Deno.test('concurrent uploads respect quota and duplicate uploads are idempotent', async () => {
  const f = await fixture({ quotaBytes: 100 });
  try {
    const data = bytes(80);
    const other = data.slice(); other[0]++;
    const results = await Promise.all([authorized(f, data), authorized(f, other)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
    const accepted = results[0].status === 201 ? data : other;
    const duplicate = await Promise.all([authorized(f, accepted), authorized(f, accepted)]);
    assert.deepEqual(duplicate.map(r => r.status), [200, 200]);
  } finally { await f.close(); }
});

Deno.test('uploader rejects missing server confirmation and reader rejects tampering and signed size mismatch', async () => {
  const f = await fixture();
  try {
    const meta = await f.client.upload(new File([bytes(10)], 'audio.wav', { type: 'audio/wav' }));
    await assert.rejects(() => readAndFSMedia({ ...meta, media_size: 11 }, { fetchImpl: f.fetchImpl }), /size/);
    await assert.rejects(() => readAndFSMedia(meta, { fetchImpl: async () => new Response('tampered') }), /verified source/);
    await assert.rejects(() => readAndFSMedia({ ...meta, media_source: 'javascript:alert(1)' }), /source URL/);
    const client = createAndFSMediaClient({ files: f.files, signPayload: async () => 'signature', fetchImpl: async () => Response.json({}) });
    await assert.rejects(() => client.upload(new File(['clip'], 'clip.webm', { type: 'video/webm' })), /did not confirm/);
  } finally { await f.close(); }
});
