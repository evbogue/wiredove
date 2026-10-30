// Hosts supply protocol, storage and transport. No keys cross the service boundary.
export function createPublishingSession({ store, protocol, host, uploadMedia, owner }) {
  let current;
  let queue = Promise.resolve();
  const serial = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const info = () => current ? { author: current.author, name: current.name || '' } : null;
  async function initialize() {
    const saved = await store.get('identity');
    if (saved) {
      const author = await protocol.identity(saved.keypair);
      current = { ...saved, author };
    }
    return info();
  }
  async function adopt(keypair, name) {
    const author = await protocol.identity(keypair);
    const next = { keypair, author, name: String(name || '').trim().slice(0, 100) };
    await store.set('identity', next);
    current = next;
    return info();
  }
  async function pending() { return await store.get('outbox') || []; }
  async function deliver(record) {
    const result = await host.publishSigned(record);
    if (result.saved) await store.delete('draft:' + (record.parsed.reply || 'new'));
    if (result.relayed) await store.set('outbox', (await pending()).filter(row => row.id !== record.id));
    return result;
  }
  return {
    store, initialize, identity: info,
    create: name => serial(async () => {
      if (current) throw new Error('An identity is already active.');
      return await adopt(await protocol.generate(), name);
    }),
    import: (backup, name) => serial(async () => {
      // Accept the raw Wiredove/APDS keypair or the portable JSON backup.
      let value = backup.trim(), profileName = name;
      if (value.startsWith('{')) {
        const parsed = JSON.parse(value);
        value = parsed.keypair; profileName ||= parsed.name;
      }
      if (typeof value !== 'string') throw new Error('This backup has no Wiredove keypair.');
      if ((await pending()).length) throw new Error('Retry pending publications before changing identity.');
      return await adopt(value, profileName);
    }),
    export: () => {
      if (!current) throw new Error('Create or import an identity first.');
      return JSON.stringify({ format: 'wiredove-identity-v1', keypair: current.keypair, name: current.name }, null, 2);
    },
    pending,
    retry: () => serial(async () => {
      const results = [];
      for (const record of await pending()) results.push(await deliver(record));
      return results;
    }),
    publish: draft => serial(async () => {
      if (!current) throw new Error('Create or import your identity above. Your draft is saved.');
      if (!draft.replyTo && current.author !== owner) throw new Error('Only the site owner can start a post.');
      if ((await pending()).length) throw new Error('Retry the pending publication above before signing another post.');
      const { latest, remoteAvailable } = await host.latest(current.author);
      if (!remoteAvailable) throw new Error('Author history is unavailable. Keep your draft and try again when Wiredove reconnects.');
      const profile = {};
      for (const field of ['name', 'image', 'image_original', 'image_crop', 'bio', 'links']) {
        if (latest?.parsed?.[field] !== undefined) profile[field] = latest.parsed[field];
      }
      const metadata = { ...profile, ...(current.name ? { name: current.name } : {}),
        ...(latest ? { previous: latest.id } : {}),
        ...(draft.replyTo ? { reply: draft.replyTo.id, replyto: draft.replyTo.author } : {}),
      };
      if (draft.file) Object.assign(metadata, await uploadMedia(draft.file, current.keypair, metadata));
      const record = await protocol.compose(current.keypair, draft.body, metadata);
      // Persist before the request: an interrupted response is retried with the
      // original signature and bytes, never a second freshly signed publication.
      await store.set('outbox', [record]);
      return await deliver(record);
    }),
  };
}
