// Direct assertions on B with A offline. Use the existing verified AndFS reader
// for HTTP bytes and the vendor reader for disk bytes; never reimplement chunks.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { an } from '../../vendor/anproto/an.js'
import { yaml } from '../../vendor/apds/yaml.js'
import { createAndFS } from '../../vendor/andfs/andfs.js'
import { diskStore } from '../../vendor/andfs/stores.js'
import { readAndFSMedia } from '../../client/andfs.js'

export async function assertRecoveryIntegrity({ aOrigin, origin, data, images, fixtures, inventory, imageURL = origin + '/api/image' }) {
  await assert.rejects(fetch(aOrigin + '/api/application'), 'Node A must be offline')
  const before = JSON.parse(await fs.readFile(path.join(fixtures, 'records.json'), 'utf8'))
  const response = await fetch(origin + '/api/application')
  assert.equal(response.status, 200)
  const { records } = await response.json()
  assert.deepEqual(records, before, 'Recovered records preserve exact signed bytes')
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(data, 'application/records.json'), 'utf8')), before)
  for (const record of records) {
    assert.equal(await an.hash(record.signature), record.id)
    assert.equal((await an.open(record.signature)).substring(13), await an.hash(record.content))
    assert.ok(Object.values(inventory.authors).includes(record.signature.substring(0, 44)))
  }
  const profile = records.find(record => inventory.records.find(row => row.id === record.id)?.kind === 'profile-original-crop')
  const parsed = await yaml.parse(profile.content)
  assert.notEqual(inventory.media.andfs.profile_original, inventory.media.andfs.profile_crop)
  assert.equal(parsed.image_original, '/#' + inventory.media.andfs.profile_original)
  assert.equal(parsed.image, '/#' + inventory.media.andfs.profile_crop)

  const originalFiles = createAndFS({ store: await diskStore(path.join(fixtures, 'andfs')) })
  const restoredFiles = createAndFS({ store: await diskStore(path.join(data, 'andfs')) })
  for (const hash of Object.values(inventory.media.andfs)) {
    const expected = await originalFiles.get(hash)
    assert.deepEqual(await restoredFiles.get(hash), expected, 'Restored disk blocks verify to the original bytes')
    assert.deepEqual(await readAndFSMedia({ andfs: hash }, { baseURL: origin }), expected)
    const gateway = await fetch(origin + '/media/' + hash)
    assert.equal(gateway.status, 200)
    assert.deepEqual(new Uint8Array(await gateway.arrayBuffer()), expected)
  }
  const legacy = inventory.media.anblob_audio
  const legacyBytes = await fs.readFile(path.join(fixtures, legacy.path))
  assert.deepEqual(await fs.readFile(path.join(data, 'blobs', encodeURIComponent(legacy.id))), legacyBytes)
  const blob = await fetch(origin + '/blobs/' + encodeURIComponent(legacy.id))
  assert.equal(blob.status, 200)
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), legacyBytes)

  const image = inventory.media.apds_image
  const expected = await fs.readFile(path.join(fixtures, image.path), 'utf8')
  assert.equal(await an.hash(expected), image.hash)
  assert.ok(records.some(record => record.content.includes(image.hash)))
  const restored = await fs.readFile(path.join(images, encodeURIComponent(image.hash) + '.dataurl'), 'utf8')
  assert.equal(restored, expected, 'APDS bytes restored on B must match the original')
  const url = new URL(imageURL)
  url.searchParams.set('hash', image.hash)
  const served = await fetch(url)
  assert.equal(served.status, 200)
  const { source } = await served.json()
  assert.equal(source, restored, 'B image adapter must serve the restored bytes')
  assert.equal(await an.hash(source), image.hash)
}
