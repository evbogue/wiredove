// Run on a local server with public writes and WebSockets blocked in every context.
async page => {
  const origin = new URL(page.url()).origin, browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', colorScheme: 'light', hasTouch: true });
  const check = (value, message) => { if (!value) throw new Error(message); };
  const secure = async ctx => {
    await ctx.routeWebSocket('**', socket => socket.close());
    await ctx.route('**/*', route => {
      const request = route.request(), host = new URL(request.url()).hostname;
      return !['127.0.0.1','localhost'].includes(host) && request.method() !== 'GET' ? route.abort() : route.continue();
    });
  };
  await secure(context);
  const results = [];
  let fresh;
  try {
    const test = await context.newPage(); await test.goto(origin);
    await test.getByRole('button', { name: 'Create or import identity', exact: true }).click();
    await test.getByLabel('Display name', { exact: true }).fill('Profile Crop Local Test');
    await test.getByRole('dialog').getByRole('button', { name: 'Create identity', exact: true }).click();
    await test.getByRole('heading', { name: 'Make yourself at home' }).waitFor();
    const original = Buffer.from(await test.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#6140b7'; ctx.fillRect(0, 0, 2400, 1800);
      ctx.fillStyle = '#f7bb62'; ctx.fillRect(300, 200, 1800, 1400);
      ctx.fillStyle = '#182747'; ctx.font = '200px sans-serif'; ctx.fillText('Original photo', 400, 950);
      return [...Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0))];
    }));
    const upload = test.locator('.profile-photo-editor input[type=file]');
    let count = 0;
    test.on('request', request => { if (new URL(request.url()).pathname === '/api/media') count++; });
    await upload.setInputFiles({ name: 'large-original.png', mimeType: 'image/png', buffer: original });
    await test.getByRole('button', { name: 'Use photo', exact: true }).waitFor({ state: 'visible' });
    await test.waitForFunction(() => { const button = document.querySelector('.photo-crop-dialog .primary-action'); return button && !button.disabled; });
    await test.getByRole('button', { name: 'Cancel crop', exact: true }).click();
    check(count === 0, 'Cancel uploaded the original photo');
    await upload.setInputFiles({ name: 'large-original.png', mimeType: 'image/png', buffer: original });
    await test.waitForFunction(() => { const button = document.querySelector('.photo-crop-dialog .primary-action'); return button && !button.disabled; });
    await test.getByLabel('Angle', { exact: true }).fill('17.5');
    await test.getByRole('button', { name: 'Rotate right 90°' }).click();
    await test.waitForFunction(() => Math.abs(Number(document.querySelector('input[aria-label=Angle]').value)-107.5) < .2);
    check(Math.abs(Number(await test.getByLabel('Angle', { exact: true }).inputValue()) - 107.5) < .2, 'Rotation controls did not combine');
    const stage = test.locator('.photo-crop-stage');
    await stage.focus(); await stage.press('ArrowRight');
    const bounds = await stage.boundingBox();
    await test.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await test.mouse.down(); await test.mouse.move(bounds.x + bounds.width / 2 + 12, bounds.y + bounds.height / 2, { steps: 4 }); await test.mouse.up();
    const touch = await context.newCDPSession(test);
    const beforePinch = await stage.locator('cropper-image').evaluate(image => Math.hypot(...image.$getTransform().slice(0,2)));
    const cx = bounds.x+bounds.width/2, cy = bounds.y+bounds.height/2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx-40, y: cy }, { x: cx+40, y: cy }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx-48, y: cy }, { x: cx+48, y: cy }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const afterPinch = await stage.locator('cropper-image').evaluate(image => Math.hypot(...image.$getTransform().slice(0,2)));
    check(afterPinch > beforePinch, 'Touch pinch did not zoom the image'); await touch.detach();
    check(await test.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile cropper overflows');
    await test.screenshot({ path: '/tmp/wiredove-profile-crop-mobile.png' });
    await test.getByRole('button', { name: 'Use photo', exact: true }).click();
    await test.getByText('Photo ready. Save changes to publish it.', { exact: true }).waitFor();
    check(count === 2, 'Expected original and cropped AndFS uploads');
    await test.getByRole('button', { name: 'Save changes', exact: true }).click();
    await test.getByRole('heading', { name: 'Your identity is ready' }).waitFor();
    const saved = await test.evaluate(async () => {
      const { apds } = await import('apds');
      const local = await apds.get('profile_photo');
      const log = await apds.query(await apds.pubkey());
      const rows = await Promise.all(log.map(async row => ({ content: row.text, parsed: await apds.parseYaml(row.text) })));
      return { local, signed: rows.find(row => row.parsed.image_original) };
    });
    check(saved.signed?.parsed.image === saved.local.image, 'Signed avatar differs from saved avatar');
    check(saved.signed.parsed.image_original === saved.local.original, 'Original reference was not signed');
    check(saved.local.crop.output_size === 1024, 'High resolution source was reduced below 1024');
    const radians = Math.atan2(saved.local.crop.matrix[1], saved.local.crop.matrix[0]);
    check(Math.abs(radians * 180 / Math.PI - 107.5) < .2, 'Saved crop lost the angle');
    results.push('drag/keyboard framing, fine rotation and quarter turns; cancel performs no upload; original/crop/settings signed');
    await test.reload();
    await test.getByRole('button', { name: 'Edit profile', exact: true }).waitFor();
    await test.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await test.setViewportSize({ width: 1280, height: 900 }); await test.emulateMedia({ colorScheme: 'dark' });
    await test.getByRole('button', { name: 'Adjust crop', exact: true }).click();
    await test.waitForFunction(() => !!document.querySelector('.photo-crop-dialog') && !document.querySelector('.photo-crop-dialog .primary-action').disabled);
    check(Math.abs(Number(await test.getByLabel('Angle', { exact: true }).inputValue()) - 107.5) < .2, 'Reloaded crop lost rotation');
    const restoredMatrix = await stage.evaluate(stage => {
      const image = stage.querySelector('cropper-image'), canvas = stage.querySelector('cropper-canvas');
      const [a,b,c,d] = image.$getTransform(), r = image.getBoundingClientRect(), f = canvas.getBoundingClientRect(), w = canvas.clientWidth;
      return [a/w,b/w,c/w,d/w,(r.left+r.width/2-f.left)/w,(r.top+r.height/2-f.top)/w];
    });
    check(restoredMatrix.every((value,i) => Math.abs(value-saved.local.crop.matrix[i]) < 1e-4), 'Re-crop framing changed at a new viewport: '+JSON.stringify({ saved: saved.local.crop.matrix, restored: restoredMatrix }));
    await test.screenshot({ path: '/tmp/wiredove-profile-crop-desktop-dark.png' });
    await test.getByRole('button', { name: 'Cancel crop', exact: true }).click();
    results.push('immediate reload and re-crop from the preserved original at a different viewport');

    fresh = await browser.newContext({ serviceWorkers: 'block' });
    await secure(fresh);
    const reader = await fresh.newPage();
    await fresh.route(origin + '/', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace("<script type='module' src='app.js'></script>", '') }); });
    await reader.goto(origin);
    const restored = await reader.evaluate(async state => {
      const { readImageFile, verifiedImageSource } = await import('/client/ui/image-source.js');
      const file = await readImageFile(state.original), source = await verifiedImageSource(state.image);
      const original = new Image(); original.src = URL.createObjectURL(file); await original.decode();
      const cropped = new Image(); cropped.src = source; await cropped.decode();
      const pixels = document.createElement('canvas'); pixels.width = pixels.height = cropped.naturalWidth;
      const drawing = pixels.getContext('2d'); drawing.drawImage(cropped,0,0);
      const last = cropped.naturalWidth-1;
      const corners = [[0,0],[last,0],[0,last],[last,last]].map(([x,y]) => drawing.getImageData(x,y,1,1).data[3]);
      const result = { corners, bytes: [...new Uint8Array(await file.arrayBuffer())], original: [original.naturalWidth,original.naturalHeight], cropped: [cropped.naturalWidth,cropped.naturalHeight] };
      URL.revokeObjectURL(original.src); return result;
    }, saved.local);
    check(Buffer.from(restored.bytes).equals(original), 'Original photo bytes changed');
    check(restored.original.join('x') === '2400x1800' && restored.cropped.join('x') === '1024x1024', 'Stored photo resolutions are wrong');
    check(restored.corners.every(alpha => alpha > 200), 'Rotation left empty crop corners');
    results.push('fresh reader verifies byte-identical 2400×1800 original and 1024×1024 cropped photo');
    const otherOrigin = origin.replace('127.0.0.1', 'localhost');
    await fresh.route(otherOrigin + '/', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace("<script type='module' src='app.js'></script>", '') }); });
    // Chromium asks for local-network permission when crossing localhost aliases.
    await fresh.grantPermissions(['local-network-access'], { origin: otherOrigin });
    await reader.goto(otherOrigin);
    await reader.evaluate(async ({ image, origin }) => {
      const { defineWiredoveMessage } = await import(origin + '/client/ui/message.js'); defineWiredoveMessage();
      const message = document.createElement('wiredove-message'); message.post = { author: 'A'.repeat(43)+'=', parsed: { body: 'Photo verification', image } }; document.body.append(message);
    }, { image: saved.local.image, origin });
    await reader.waitForFunction(() => document.querySelector('wiredove-message').shadowRoot.querySelector('img.avatar').naturalWidth === 1024);
    results.push('separate-origin embedded avatar verifies and displays the 1024px photo');
    const legacy = await reader.evaluate(async () => {
      const { apds } = await import('apds'); await apds.start('legacy-profile-photo-test');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
      const source = canvas.toDataURL('image/png'), hash = await apds.make(source);
      const { resolveImageSrc } = await import('/profile_image.js');
      return { hash, matches: await resolveImageSrc(hash) === source };
    });
    check(legacy.hash.length === 44 && legacy.matches, 'Historical APDS profile photo no longer resolves');
    // A small source must stay small, even though its screen preview is larger.
    await upload.setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: await test.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; return [...Uint8Array.from(atob(c.toDataURL().split(',')[1]), x => x.charCodeAt(0))]; }).then(value => Buffer.from(value)) });
    await test.waitForFunction(() => !!document.querySelector('.photo-crop-dialog') && !document.querySelector('.photo-crop-dialog .primary-action').disabled);
    await context.route(origin+'/api/media', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Injected photo upload failure"}' }));
    await test.getByRole('button', { name: 'Use photo', exact: true }).click();
    await test.getByText('Injected photo upload failure', { exact: true }).waitFor();
    check(await test.getByRole('button', { name: 'Use photo', exact: true }).isEnabled(), 'Photo upload could not be retried');
    await context.unroute(origin+'/api/media');
    await test.getByRole('button', { name: 'Use photo', exact: true }).click();
    await test.getByText('Photo ready. Save changes to publish it.', { exact: true }).waitFor();
    const smallSize = await test.locator('.profile-photo-editor img').evaluate(image => new Promise(resolve => { const ready = () => resolve(image.naturalWidth); if (image.complete) ready(); else image.onload = ready; }));
    check(smallSize <= 60, 'Small photo was upscaled');
    await test.getByRole('button', { name: 'Cancel', exact: true }).click();
    const unchanged = await test.evaluate(async () => { const { apds } = await import('apds'); return (await apds.get('profile_photo')).image; });
    check(unchanged === saved.local.image, 'Cancel published or persisted the replacement');
    results.push('upload failure retries successfully; small sources are not upscaled; cancel retains the saved photo; historical APDS profile photo resolves');
    return results;
  } finally { await context.close(); await fresh?.close(); }
}
