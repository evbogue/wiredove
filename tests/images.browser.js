// Local-only image acceptance. Public writes and WebSockets are blocked.
async (page) => {
  const origin = new URL(page.url()).origin;
  const browser = page.context().browser(), contexts = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const results = [];
  async function isolated() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    contexts.push(context);
    await context.routeWebSocket('**', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && request.method() !== 'GET') return route.abort();
      if (url.pathname === '/' && url.origin === origin) {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace("<script type='module' src='app.js'></script>", '') });
      }
      return route.continue();
    });
    const p = await context.newPage(); await p.goto(origin);
    return p;
  }
  try {
    const uploader = await isolated();
    await uploader.evaluate(async () => {
      const { apds } = await import('apds');
      await apds.start('andfs-image-test');
      await apds.put('keypair', await apds.generate());
      await apds.put('name', 'AndFS Image Local Test');
      const make = apds.make;
      window.legacyImageWrites = 0;
      apds.make = async value => { if (String(value).startsWith('data:image/')) window.legacyImageWrites++; return await make(value); };
      const compose = apds.compose;
      apds.compose = async (...args) => {
        const id = await compose(...args), signature = await apds.get(id), opened = await apds.open(signature);
        const content = await apds.get(opened.slice(13));
        window.publishedImagePost = { id, signature, content, parsed: await apds.parseYaml(content), author: signature.slice(0, 44) };
        return id;
      };
      window.__feedEnqueue = async () => true;
      const { composer: open } = await import('/composer.js'); document.body.append(await open());
    });
    const fixtures = await uploader.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#734bce'; ctx.fillRect(0, 0, 160, 100);
      ctx.fillStyle = 'white'; ctx.font = '20px sans-serif'; ctx.fillText('AndFS image', 15, 55);
      return ['image/png', 'image/jpeg', 'image/webp'].map(mime => ({ mime, data: canvas.toDataURL(mime).split(',')[1] }));
    });
    fixtures.push({ mime: 'image/gif', data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
    const dialog = uploader.locator('.composer-dialog'), editor = dialog.getByRole('textbox');
    await editor.fill('Images uploaded through AndFS');
    const apiRequests = [];
    uploader.on('request', request => { if (new URL(request.url()).pathname === '/api/media') apiRequests.push(JSON.parse(request.headers()['x-anproto-content'])); });
    let releaseUpload, uploadStarted;
    const started = new Promise(resolve => { uploadStarted = resolve; });
    const held = new Promise(resolve => { releaseUpload = resolve; });
    await uploader.context().route(origin + '/api/media', async route => { uploadStarted(); await held; await route.continue(); }, { times: 1 });
    for (const fixture of fixtures) {
      const count = await dialog.locator('.composer-image-card').count();
      await dialog.locator('.composer-image-upload input[type=file]').setInputFiles({ name: 'fixture.' + fixture.mime.split('/')[1], mimeType: fixture.mime, buffer: Buffer.from(fixture.data, 'base64') });
      if (count === 0) {
        await started;
        check(await dialog.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'Publication enabled before durable image upload');
        check(!(await editor.inputValue()).includes('![]('), 'Pending upload inserted a reference');
        releaseUpload();
      }
      await uploader.waitForFunction(count => document.querySelectorAll('.composer-image-card').length === count + 1, count);
    }
    check(apiRequests.length === 4 && apiRequests.every(meta => meta.action === 'andfs-upload-v1'), 'Images did not use signed AndFS uploads');
    check(await uploader.evaluate(() => window.legacyImageWrites) === 0, 'New image was stored through legacy APDS');
    check((await editor.inputValue()).match(/!\[\]\(http[^)]+\/media\//g)?.length === 4, 'Multiple inline AndFS image references missing');
    // Removal edits only the selected reference; it must not discard other images.
    const first = (await editor.inputValue()).match(/!\[\]\([^)]+\)/)[0];
    await dialog.getByRole('button', { name: 'Remove image', exact: true }).first().click();
    check(!(await editor.inputValue()).includes(first), 'Removed image remained in draft');
    await dialog.locator('.composer-image-upload input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: fixtures[0].mime, buffer: Buffer.from(fixtures[0].data, 'base64') });
    await uploader.waitForFunction(() => document.querySelectorAll('.composer-image-card').length === 4);
    // A rejected upload never inserts a reference or prevents retry.
    const beforeFailure = await editor.inputValue();
    await uploader.context().route(origin + '/api/media', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Image upload rejected"}' }));
    await dialog.locator('.composer-image-upload input[type=file]').setInputFiles({ name: 'failed.png', mimeType: fixtures[0].mime, buffer: Buffer.from(fixtures[0].data, 'base64') });
    await dialog.locator('.composer-image-status').filter({ hasText: 'Image upload rejected' }).waitFor();
    check(await editor.inputValue() === beforeFailure, 'Failed image changed draft');
    await uploader.context().unroute(origin + '/api/media');
    await dialog.getByRole('button', { name: 'Close composer (draft saved)' }).click();
    await uploader.reload();
    await uploader.evaluate(async () => { const { apds } = await import('apds'); await apds.start('andfs-image-test'); window.__feedEnqueue = async () => true; const { composer } = await import('/composer.js'); document.body.append(await composer()); });
    check(await editor.inputValue() === beforeFailure, 'AndFS image draft did not survive reload');
    // Reload removes the publication observer; capture the actual signed result again.
    await uploader.evaluate(async () => {
      const { apds } = await import('apds'); const compose = apds.compose;
      apds.compose = async (...args) => { const id = await compose(...args), signature = await apds.get(id), opened = await apds.open(signature), content = await apds.get(opened.slice(13)); window.publishedImagePost = { id, signature, content, parsed: await apds.parseYaml(content), author: signature.slice(0,44) }; return id; };
    });
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    const post = await uploader.evaluate(() => window.publishedImagePost);
    check(!post.content.includes('data:image'), 'Signed post contains inline image data');
    await uploader.context().close(); contexts.shift();
    results.push('PNG/JPEG/WebP/GIF signed AndFS uploads; multiple images, removal, failure/retry and draft reload; original file bytes preserved');

    const reader = await isolated();
    await reader.evaluate(async post => {
      const { an } = await import('/vendor/anproto/an.js');
      if ((await an.open(post.signature)).slice(13) !== await an.hash(post.content)) throw new Error('Invalid signed image post');
      const { appendMarkdown } = await import('/markdown.js'); document.body.replaceChildren(); appendMarkdown(document.body, post.parsed.body);
    }, post);
    await reader.waitForFunction(() => document.querySelectorAll('wiredove-image-gallery img').length === 4 && [...document.querySelectorAll('wiredove-image-gallery img')].every(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/')));
    const copied = await reader.locator('wiredove-image-gallery img').evaluateAll(async images => Promise.all(images.map(async img => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())])));
    const expected = [fixtures[1], fixtures[2], fixtures[3], fixtures[0]];
    copied.forEach((bytes, i) => check(Buffer.from(bytes).equals(Buffer.from(expected[i].data, 'base64')), 'Image bytes changed in transit'));
    await reader.screenshot({ path: '/tmp/wiredove-andfs-images-mobile.png' });
    await reader.setViewportSize({ width: 1280, height: 800 });
    await reader.emulateMedia({ colorScheme: 'dark' });
    await reader.screenshot({ path: '/tmp/wiredove-andfs-images-desktop-dark.png' });
    results.push('uploader closed; fresh website reader verifies and decodes all four original image files');
    await reader.goto(origin.replace('127.0.0.1', 'localhost'));
    await reader.evaluate(async ({ origin, post }) => { const { defineWiredoveMessage } = await import(origin + '/client/ui/message.js'); defineWiredoveMessage(); document.body.replaceChildren(); const message = document.createElement('wiredove-message'); message.post = post; document.body.append(message); }, { origin, post });
    await reader.waitForFunction(() => { const images = document.querySelector('wiredove-message').shadowRoot.querySelectorAll('wiredove-image-gallery img'); return images.length === 4 && [...images].every(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/')); });
    results.push('separate-origin embed verifies and displays the same inline images');
    await reader.goto(origin);
    const legacy = await reader.evaluate(async data => {
      const { apds } = await import('apds'); await apds.start('legacy-image-read-test');
      const hash = await apds.make('data:image/png;base64,' + data);
      const { appendMarkdown } = await import('/markdown.js'); document.body.replaceChildren(); appendMarkdown(document.body, `![](${hash})`);
      return hash;
    }, fixtures[0].data);
    await reader.waitForFunction(hash => { const gallery = document.querySelector('wiredove-image-gallery'); const image = gallery?.items[0]?.src === hash ? gallery.querySelector('img') : null; return image?.complete && image.naturalWidth > 0 && image.src.startsWith('data:image/png'); }, legacy);
    check(await reader.locator('wiredove-image-gallery').evaluate(el => el.items[0].src) === legacy, 'Historical APDS image hash changed');
    results.push('historical APDS image still loads through its original immutable hash');
    return { results };
  } finally { await Promise.all(contexts.map(context => context.close())); }
}
