// Full application import UI. Disposable keys stay in browser memory/storage.
const assert = require('node:assert/strict');
module.exports = async ({ website, embed, source }) => {
  for (const page of [website, embed]) {
    const original = await page.evaluate(async () => { const { apds } = await import('https://esm.sh/gh/evbogue/apds@4934fac/apds.js'); return apds.pubkey(); });
    const open = () => page.evaluate(async source => {
      const { promptKeypair } = await import(source + '/dist/app-v1/identify.js');
      promptKeypair(undefined, app);
    }, source);
    await open();
    await page.getByRole('button', { name: 'Import existing identity', exact: true }).click();
    await page.getByLabel('Identity backup', { exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Import identity', exact: true }).click();
    await page.getByText('Could not import this backup. Check that you pasted the complete, original keypair.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(async () => { const { apds } = await import('https://esm.sh/gh/evbogue/apds@4934fac/apds.js'); return apds.pubkey(); }), original,
      'An invalid backup must preserve the active identity');
    const expected = await page.evaluate(async source => {
      const { an } = await import(source + '/vendor/anproto/an.js');
      const key = await an.gen();
      const input = app.root.getRootNode().querySelector('textarea[placeholder="Paste your identity backup"]');
      input.value = key;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return key.substring(0, 44);
    }, source);
    await page.getByRole('button', { name: 'Import identity', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.reload();
    await page.waitForFunction(() => window.ready);
    const result = await page.evaluate(async ({ source, expected }) => {
      const { apds } = await import('https://esm.sh/gh/evbogue/apds@4934fac/apds.js');
      const { an } = await import(source + '/vendor/anproto/an.js');
      const hash = await an.hash('Disposable backup import acceptance');
      const signature = await an.sign(hash, await apds.keypair());
      return await apds.pubkey() === expected && signature.substring(0, 44) === expected &&
        (await an.open(signature)).substring(13) === hash;
    }, { source, expected });
    assert.equal(result, true, 'Imported identity must persist and produce a valid signature');
  }
  console.log('Both full mounts: invalid backup preserves active identity; valid UI import survives reload and signs correctly');
};
