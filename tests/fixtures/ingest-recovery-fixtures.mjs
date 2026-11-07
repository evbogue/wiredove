// Persist disposable fixtures through the real archive/anblob APIs. The test
// companion APDS store is separate from the production application archive.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function ingestRecoveryFixtures({ fixtures, origin, data, images }) {
  const inventory = JSON.parse(await fs.readFile(path.join(fixtures, 'inventory.json'), 'utf8'))
  const records = JSON.parse(await fs.readFile(path.join(fixtures, 'records.json'), 'utf8'))
  for (const record of records) {
    const response = await fetch(origin + '/api/application', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record),
    })
    assert.equal(response.status, 200)
    const saved = await response.json()
    assert.equal(saved.saved, true)
    assert.equal(saved.id, record.id)
  }
  const legacy = inventory.media.anblob_audio
  const response = await fetch(`${origin}/blobs/${encodeURIComponent(legacy.id)}`, {
    method: 'PUT', body: await fs.readFile(path.join(fixtures, legacy.path)),
  })
  assert.equal(response.status, 204)
  await fs.cp(path.join(fixtures, 'andfs'), path.join(data, 'andfs'), { recursive: true })
  await fs.mkdir(path.join(data, 'media'), { recursive: true })
  const mimes = { inline_image: 'image/png', profile_original: 'image/png', profile_crop: 'image/png', audio: 'audio/wav', video: 'video/mp4' }
  for (const [kind, hash] of Object.entries(inventory.media.andfs)) {
    const manifest = JSON.parse(await fs.readFile(path.join(fixtures, 'andfs/blocks', hash), 'utf8'))
    await fs.writeFile(path.join(data, 'media', hash + '.json'), JSON.stringify({
      andfs: hash, mime: mimes[kind], media_size: manifest.size, author: inventory.authors.alice,
    }))
  }
  await fs.mkdir(images, { recursive: true })
  await fs.copyFile(path.join(fixtures, inventory.media.apds_image.path),
    path.join(images, encodeURIComponent(inventory.media.apds_image.hash) + '.dataurl'))
}
