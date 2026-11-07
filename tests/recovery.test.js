import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { buildRecoveryFixtures } from './fixtures/build-recovery-fixtures.mjs'
import { createRecoveryExercise } from './fixtures/recovery-harness.mjs'

test('second-node recovery requires restored APDS bytes and a working image adapter', { timeout: 60000 }, async () => {
  const exercise = await createRecoveryExercise()
  try {
    await exercise.assertIntegrity()
    await assert.rejects(exercise.assertIntegrity({ imageURL: exercise.b.origin + '/api/application' }),
      /B image adapter/)
    const bytes = await fs.readFile(exercise.imageFile)
    const archive = await fs.readFile(path.join(exercise.b.data, 'application/records.json'))
    assert.equal(archive.includes(bytes), false, 'Signed records contain a reference, not the raw image')
    await fs.unlink(exercise.imageFile)
    await assert.rejects(exercise.assertIntegrity(), /ENOENT/)
    await fs.writeFile(exercise.imageFile, 'data:image/png;base64,AAAA')
    await assert.rejects(exercise.assertIntegrity(), /APDS bytes restored/)
    await fs.writeFile(exercise.imageFile, bytes)
    await exercise.assertIntegrity()
    const imageHash = exercise.inventory.media.andfs.inline_image
    const manifest = JSON.parse(await fs.readFile(path.join(exercise.b.data, 'andfs/blocks', imageHash)))
    const chunk = path.join(exercise.b.data, 'andfs/blocks', manifest.chunks[0])
    const originalChunk = await fs.readFile(chunk)
    await fs.unlink(chunk)
    await assert.rejects(exercise.assertIntegrity(), /No verified source for blob/)
    await fs.writeFile(chunk, new Uint8Array([0]))
    await assert.rejects(exercise.assertIntegrity(), /No verified source for blob/)
    await fs.writeFile(chunk, originalChunk)
    await exercise.assertIntegrity()
    // Fixture generation must not erase an existing export.
    await assert.rejects(buildRecoveryFixtures(path.dirname(chunk)), /must be empty/)
    assert.deepEqual(await fs.readFile(chunk), originalChunk)
    assert.deepEqual(await fs.readFile(path.join(exercise.b.data, 'application/records.json')), archive)
  } finally { await exercise.close() }
})
