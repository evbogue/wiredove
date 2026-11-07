// Real shared archive/image reader and gallery, restored B only, two origins.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
(async () => {
  const { createRecoveryExercise } = await import('./fixtures/recovery-harness.mjs');
  const exercise = await createRecoveryExercise();
  const parent = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<iframe title="Recovered image" src="${exercise.b.origin}/__recovery" style="width:100%;height:600px;border:0"></iframe>`);
  });
  let browser;
  try {
    await new Promise(resolve => parent.listen(0, '127.0.0.1', resolve));
    const parentOrigin = `http://127.0.0.1:${parent.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
    for (const embed of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
      const errors = [], unexpected = [], reads = [];
      const allowed = new Set([exercise.b.origin, parentOrigin]);
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!allowed.has(url.origin) || request.method() !== 'GET') { unexpected.push(request.url()); return route.abort(); }
        reads.push(request.url()); return route.continue();
      });
      const bytes = await fs.readFile(exercise.imageFile);
      await fs.unlink(exercise.imageFile);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(embed ? parentOrigin : exercise.b.origin + '/__recovery');
      const frame = embed ? page.frames().find(frame => frame.url() === exercise.b.origin + '/__recovery') : page.mainFrame();
      await frame.evaluate(async ({ origin, hash }) => {
        const { createArtifactSession } = await import('/client/runtime/artifact-session.js');
        const { createImageGallery } = await import('/client/ui/image-gallery.js');
        const { an } = await import('/vendor/anproto/an.js');
        const { yaml } = await import('/vendor/apds/yaml.js');
        const blobs = new Map();
        const protocol = {
          get: key => blobs.get(key), put: (key, value) => blobs.set(key, value),
          make: async value => blobs.set(await an.hash(value), value),
          add: async value => blobs.set(await an.hash(value), value),
          parseYaml: yaml.parse, getHashLog: () => [], getOpenedLog: () => [],
        };
        window.session = createArtifactSession({ protocol, store: {}, endpoint: origin + '/api/application', legacyImageURL: origin + '/api/image' });
        await session.pull();
        window.imageCached = () => blobs.has(hash);
        document.body.append(createImageGallery({ images: [{ src: hash, alt: 'Restored legacy image' }], resolveImage: key => blobs.get(key) }));
      }, { origin: exercise.b.origin, hash: exercise.inventory.media.apds_image.hash });
      await frame.locator('.image-gallery-status[aria-label="Image unavailable"]').waitFor();
      assert.equal(await frame.evaluate(() => imageCached()), false);
      await fs.writeFile(exercise.imageFile, 'data:image/png;base64,AAAA');
      await frame.evaluate(() => session.pull());
      assert.equal(await frame.evaluate(() => imageCached()), false, 'Reader must reject corrupt legacy bytes');
      await fs.writeFile(exercise.imageFile, bytes);
      await frame.evaluate(() => session.pull());
      assert.equal(await frame.evaluate(() => imageCached()), true);
      await frame.getByRole('button', { name: /retry/i }).first().click();
      await frame.waitForFunction(() => {
        const image = document.querySelector('.image-gallery-tile img');
        return image?.complete && image.naturalWidth > 0;
      });
      assert(reads.some(url => url.startsWith(exercise.b.origin + '/api/image?')));
      assert.deepEqual(unexpected, []);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/recovery-apds-${embed ? 'embed' : 'website'}.png`, animations: 'disabled' });
      await frame.evaluate(() => session.stop());
      await context.close();
    }
    console.log('Recovered APDS image: missing/corrupt rejected, restored bytes decoded through the shared reader and gallery on both origins; A offline; no external writes');
  } finally {
    await browser?.close();
    await new Promise(resolve => parent.close(resolve));
    await exercise.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
