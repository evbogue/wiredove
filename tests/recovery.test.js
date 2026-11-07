import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { createRecoveryExercise } from './fixtures/recovery-harness.mjs'

test('second-node recovery requires restored APDS bytes and a working image adapter', { timeout: 60000 }, async () => {
  const exercise = await createRecoveryExercise()
  try {
    const { stdout } = await exercise.assertIntegrity()
    assert.match(stdout, /ALL CHECKS PASSED/)
    await assert.rejects(exercise.assertIntegrity({ imageURL: exercise.b.origin + '/api/application' }),
      error => /FAIL - B image adapter/.test(error.stdout))
    const bytes = await fs.readFile(exercise.imageFile)
    const archive = await fs.readFile(path.join(exercise.b.data, 'application/records.json'))
    assert.equal(archive.includes(bytes), false, 'Signed records contain a reference, not the raw image')
    await fs.unlink(exercise.imageFile)
    await assert.rejects(exercise.assertIntegrity(), /ENOENT/)
    await fs.writeFile(exercise.imageFile, 'data:image/png;base64,AAAA')
    await assert.rejects(exercise.assertIntegrity(), error => /FAIL - APDS bytes restored/.test(error.stdout))
    await fs.writeFile(exercise.imageFile, bytes)
    assert.match((await exercise.assertIntegrity()).stdout, /ALL CHECKS PASSED/)
    assert.deepEqual(await fs.readFile(path.join(exercise.b.data, 'application/records.json')), archive)
  } finally { await exercise.close() }
})
