// Run through the browser testing tool against the local server. No public posts:
// isolated identities, blocked WebSockets, and publication errors injected before signing.
async (page) => {
  const origin = new URL(page.url()).origin;
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**', socket => socket.close());
  await context.route(origin + '/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("<script type='module' src='app.js'></script>", '') });
  });
  const test = await context.newPage();
  const errors = [];
  test.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  try {
    await test.goto(origin);
    await test.evaluate(async () => {
      const { apds } = await import('apds');
      await apds.start('composer-browser-test');
      await apds.put('keypair', await apds.generate());
      await apds.put('name', 'Composer Browser Test');
      const background = document.createElement('button');
      background.id = 'composer-test-trigger'; background.textContent = 'Open composer';
      background.style.marginTop = '1600px';
      document.body.append(background);
      background.focus(); window.scrollTo(0, 1100); window.expectedScrollY = window.scrollY;
      const { composer } = await import('/composer.js');
      document.body.append(await composer());
    });
    const dialog = test.locator('.composer-dialog');
    const editor = dialog.getByRole('textbox');
    check(await editor.evaluate(el => el === document.activeElement), 'Editor did not receive focus');
    check(await dialog.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'Empty publication enabled');
    check(await dialog.locator('.composer-tools .composer-icon').count() === 4, 'Expected four compact media actions');
    await editor.fill('Composer draft **preview**');
    await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
    check(await dialog.locator('.composer-preview strong').innerText() === 'preview', 'Markdown preview failed');
    await dialog.getByRole('button', { name: 'Back to editing' }).click();
    await editor.press('Shift+Tab');
    check(await dialog.getByRole('button', { name: 'Close composer (draft saved)' }).evaluate(el => el === document.activeElement), 'Unexpected focus order');
    await dialog.getByRole('button', { name: 'Publish', exact: true }).focus();
    await test.keyboard.press('Tab');
    check(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus escaped dialog');
    await test.keyboard.press('Escape');
    check(await dialog.count() === 0, 'Escape did not close composer');
    check(await test.locator('#composer-test-trigger').evaluate(el => el === document.activeElement && !el.inert), 'Focus was not restored');
    check(await test.evaluate(() => window.scrollY === window.expectedScrollY), 'Feed scroll position was not restored');
    await test.evaluate(async () => { const { composer } = await import('/composer.js'); document.body.append(await composer()); });
    check(await editor.inputValue() === 'Composer draft **preview**', 'Draft was not restored');
    await test.reload();
    await test.evaluate(async () => { const { apds } = await import('apds'); await apds.start('composer-browser-test'); const { composer } = await import('/composer.js'); document.body.append(await composer()); });
    check(await editor.inputValue() === 'Composer draft **preview**', 'Draft did not survive reload');
    results.push('focus, focus trap, close/reopen/reload draft, Markdown preview');

    // Signer failure must preserve the draft and make retry possible.
    await test.evaluate(async () => { const { apds } = await import('apds'); window.originalCompose = apds.compose; apds.compose = async () => { throw new Error('Injected signing failure'); }; });
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Injected signing failure' }).waitFor();
    check(await editor.inputValue() === 'Composer draft **preview**', 'Failed publication lost draft');
    check(await dialog.getByRole('button', { name: 'Publish', exact: true }).isEnabled(), 'Publication retry disabled');
    await test.evaluate(async () => { const { apds } = await import('apds'); apds.compose = window.originalCompose; });
    results.push('publication failure preserves draft and supports retry');

    await context.route(origin + '/blobs/**', route => route.fulfill({ status: 403, contentType: 'text/plain', body: 'Injected upload failure' }));
    await dialog.locator('.media-composer input[type=file]').setInputFiles({ name: 'fixture.webm', mimeType: 'audio/webm', buffer: Buffer.from('fixture') });
    await dialog.locator('.media-compose-status').filter({ hasText: '403' }).waitFor();
    check(await dialog.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'Failed attachment allowed publication');
    await dialog.getByRole('button', { name: 'Remove attachment' }).click();
    check(await dialog.getByRole('button', { name: 'Publish', exact: true }).isEnabled(), 'Removing failed attachment did not unblock publication');
    results.push('upload failure and attachment removal');
    const imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
    await dialog.locator('.composer-image-upload input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: imageBuffer });
    await dialog.getByRole('button', { name: 'Remove image', exact: true }).waitFor();
    check((await editor.inputValue()).includes('![]('), 'Image reference missing');
    await dialog.getByRole('button', { name: 'Remove image', exact: true }).click();
    check(!(await editor.inputValue()).includes('![]('), 'Removed image remained in draft');
    await context.unroute(origin + '/blobs/**');
    await context.route(origin + '/blobs/**', route => route.fulfill({ status: route.request().method() === 'HEAD' ? 404 : 200, contentType: 'application/json', body: '{}' }));
    await dialog.locator('.media-composer input[type=file]').setInputFiles({ name: 'fixture.webm', mimeType: 'video/webm', buffer: Buffer.from('fixture') });
    await dialog.locator('.media-compose-status').filter({ hasText: 'Attachment ready' }).waitFor();
    await dialog.getByRole('button', { name: 'Close composer (draft saved)' }).click();
    await test.evaluate(async () => { const { composer } = await import('/composer.js'); document.body.append(await composer()); });
    await dialog.getByRole('button', { name: 'Remove attachment' }).waitFor();
    check(await dialog.locator('video').count() === 1, 'Completed media draft was not restored');
    await dialog.getByRole('button', { name: 'Remove attachment' }).click();
    results.push('image preview/removal and completed media draft recovery');


    // Mock only capture devices. Assert disposal during a pending permission prompt
    // and during recording; neither case may upload the discarded capture.
    await test.evaluate(() => {
      window.stoppedTracks = 0;
      const stream = { getTracks: () => [{ stop() { window.stoppedTracks++; } }] };
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveCapture = () => resolve(stream); });
    });
    await dialog.getByRole('button', { name: 'Record audio', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close composer (draft saved)' }).click();
    await test.evaluate(() => window.resolveCapture());
    await test.waitForTimeout(50);
    check(await test.evaluate(() => window.stoppedTracks) === 1, 'Late microphone permission leaked tracks');
    await test.evaluate(async () => {
      const { composer } = await import('/composer.js');
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() { window.stoppedTracks++; } }] });
      window.MediaRecorder = class {
        static isTypeSupported() { return true; }
        constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()); }
      };
      document.body.append(await composer());
    });
    await dialog.getByRole('button', { name: 'Record audio', exact: true }).click();
    await dialog.getByRole('button', { name: 'Stop recording audio' }).waitFor();
    check(await dialog.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'Recording allowed publication');
    await dialog.getByRole('button', { name: 'Close composer (draft saved)' }).click();
    check(await test.evaluate(() => window.stoppedTracks) >= 2, 'Closing recorder leaked tracks');
    results.push('recording state and microphone cleanup, including late permission');

    // Reply/edit fixtures are signed locally and never sent to the network.
    await test.evaluate(async () => {
      const { apds } = await import('apds');
      const id = await apds.compose('Local composer reply fixture');
      window.fixtureSig = await apds.get(id);
      window.fixtureHash = await apds.hash(window.fixtureSig);
      const { composer } = await import('/composer.js');
      document.body.append(await composer(window.fixtureSig));
      window.originalCompose = apds.compose;
      apds.compose = async (body, meta) => { window.attemptedMeta = meta; throw new Error('Reply metadata captured'); };
    });
    check((await dialog.locator('.composer-context').innerText()).includes('Replying to'), 'Reply context missing');
    await editor.fill('Local reply draft');
    await dialog.getByRole('button', { name: 'Reply', exact: true }).click();
    check(await test.evaluate(() => window.attemptedMeta.reply === window.fixtureHash && window.attemptedMeta.replyto === window.fixtureSig.slice(0, 44)), 'Reply metadata changed');
    await test.keyboard.press('Escape');
    await test.evaluate(async () => { const { composer } = await import('/composer.js'); document.body.append(await composer(null, { editHash: window.fixtureHash, editBody: 'Original body' })); });
    check(await editor.inputValue() === 'Original body', 'Edit content missing');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    check(await test.evaluate(() => window.attemptedMeta.edit === window.fixtureHash), 'Edit metadata changed');
    results.push('reply and edit contexts and publishing metadata');

    for (const scheme of ['light', 'dark']) {
      await test.emulateMedia({ colorScheme: scheme });
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 320 }]) {
        await test.setViewportSize(viewport);
        await test.waitForTimeout(80);
        const bounds = await dialog.locator('.composer-footer').boundingBox();
        check(bounds.x >= -1 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `Footer outside ${scheme} ${viewport.width}x${viewport.height}`);
        for (const button of await dialog.locator('.composer-footer button').all()) {
          const b = await button.boundingBox();
          check(b && b.x >= -1 && b.x + b.width <= viewport.width + 1, 'Toolbar button outside viewport');
        }
      }
    }
    check(errors.length === 0, errors.join('\n'));
    results.push('light/dark desktop, mobile, narrow, landscape, reduced-height layouts');
    return results;
  } finally { await context.close(); }
}
