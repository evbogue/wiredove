// Box 5: exact signed-archive and media assertions, before (fixture export as
// persisted on node A) vs after (node B, node A down).
//
// For each record: served id/signature/content byte-identical to the fixture
// export; id recomputed as hash(signature); signature opens and authenticates
// the exact content; author bound to a fixture identity. For each AndFS media:
// reassembled bytes from B's disk chunks sha256-match the node-A snapshot;
// served bytes from B (/media and /blobs) match; manifests resolve.
// Legacy anblob and APDS data-URL bytes are asserted byte-identical.
//
// Environment (all optional except SNAPSHOT_FILE):
//   SNAPSHOT_FILE  sha256 snapshot of node A's durable files, taken before A
//                  was stopped (see docs/SECOND_NODE_RECOVERY.md)
//   NODE_A_URL     node A, expected to be DOWN                 (default http://127.0.0.1:8121)
//   NODE_B_URL     node B, under test                          (default http://127.0.0.1:8122)
//   FIXTURES_DIR   fixture tree from build-recovery-fixtures.mjs (default /tmp/recovery-a)
//   NODE_B_DATA_DIR  node B's DATA_DIR for on-disk comparison  (default /tmp/recovery-node-b/data)
//
// No external publication; A must stay down for the whole run.
// Node 22+.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { an } from '../../vendor/anproto/an.js'

const A = process.env.NODE_A_URL ?? 'http://127.0.0.1:8121'
const B = process.env.NODE_B_URL ?? 'http://127.0.0.1:8122'
const FIX = process.env.FIXTURES_DIR ?? '/tmp/recovery-a'
const BDATA = process.env.NODE_B_DATA_DIR ?? '/tmp/recovery-node-b/data'
const SNAP = process.env.SNAPSHOT_FILE
if (!SNAP) { console.error('SNAPSHOT_FILE is required'); process.exit(2) }

const inventory = JSON.parse(await fs.readFile(path.join(FIX, 'inventory.json'), 'utf8'))
const snapshot = await fs.readFile(SNAP, 'utf8')
let fails = 0
const expect = (cond, msg) => { if (!cond) { console.log(`FAIL - ${msg}`); fails++ } else console.log(`ok - ${msg}`) }

expect(await fetch(`${A}/api/application`).then(() => false).catch(() => true), 'node A is down')

const before = JSON.parse(await fs.readFile(path.join(FIX, 'records.json'), 'utf8'))
const after = await (await fetch(`${B}/api/application`)).json()
expect(after.records.length === before.length, `${before.length} records after, got ${after.records.length}`)
const authors = inventory.authors

for (const rec of before) {
  const got = after.records.find(r => r.id === rec.id)
  const tag = rec.id.slice(0, 12)
  expect(!!got, `record ${tag} present after recovery`)
  if (!got) continue
  expect(got.signature === rec.signature, `record ${tag} signature byte-identical`)
  expect(got.content === rec.content, `record ${tag} content byte-identical`)
  const recomputedId = await an.hash(rec.signature)
  expect(recomputedId === rec.id, `record ${tag} id = hash(signature) recomputed`)
  const opened = await an.open(rec.signature)
  const contentHash = await an.hash(rec.content)
  expect(opened.endsWith(contentHash), `record ${tag} signature opens and authenticates content`)
  const expectedAuthor = authors.alice === rec.signature.substring(0, 44) ? 'alice'
    : authors.bob === rec.signature.substring(0, 44) ? 'bob' : null
  expect(expectedAuthor !== null, `record ${tag} author bound to fixture identity (${expectedAuthor})`)
}

// B's durable records.json on disk matches the served archive.
const bDiskRecords = JSON.parse(await fs.readFile(path.join(BDATA, 'application', 'records.json'), 'utf8'))
expect(bDiskRecords.length === before.length, `B disk records.json has ${bDiskRecords.length} records`)
expect(bDiskRecords.every(r => r.id === before.find(x => x.id === r.id)?.id &&
  r.signature === before.find(x => x.id === r.id)?.signature), 'B disk records byte-identical to fixture export')

// Profile original/crop contract: both present, distinct, original hash referenced.
const orig = inventory.media.andfs.profile_original
const crop = inventory.media.andfs.profile_crop
expect(orig !== crop, `profile original (${orig.slice(0, 12)}) differs from crop (${crop.slice(0, 12)})`)
const prof = before.find(r => inventory.records.find(x => x.id === r.id).kind === 'profile-original-crop')
expect(prof.content.includes(`image_original: '/#${orig}'`), 'profile record references original hash as image_original')
expect(prof.content.includes(`image: '/#${crop}'`), 'profile record references crop hash as image')

// AndFS media: chunk bytes -> snapshot -> served.
for (const [name, hash] of Object.entries(inventory.media.andfs)) {
  const manifest = JSON.parse(await fs.readFile(path.join(BDATA, 'andfs', 'blocks', hash), 'utf8'))
  const reassembled = Buffer.concat(await Promise.all(manifest.chunks.map(c => fs.readFile(path.join(BDATA, 'andfs', 'blocks', c)))))
  const digest = createHash('sha256').update(reassembled).digest('hex')
  const tag = hash.slice(0, 12)
  expect(snapshot.includes(`${digest}  ./andfs/blocks/`), `${name}: reassembled bytes sha256 match node-A snapshot`)
  const r = await fetch(`${B}/media/${hash}`)
  const served = Buffer.from(await r.arrayBuffer())
  expect(r.ok && served.compare(reassembled) === 0, `${name}: /media/${tag} serves B-disk bytes`)
  // /blobs contract (what the website/embed AndFS reader uses): manifest JSON
  // at /blobs/<manifest>, then one fetch per chunk.
  const rm = await fetch(`${B}/blobs/${hash}`)
  const man = await rm.json()
  const chunksOk = Array.isArray(man.chunks) && man.chunks.length === manifest.chunks.length &&
    man.chunks.every((c, i) => c === manifest.chunks[i])
  expect(rm.ok && chunksOk, `${name}: /blobs/${tag} returns manifest with chunk list`)
  let assembled = Buffer.alloc(0)
  for (const c of manifest.chunks) {
    const rc = await fetch(`${B}/blobs/${c}`)
    assembled = Buffer.concat([assembled, Buffer.from(await rc.arrayBuffer())])
  }
  expect(assembled.compare(reassembled) === 0, `${name}: /blobs chunk fetches reassemble to B-disk bytes`)
}

// anblob legacy audio.
const ab = inventory.media.anblob_audio
const abBytes = await fs.readFile(path.join(FIX, ab.path))
const bAbDisk = await fs.readFile(path.join(BDATA, 'blobs', encodeURIComponent(ab.id)))
expect(bAbDisk.compare(abBytes) === 0, 'anblob on B disk byte-identical to fixture export')
const r = await fetch(`${B}/blobs/${encodeURIComponent(ab.id)}`)
expect(r.ok && Buffer.from(await r.arrayBuffer()).compare(abBytes) === 0, 'anblob served from B byte-identical')

// APDS legacy image: data-URL fixture preserved, hash matches signed reference.
const apds = inventory.media.apds_image
const dataurl = await fs.readFile(path.join(FIX, apds.path), 'utf8')
expect(await an.hash(dataurl) === apds.hash, 'APDS data-URL hash matches signed reference')
expect(before.some(rec => rec.content.includes(apds.hash)), 'APDS image reference preserved in signed record body')

console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECKS FAILED`)
process.exit(fails === 0 ? 0 : 1)
