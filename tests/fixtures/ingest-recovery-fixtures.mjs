// Ingest the deterministic recovery fixtures onto a disposable node.
//
// Uses the node's own APIs so every record is signature-verified on write:
//   1. POST each signed record to /api/application (server verifies signature).
//   2. PUT the legacy anblob to /blobs/<id> (legacy blob route).
//   3. Byte-copy AndFS blocks into the same diskStore layout the server uses.
//   4. Write media metadata rows per the server schema ({andfs, mime, media_size, author}).
//   5. Copy the raw APDS image into the fixture companion store.
//   6. After restart, --verify-only checks archive and /media reads.
//
// Environment (all optional, defaults are the isolated-loopback exercise values):
//   FIXTURES_DIR   fixture tree from build-recovery-fixtures.mjs  (default /tmp/recovery-a)
//   NODE_URL       target node                                     (default http://127.0.0.1:8121)
//   NODE_DATA_DIR  node's DATA_DIR for block/metadata copies      (default /tmp/recovery-node-a/data)
//   NODE_APDS_DIR  fixture companion image store (default NODE_DATA_DIR/recovery-apds-images)
// Run with --verify-only after restart to check reads without rewriting files.
//
// NOTE: media metadata rows are loaded by the server at startup, so restart the
// node once after running this script, then run --verify-only for /media checks.
// The exercise treats node A as disposable,
// so the usual flow is: ingest -> restart A -> snapshot durable files -> stop A.
//
// Disposable test identities only. No production credentials, no external
// publication, no relay/WebSocket writes, no notifications.
// Node 22+.
import fs from 'node:fs/promises'
import path from 'node:path'

const NODE = process.env.NODE_URL ?? 'http://127.0.0.1:8121'
const FIX = process.env.FIXTURES_DIR ?? '/tmp/recovery-a'
const ADATA = process.env.NODE_DATA_DIR ?? '/tmp/recovery-node-a/data'
const APDS = process.env.NODE_APDS_DIR ?? path.join(ADATA, 'recovery-apds-images')
const verifyOnly = process.argv.includes('--verify-only')
const MIME = {
  inline_image: 'image/png',
  profile_original: 'image/png',
  profile_crop: 'image/png',
  audio: 'audio/wav',
  video: 'video/mp4',
}

const inventory = JSON.parse(await fs.readFile(path.join(FIX, 'inventory.json'), 'utf8'))
const records = JSON.parse(await fs.readFile(path.join(FIX, 'records.json'), 'utf8'))
const alice = inventory.authors.alice

let fails = 0
const expect = (cond, msg) => { console.log(`${cond ? 'ok' : 'FAIL'} - ${msg}`); if (!cond) fails++ }

if (!verifyOnly) {
  // 1. Records through the node's own API (server verifies each signature).
  for (const rec of records) {
    const r = await fetch(`${NODE}/api/application`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: rec.id, signature: rec.signature, content: rec.content }),
    })
    const body = await r.json()
    expect(r.ok && body.saved && body.id === rec.id, `POST record ${rec.id.slice(0, 12)} -> ${r.status}`)
  }

  // 2. anblob via the legacy blob PUT route.
  {
    const { id, path: rel } = inventory.media.anblob_audio
    const bytes = await fs.readFile(path.join(FIX, rel))
    const r = await fetch(`${NODE}/blobs/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes,
    })
    expect(r.ok || r.status === 204, `PUT anblob ${id.slice(0, 24)} -> ${r.status}`)
  }

  // 3. AndFS blocks byte-copied into the same diskStore layout the server uses.
  {
    const blocksDir = path.join(ADATA, 'andfs', 'blocks')
    await fs.mkdir(blocksDir, { recursive: true })
    for (const name of await fs.readdir(path.join(FIX, 'andfs', 'blocks'))) {
      await fs.copyFile(path.join(FIX, 'andfs', 'blocks', name), path.join(blocksDir, name))
    }
    expect((await fs.readdir(blocksDir)).length > 0, 'AndFS blocks copied')
  }

  // 4. Media metadata rows per server schema (server restarts load/validate them).
  {
    const mediaDir = path.join(ADATA, 'media')
    await fs.mkdir(mediaDir, { recursive: true })
    for (const [kind, hash] of Object.entries(inventory.media.andfs)) {
      const manifest = JSON.parse(await fs.readFile(path.join(FIX, 'andfs', 'blocks', hash), 'utf8'))
      const row = { andfs: hash, mime: MIME[kind], media_size: manifest.size, author: alice }
      await fs.writeFile(path.join(mediaDir, `${hash}.json`), JSON.stringify(row))
    }
    expect((await fs.readdir(mediaDir)).length === 5, '5 media rows written')
  }

  // APDS raw data URLs are separate blobs, not embedded in the signed record.
  // This is a fixture companion store, NOT a production application endpoint.
  await fs.mkdir(APDS, { recursive: true })
  await fs.copyFile(path.join(FIX, inventory.media.apds_image.path),
    path.join(APDS, encodeURIComponent(inventory.media.apds_image.hash) + '.dataurl'))
  expect(true, 'APDS image bytes copied to companion store')
}

// 6. Restart verification of what the server loaded.
if (verifyOnly) {
  const res = await fetch(`${NODE}/api/application`)
  const body = await res.json()
  expect(body.records?.length === 10, `10 records served, got ${body.records?.length}`)
  for (const [kind, hash] of Object.entries(inventory.media.andfs)) {
    const r = await fetch(`${NODE}/media/${hash}`)
    expect(r.status === 200, `/media/${kind} -> ${r.status}`)
    const served = Buffer.from(await r.arrayBuffer())
    expect(served.length === JSON.parse(await fs.readFile(path.join(FIX, 'andfs', 'blocks', hash), 'utf8')).size,
      `/media/${kind} reassembled size matches manifest`)
  }
}

console.log(fails === 0 ? (verifyOnly ? 'RESTART VERIFIED' : 'INGEST COMPLETE — restart, then run --verify-only') : `${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
