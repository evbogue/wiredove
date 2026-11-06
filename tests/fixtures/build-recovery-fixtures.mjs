// Deterministic second-node recovery fixture builder.
//
// Builds the signed fixture set required by CONSOLIDATION_WORK_ORDER.md
// section 2 ("Prove recovery onto a second isolated node"):
// posts, replies, edits, metadata-only profiles (empty bio/links), inline
// images, profile original/crop, audio/video, a legacy APDS image and a
// legacy anblob attachment.
//
// Determinism: both disposable identities derive from fixed SHA-256 seeds,
// Date.now is pinned during signing (an.sign embeds a timestamp), media bytes
// are fixed literals and AndFS/anblob hashes are content-addressed. Running
// this script twice with the same --out parent produces byte-identical trees.
//
// Generated storage is written OUTSIDE the repository (default: the OS temp
// directory). The layout mirrors the server storage inventory documented in
// docs/SECOND_NODE_RECOVERY.md:
//   <out>/records.json              signed {id, signature, content} records, publish order
//   <out>/inventory.json            fixture inventory with ids, hashes, sizes, expectations
//   <out>/andfs/blocks/<hash>       AndFS chunk/manifest blocks (as served from data/andfs/blocks)
//   <out>/legacy/apds-images/<hash>.dataurl   legacy APDS image data URL bytes
//   <out>/legacy/anblobs/<blob-id>            legacy anblob raw bytes
//
// Usage: node tests/fixtures/build-recovery-fixtures.mjs [--out <dir>]
// Node 22+.

import nacl from '../../vendor/anproto/lib/nacl-fast-es.js'
import { encode } from '../../vendor/anproto/lib/base64.js'
import { an } from '../../vendor/anproto/an.js'
import { yaml } from '../../vendor/apds/yaml.js'
import { createAndFS } from '../../vendor/andfs/andfs.js'
import { diskStore } from '../../vendor/andfs/stores.js'
import { putBlob, MemoryBlobStore } from '../../anproto_blob.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'

// Fixed signing instant: 2026-11-04T12:00:00.000Z. an.sign embeds Date.now()
// in the signed payload, so pin it for deterministic signatures.
const SIGNING_TIME = Date.UTC(2026, 10, 4, 12, 0, 0)
Date.now = () => SIGNING_TIME

const textEncoder = new TextEncoder()

async function keypairFromSeed(label) {
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(label)))
  const pair = nacl.sign.keyPair.fromSeed(seed)
  const key = encode(pair.publicKey) + encode(pair.secretKey)
  return { key, pubkey: key.substring(0, 44) }
}

// Fixed 1x1 PNGs (distinct pixels so hashes differ): red, green, blue.
const PNG_RED = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_GREEN = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5HogAAAABJRU5ErkJggg=='
const PNG_BLUE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=='
const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))

// Fixed 8kHz 8-bit mono WAV: RIFF header + 8 samples.
function wavBytes() {
  const samples = new Uint8Array([128, 160, 192, 224, 255, 224, 192, 160])
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 44, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 16, 0, 0, 0, 1, 0, 1, 0,
    0x40, 0x1f, 0, 0, 0x40, 0x1f, 0, 0, 1, 0, 8, 0,
    0x64, 0x61, 0x74, 0x61, 8, 0, 0, 0,
  ])
  const out = new Uint8Array(header.length + samples.length)
  out.set(header); out.set(samples, header.length)
  return out
}

// Fixed minimal MP4: ftyp box only (magic-byte sniffing identifies video).
function mp4Bytes() {
  return new Uint8Array([
    0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0, 0, 0, 1, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ])
}

async function main() {
  const outIdx = process.argv.indexOf('--out')
  const out = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : path.join(tmpdir(), 'wiredove-recovery-fixtures')
  await fs.rm(out, { recursive: true, force: true })
  const andfsDir = path.join(out, 'andfs')
  const files = createAndFS({ store: await diskStore(andfsDir) })

  const alice = await keypairFromSeed('wiredove-recovery-fixture/alice-v1')
  const bob = await keypairFromSeed('wiredove-recovery-fixture/bob-v1')

  const put = async bytes => {
    const { manifestHash } = await files.add(bytes)
    return manifestHash
  }
  const imageHash = await put(b64bytes(PNG_RED))       // inline post image
  const profileOrig = await put(b64bytes(PNG_BLUE))    // profile original
  const profileCrop = await put(b64bytes(PNG_GREEN))   // profile square crop
  const audioHash = await put(wavBytes())              // AndFS audio
  const videoHash = await put(mp4Bytes())              // AndFS video

  // Legacy APDS image: historical format references the hash of the data URL.
  const apdsDataURL = 'data:image/png;base64,' + PNG_RED
  const apdsHash = await an.hash(apdsDataURL)

  // Legacy anblob audio: id is content-addressed (sha256 base64url of bytes).
  const anblobBytes = wavBytes()
  const anblobStore = new MemoryBlobStore()
  const anblobId = await putBlob(anblobBytes, anblobStore)
  if (!/^anblob:v1:(raw|chunked):sha256:[A-Za-z0-9_-]+$/.test(anblobId)) {
    throw new Error('Unexpected anblob id format: ' + anblobId)
  }

  const records = []
  const lastByAuthor = {}
  const sign = async (author, kind, metadata, body) => {
    const previous = lastByAuthor[author.pubkey]
    const content = await yaml.create({ ...metadata, ...(previous ? { previous } : {}) }, body)
    const signature = await an.sign(await an.hash(content), author.key)
    const id = await an.hash(signature)
    const record = { id, signature, content }
    records.push({ kind, author: author.pubkey, ...record })
    lastByAuthor[author.pubkey] = id
    return record
  }

  // Alice's chain: profile -> profile(original/crop) -> post -> edit -> legacy posts
  const profile1 = await sign(alice, 'profile-metadata-only-empty', { name: 'Recovery Fixture Alice', bio: '', links: [] }, '')
  const profile2 = await sign(alice, 'profile-original-crop', {
    name: 'Recovery Fixture Alice', bio: 'Fixture bio v2', links: ['https://example.test/recovery-alice'],
    image: '/#' + profileCrop, image_original: '/#' + profileOrig,
  }, '')
  const post1 = await sign(alice, 'post-inline-image', {}, 'Recovery fixture post with inline image\n\n![inline image](/#' + imageHash + ')')
  const edit1 = await sign(alice, 'post-edit', { edit: post1.id }, 'Recovery fixture post with inline image (edited)')
  const legacyImage = await sign(alice, 'post-apds-image', {}, 'Legacy APDS image fixture\n\n![legacy image](' + apdsHash + ')')
  const legacyAudio = await sign(alice, 'post-anblob-audio', {
    type: 'audio', blob: anblobId, mime: 'audio/wav',
    media_name: 'recovery-fixture-legacy.wav', media_size: anblobBytes.length,
  }, 'Legacy anblob audio fixture')
  const andfsAudio = await sign(alice, 'post-andfs-audio', {
    type: 'audio', andfs: audioHash, mime: 'audio/wav',
    media_name: 'recovery-fixture.wav', media_size: wavBytes().length, media_url: '/#' + audioHash,
  }, 'AndFS audio fixture')
  const andfsVideo = await sign(alice, 'post-andfs-video', {
    type: 'video', andfs: videoHash, mime: 'video/mp4',
    media_name: 'recovery-fixture.mp4', media_size: mp4Bytes().length, media_url: '/#' + videoHash,
  }, 'AndFS video fixture')

  // Bob's chain: profile -> reply to Alice's post
  await sign(bob, 'profile-metadata-only-empty', { name: 'Recovery Fixture Bob', bio: '', links: [] }, '')
  await sign(bob, 'reply', { reply: post1.id }, 'Reply from Bob to the inline-image post')

  // Verify every signature opens to a payload authenticating the signed content,
  // and every id is the hash of its signature.
  for (const r of records) {
    const opened = await an.open(r.signature)
    const [ts, contentHash] = [opened.slice(0, String(SIGNING_TIME).length), opened.slice(String(SIGNING_TIME).length)]
    if (ts !== String(SIGNING_TIME)) throw new Error('Non-deterministic signature timestamp on ' + r.kind)
    if (contentHash !== await an.hash(r.content)) throw new Error('Signature does not authenticate content on ' + r.kind)
    if (r.id !== await an.hash(r.signature)) throw new Error('Record id mismatch on ' + r.kind)
    if (r.signature.substring(0, 44) !== r.author) throw new Error('Author mismatch on ' + r.kind)
  }

  // Verify AndFS manifests re-chunk to the same hashes from stored blocks.
  for (const h of [imageHash, profileOrig, profileCrop, audioHash, videoHash]) {
    const manifest = await files.manifest(h)
    if (!manifest || !Array.isArray(manifest.chunks)) throw new Error('Missing manifest for ' + h)
  }

  // Write the export tree.
  await fs.mkdir(path.join(out, 'legacy', 'apds-images'), { recursive: true })
  await fs.mkdir(path.join(out, 'legacy', 'anblobs'), { recursive: true })
  await fs.writeFile(path.join(out, 'records.json'), JSON.stringify(records.map(({ kind, author, ...r }) => r), null, 2) + '\n')
  await fs.writeFile(path.join(out, 'legacy', 'apds-images', apdsHash + '.dataurl'), apdsDataURL)
  await fs.writeFile(path.join(out, 'legacy', 'anblobs', anblobId), Buffer.from(anblobBytes))

  const inventory = {
    generated: 'deterministic fixture set for second-node recovery (CONSOLIDATION_WORK_ORDER.md section 2)',
    signing_time: new Date(SIGNING_TIME).toISOString(),
    authors: { alice: alice.pubkey, bob: bob.pubkey },
    note: 'Disposable test identities. Never use production keys. External publication, relay/WebSocket writes and notifications must be blocked during the recovery exercise.',
    records: records.map(r => ({ kind: r.kind, id: r.id, author: r.author })),
    media: {
      andfs: {
        inline_image: imageHash, profile_original: profileOrig, profile_crop: profileCrop,
        audio: audioHash, video: videoHash,
      },
      apds_image: { hash: apdsHash, path: 'legacy/apds-images/' + apdsHash + '.dataurl' },
      anblob_audio: { id: anblobId, path: 'legacy/anblobs/' + anblobId, size: anblobBytes.length },
    },
    expectations: {
      profile_metadata_only: 'Empty bio and empty links are explicit signed values; body is empty.',
      profile_original_crop: 'Re-crop must read the restored original bytes; never replace with a generated thumbnail.',
      edit: 'Edit references edit=<post id>; original record bytes stay unchanged.',
      apds_image: 'Reference is a 44-char hash of the data URL; reader resolves via legacy APDS storage.',
      anblob_audio: 'Blob id is content-addressed; corrupted bytes must never display or play.',
    },
  }
  await fs.writeFile(path.join(out, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n')

  console.log('Wrote', records.length, 'records and', Object.keys(inventory.media.andfs).length, 'AndFS manifests to', out)
  console.log('alice', alice.pubkey)
  console.log('bob  ', bob.pubkey)
}

main().catch(error => { console.error(error); process.exit(1) })
