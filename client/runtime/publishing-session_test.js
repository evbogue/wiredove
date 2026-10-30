import { strict as assert } from 'node:assert';
import { createPublishingSession } from './publishing-session.js';

Deno.test('publishing session persists exact retry across reload, retains author chain and protects identity', async () => {
  const state = new Map();
  const store = { get: async key => structuredClone(state.get(key)), set: async (key, value) => { state.set(key, structuredClone(value)); }, delete: async key => { state.delete(key); } };
  const received = [];
  let offline = true, signed = 0;
  const protocol = {
    generate: async () => 'key',
    identity: async key => { if (key !== 'key') throw new Error('Invalid identity'); return 'author'; },
    compose: async (_key, body, metadata) => ({ id: 'post-' + (++signed), signature: 'signature-' + signed, content: body, parsed: metadata }),
  };
  const host = {
    latest: async () => ({ latest: { id: 'previous', parsed: { name: 'Old name', image: 'existing-photo', bio: '' } }, remoteAvailable: true }),
    publishSigned: async record => { received.push(record); if (offline) throw new Error('offline'); return { saved: true, relayed: true, post: record }; },
  };
  const create = () => createPublishingSession({ store, protocol, host, owner: 'author' });
  let session = create(); await session.initialize(); await session.create('Visitor');
  await assert.rejects(() => session.import('invalid'), /Invalid identity/);
  assert.equal(session.identity().author, 'author');
  await assert.rejects(() => session.publish({ body: 'Exact body', replyTo: { id: 'parent', author: 'owner' } }), /offline/);
  assert.equal((await session.pending())[0].parsed.previous, 'previous');
  assert.equal((await session.pending())[0].parsed.reply, 'parent');
  assert.equal((await session.pending())[0].parsed.image, 'existing-photo');
  assert.equal((await session.pending())[0].parsed.bio, '');
  assert.equal((await session.pending())[0].parsed.name, 'Visitor');
  await assert.rejects(() => session.publish({ body: 'Another post' }), /Retry/);
  await assert.rejects(() => session.import('key'), /pending/);
  session = create(); await session.initialize();
  offline = false; await session.retry();
  assert.deepEqual(received[0], received[1]);
  assert.equal(signed, 1);
  assert.equal((await session.pending()).length, 0);
  assert.equal(session.identity().name, 'Visitor');
});
