// Run against a local Wiredove server using an isolated Playwright browser.
// Public writes, WebSockets, and the app bootstrap are blocked in every context.
async (page) => {
  const origin = new URL(page.url()).origin;
  const browser = page.context().browser();
  const contexts = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const results = [];
  async function isolated(viewport = { width: 1280, height: 800 }) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    contexts.push(context);
    await context.routeWebSocket('**', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && request.method() !== 'GET') return route.abort();
      if (url.origin === origin && url.pathname === '/') {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace("<script type='module' src='app.js'></script>", '') });
      }
      return route.continue();
    });
    const p = await context.newPage();
    await p.goto(origin);
    return p;
  }
  try {
    const uploader = await isolated();
    await uploader.evaluate(async () => {
      const { apds } = await import('apds');
      await apds.start('andfs-browser-test');
      await apds.put('keypair', await apds.generate());
      await apds.put('name', 'AndFS Local Test');
      const originalCompose = apds.compose;
      apds.compose = async (...args) => {
        const id = await originalCompose(...args);
        const signature = await apds.get(id);
        const opened = await apds.open(signature);
        const content = await apds.get(opened.slice(13));
        window.testPosts ||= []; window.testPosts.push({ id, signature, content, parsed: await apds.parseYaml(content), author: signature.slice(0, 44) });
        return id;
      };
      window.__feedEnqueue = async () => true;
    });
    // PCM WAV spans multiple AndFS chunks and is genuinely decodable audio.
    const wav = Buffer.alloc(44 + 48000 * 2 * 3);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(Math.round(2000 * Math.sin((i - 44) / 2 * 440 * 2 * Math.PI / 48000)), i);
    const videoBytes = await uploader.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d'), stream = canvas.captureStream(20);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const parts = [];
      recorder.ondataavailable = e => parts.push(e.data);
      const finished = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start();
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `hsl(${i * 12},70%,40%)`; ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = 'white'; ctx.font = '24px sans-serif'; ctx.fillText('AndFS local video', 30, 90);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      recorder.stop(); await finished; stream.getTracks().forEach(track => track.stop());
      return [...new Uint8Array(await new Blob(parts).arrayBuffer())];
    });
    const fixtures = [{ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav }, { name: 'canvas.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) }];
    for (const file of fixtures) {
      await uploader.evaluate(async () => { const { composer } = await import('/composer.js'); document.body.append(await composer()); });
      const dialog = uploader.locator('.composer-dialog');
      await dialog.locator('.media-composer input[type=file]').setInputFiles(file);
      await dialog.locator('.media-compose-status').filter({ hasText: 'Attachment ready' }).waitFor();
      await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
    }
    const posts = await uploader.evaluate(() => window.testPosts);
    check(posts.length === 2, 'Expected signed audio and video publications');
    for (const post of posts) {
      check(post.parsed.andfs && !post.parsed.blob, 'Wrong signed attachment metadata');
      check(post.content.includes(post.parsed.media_url), 'Missing older-client fallback URL');
    }
    check(posts[1].parsed.previous === posts[0].id, 'Media publication broke author history');
    results.push('real audio/video uploads and composer publication with signed metadata, fallback URLs, previous links');
    await contexts[0].close(); contexts.shift(); // Uploader is gone before retrieval.

    const reader = await isolated({ width: 390, height: 844 });
    const blockRequests = [];
    reader.on('request', request => { if (new URL(request.url()).pathname.startsWith('/blobs/')) blockRequests.push(request.url()); });
    for (const post of posts) {
      await reader.evaluate(async post => {
        const { an } = await import('/vendor/anproto/an.js');
        if ((await an.open(post.signature)).slice(13) !== await an.hash(post.content)) throw new Error('Signature verification failed');
        const { renderMedia } = await import('/media.js');
        document.body.replaceChildren(); await renderMedia(post.parsed, document.body);
      }, post);
      await reader.locator('.media-status').filter({ hasText: 'Verified AndFS media' }).waitFor();
      const player = reader.locator(post.parsed.type);
      await player.evaluate(async el => { el.load(); await el.play(); });
      await reader.waitForFunction(type => document.querySelector('wiredove-media').shadowRoot.querySelector(type).currentTime > 0, post.parsed.type);
      const playback = await player.evaluate(async el => {
        el.pause();
        const seeked = new Promise(resolve => el.addEventListener('seeked', resolve, { once: true }));
        el.currentTime = 0.5; await seeked;
        return { time: el.currentTime, error: el.error?.message, source: el.currentSrc };
      });
      check(playback.time >= 0.49 && !playback.error && playback.source.startsWith('blob:'), 'Verified media did not play/seek');
      const bytes = Buffer.from(await player.evaluate(async el => [...new Uint8Array(await (await fetch(el.src)).arrayBuffer())]));
      check(bytes.equals(fixtures.find(f => f.mimeType === post.parsed.mime).buffer), 'Replicated media bytes differ');
    }
    check(blockRequests.length >= 5, 'Fresh reader did not fetch manifest/chunk blocks');
    results.push('uploader closed; fresh mobile-width reader verifies exact bytes, plays audio/video, and seeks');

    // A separate origin must load the same public renderer and its vendored dependencies.
    await reader.goto(origin.replace('127.0.0.1', 'localhost'));
    await reader.evaluate(async ({ origin, post }) => {
      const { defineWiredoveMessage } = await import(origin + '/client/ui/message.js');
      defineWiredoveMessage();
      document.body.replaceChildren();
      const message = document.createElement('wiredove-message'); message.post = post;
      document.body.append(message);
    }, { origin, post: posts[1] });
    await reader.locator('wiredove-message .media-status').filter({ hasText: 'Verified AndFS media' }).waitFor();
    await reader.locator('wiredove-message video').evaluate(el => el.play());
    await reader.waitForFunction(() => document.querySelector('wiredove-message').shadowRoot.querySelector('video').currentTime > 0);
    results.push('observed separate-origin widget uses the same verified AndFS renderer and plays video');
    check(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile media overflows the viewport');
    await reader.screenshot({ path: '/tmp/wiredove-andfs-mobile.png' });
    await reader.setViewportSize({ width: 1280, height: 800 });
    await reader.emulateMedia({ colorScheme: 'dark' });
    await reader.screenshot({ path: '/tmp/wiredove-andfs-desktop-dark.png' });

    // Fresh embedded renderer caches nothing until it verifies a block. Changed bytes
    // must never reach the player, and an explicit retry must recover after repair.
    await reader.route(origin + '/blobs/**', route => route.fulfill({ body: 'corrupt block', headers: { 'access-control-allow-origin': '*' } }));
    await reader.evaluate(post => { document.querySelector('wiredove-message').post = post; }, posts[0]);
    await reader.locator('wiredove-message .media-status').filter({ hasText: 'Media unavailable' }).waitFor();
    check(await reader.locator('wiredove-message audio').getAttribute('src') === null, 'Corrupt media reached player');
    await reader.unroute(origin + '/blobs/**');
    await reader.getByRole('button', { name: 'Retry media' }).click();
    await reader.locator('wiredove-message .media-status').filter({ hasText: 'Verified AndFS media' }).waitFor();
    results.push('corrupt blocks cannot reach playback; explicit retry recovers');

    const before = blockRequests.length;
    await reader.evaluate(post => {
      const message = document.querySelector('wiredove-message');
      message.style.display = 'block'; message.style.marginTop = '4000px';
      message.post = post;
      window.scrollTo(0, 0);
    }, posts[1]);
    await reader.waitForTimeout(150);
    check(blockRequests.length === before, 'Offscreen media fetched eagerly');
    await reader.locator('wiredove-message').scrollIntoViewIfNeeded();
    await reader.locator('wiredove-message .media-status').filter({ hasText: 'Verified AndFS media' }).waitFor();
    results.push('offscreen media stays lazy until scrolled into view');
    await reader.goto(origin);
    const legacy = await reader.evaluate(async audio => {
      const { putBlob, HttpBlobStore } = await import('/anproto_blob.js');
      const { renderMedia } = await import('/media.js');
      const id = await putBlob(new Uint8Array(audio), new HttpBlobStore('/blobs'));
      const meta = { type: 'audio', blob: id, mime: 'audio/wav' };
      const original = JSON.stringify(meta);
      document.body.replaceChildren(); await renderMedia(meta, document.body);
      return { id, unchanged: original === JSON.stringify(meta) };
    }, [...wav]);
    check(legacy.id.startsWith('anblob:v1:') && legacy.unchanged, 'Legacy attachment identity changed');
    await reader.locator('.media-status').filter({ hasText: 'Verified legacy' }).waitFor();
    await reader.locator('audio').evaluate(el => el.play());
    await reader.waitForFunction(() => document.querySelector('audio').currentTime > 0);
    const legacyBytes = Buffer.from(await reader.locator('audio').evaluate(async el => [...new Uint8Array(await (await fetch(el.src)).arrayBuffer())]));
    check(legacyBytes.equals(wav), 'Legacy audio bytes changed');
    results.push('historical anblob reader retains the original ID, verifies identical bytes, and plays audio');
    return { results, posts: posts.map(({ signature, content }) => ({ signature, content })) };
  } finally { await Promise.all(contexts.map(context => context.close())); }
}
