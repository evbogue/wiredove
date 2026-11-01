import { createBrowserStore } from './browser-store.js'
import { validateIdentityBackup } from '../../identity_backup.js'
import { an } from '../../vendor/anproto/an.js'

// Explicit opt-in migration for hosts upgrading the old publishing-session UI.
// Original keys, File drafts and outbox remain intact for backup/rollback.
export const migrateLegacySession = async ({ protocol, store, database, storage = localStorage }) => {
  if (await store.get('legacy-migrated:' + database)) return
  const legacy = createBrowserStore(database)
  const identity = await legacy.get('identity')
  const previous = identity?.keypair || storage.getItem('evbogue.timeline.key')
  const current = await protocol.keypair()
  if (previous) {
    const keypair = await validateIdentityBackup(previous)
    if (current && current !== keypair) throw Error('An existing application identity differs from the previous timeline identity. Export both before switching.')
    await protocol.put('keypair', keypair)
    if (identity?.name) await protocol.put('name', identity.name)
  }
  const author = await protocol.pubkey()
  const pending = await legacy.get('outbox') || []
  for (const record of pending) {
    const opened = await an.open(record.signature)
    if (record.signature.slice(0,44) !== author || record.id !== await an.hash(record.signature) || opened.slice(13) !== await an.hash(record.content)) throw Error('Previous timeline outbox failed verification')
  }
  if (pending.length) {
    const existing = await store.get('outbox') || []
    await store.set('outbox', [...new Map([...existing, ...pending].map(row => [row.id, row])).values()])
  }
  for (const [key, draft] of await legacy.entries()) {
    if (typeof key !== 'string' || !key.startsWith('draft:') || !draft) continue
    const target = key.slice(6)
    const next = `wiredove-composer-draft:${author || 'anon'}:${target === 'new' ? 'new' : 'reply:' + target}`
    if (!storage.getItem(next)) storage.setItem(next, JSON.stringify({ body: draft.body || '', attachment: draft.attachment || null }))
    // The old File remains in IndexedDB and can be downloaded/re-attached.
  }
  await store.set('legacy-migrated:' + database, true)
}
