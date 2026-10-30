// Real public modules, verified disposable signed fixtures and two localhost origins.
// Publication is deliberately an injected failing/succeeding host callback here;
// real storage/relay round-trip acceptance belongs to the site integration suite.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const { default: nacl } = await import('../vendor/anproto/lib/nacl-fast-es.js');
  nacl.setPRNG(bytes => require('node:crypto').randomFillSync(bytes));
  const { an } = await import('../vendor/anproto/an.js');
  const keypair = await an.gen();
  const sign = async parsed => {
    const content = JSON.stringify(parsed), signature = await an.sign(await an.hash(content), keypair);
    return { content, signature };
  };
  const original = await sign({ name: 'Shared fixture', body: 'Canonical **message**' });
  const id = await an.hash(original.signature);
  const reply = await sign({ name: 'Shared fixture', body: 'Reply fixture', replyHash: id });
  const historical = await sign({ name: 'Shared fixture', body: 'Historical media', type: 'audio', blob: 'anblob:v1:fixture' });
  let origin;
  const serve = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/parent') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<iframe title="Shared message host" src="${origin}" style="border:0;width:100%;height:100vh"></iframe>`); return;
      }
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:8px;font:16px system-ui}wiredove-widget{max-width:660px;margin:auto}</style><wiredove-widget></wiredove-widget><script type="module">
import {defineWiredoveWidget} from '/client/ui/widget.js';
import {createProtocol} from '/client/protocol.js';
import {an} from '/vendor/anproto/an.js';
defineWiredoveWidget();
window.widget=document.querySelector('wiredove-widget');
const protocol=createProtocol({an,yaml:{parse:JSON.parse,create:JSON.stringify}});
window.records=await Promise.all(${JSON.stringify([original, reply, historical])}.map(p=>protocol.verify(p.signature,p.content)));
try {await protocol.verify(records[0].signature,records[0].content+' ');window.tamperRejected=false;}catch{window.tamperRejected=true;}
widget.presentation={postURL:post=>'/post/'+encodeURIComponent(post.id),replyURL:id=>'/post/'+encodeURIComponent(id)};
widget.posts=records;window.ready=true;
</script>`); return;
      }
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep)) throw Error('bad path');
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
  };
  const server = http.createServer(serve), parent = http.createServer(serve);
  await Promise.all([server, parent].map(s => new Promise(resolve => s.listen(0, '127.0.0.1', resolve))));
  origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
    for (const width of [1200, 390, 320]) for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${parent.address().port}/parent`);
      const frame = page.frames().find(f => f.url() === origin + '/');
      await frame.waitForFunction(() => window.ready);
      assert.equal(await frame.evaluate(() => tamperRejected), true);
      assert.equal(await frame.getByRole('button', { name: 'Reply to this post' }).count(), 0);
      assert.equal(await frame.locator('[data-wiredove-message]').count(), 2);
      assert.equal(await frame.getByText('Historical attachment unavailable in this view.').count(), 1);
      await frame.evaluate(() => {
        widget.setAttribute('interactive', '');
        widget.navigate({ type: 'compose' });
      });
      assert.equal(await frame.locator('wiredove-composer').count(), 0, 'interactive without publisher must not compose');
      await frame.evaluate(() => {
        widget.capabilities = { reply: true, compose: false };
        window.calls = 0; window.failed = true; window.events = 0; window.publishedEvents = 0;
        widget.addEventListener('wiredove-published', () => publishedEvents++);
        widget.addEventListener('wiredove-compose', () => events++);
        widget.onPublish = async draft => {
          calls++; window.lastDraft = draft;
          if (failed) throw Error('Local relay unavailable');
          return { saved: true, relayed: false };
        };
        widget.navigate({ type: 'post', id: records[0].id });
      });
      assert.equal(await frame.getByRole('button', { name: 'Write', exact: true }).count(), 0);
      assert.equal(await frame.locator('wiredove-thread wiredove-message').count(), 2);
      assert.equal(await frame.locator('.reply-preview-icon').textContent(), '↳', 'Parent context must not depend on an external icon font');
      assert.equal(await frame.getByRole('link', { name: 'Open parent post' }).getAttribute('href'), '/post/' + encodeURIComponent(id));
      await frame.evaluate(() => {
        const thread = widget.shadowRoot.querySelector('wiredove-thread');
        window.originalMessage = thread.shadowRoot.querySelector('wiredove-message');
        window.originalContent = originalMessage.shadowRoot.querySelector('.content');
        widget.posts = records.map(post => ({ ...post, parsed: { ...post.parsed } }));
        window.retained = originalMessage === thread.shadowRoot.querySelector('wiredove-message') && originalContent === originalMessage.shadowRoot.querySelector('.content');
      });
      assert.equal(await frame.evaluate(() => retained), true, 'refresh must retain message DOM');
      // A real playing audio node must survive callback and equivalent-record updates.
      await frame.evaluate(async () => {
        const audio = document.createElement('audio');
        const bytes = new Uint8Array(44 + 8000 * 2 * 4), view = new DataView(bytes.buffer);
        const text = (at, s) => [...s].forEach((c, i) => bytes[at + i] = c.charCodeAt(0));
        text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
        audio.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); audio.muted = true; audio.loop = true;
        originalContent.append(audio); window.player = audio;
        await audio.play();
        widget.posts = records.map(post => ({ ...post }));
      });
      assert.equal(await frame.evaluate(() => player.isConnected && !player.paused), true);
      await frame.getByRole('button', { name: 'Reply to this post' }).first().focus();
      await frame.getByRole('button', { name: 'Reply to this post' }).first().press('Enter');
      const input = frame.getByRole('textbox', { name: 'Write a reply', exact: true });
      await input.fill('Keep this reply after failure');
      await frame.getByRole('button', { name: 'Reply', exact: true }).click();
      await frame.getByText('Local relay unavailable', { exact: true }).waitFor();
      assert.equal(await input.inputValue(), 'Keep this reply after failure');
      assert.equal(await frame.evaluate(() => events), 0);
      await frame.evaluate(() => widget.navigate({ type: 'feed' }));
      await frame.evaluate(() => widget.navigate({ type: 'compose', replyTo: records[0] }));
      assert.equal(await input.inputValue(), 'Keep this reply after failure', 'navigation must retain reply draft');
      await frame.evaluate(() => { failed = false; widget.posts = records.map(post => ({ ...post })); });
      assert.equal(await input.inputValue(), 'Keep this reply after failure', 'refresh must retain reply draft');
      await frame.getByRole('button', { name: 'Reply', exact: true }).click();
      await frame.getByText('Saved locally; relay confirmation pending.', { exact: true }).waitFor();
      assert.deepEqual(await frame.evaluate(() => ({ calls, events, target: lastDraft.replyTo.id })), { calls: 2, events: 1, target: id });
      assert.equal(await frame.evaluate(() => publishedEvents), 1, 'Public publication event must cross the composer shadow boundary');
      assert.equal(await input.inputValue(), '');
      await frame.evaluate(() => { widget.onPublish = null; widget.navigate({ type: 'feed' }); });
      assert.equal(await frame.getByRole('button', { name: 'Reply to this post' }).count(), 0);
      assert.equal(await frame.locator('wiredove-widget').evaluate(el => el.getBoundingClientRect().width <= innerWidth), true);
      assert.deepEqual(errors, []);
      await frame.waitForFunction(() => {
        const feed = widget.shadowRoot.querySelector('wiredove-thread-feed');
        const message = feed?.shadowRoot.querySelector('wiredove-message');
        const avatar = message?.shadowRoot.querySelector('.avatar');
        return avatar && getComputedStyle(avatar).width === '35px';
      });
      assert.equal(await frame.locator('.message-main').evaluateAll(nodes => nodes.every(el => el.scrollWidth <= el.clientWidth + 1)), true);
      await frame.evaluate(() => { widget.presentation = { navigation: false, postURL: post => '/post/' + encodeURIComponent(post.id), replyURL: id => '/post/' + encodeURIComponent(id) }; });
      assert.equal(await frame.getByRole('button', { name: 'Feed', exact: true }).count(), 0);
      await frame.waitForFunction(() => {
        const feed = widget.shadowRoot.querySelector('wiredove-thread-feed');
        const avatar = feed?.shadowRoot.querySelector('wiredove-message')?.shadowRoot.querySelector('.avatar');
        return avatar && getComputedStyle(avatar).width === '35px';
      });
      await page.screenshot({ path: `/tmp/shared-message-${width}-${colorScheme}.png`, animations: 'disabled' });
      await context.close();
      console.log(`Shared message runtime: ${width}px ${colorScheme} passed`);
    }
  } finally {
    await browser?.close();
    await Promise.all([server, parent].map(s => new Promise(resolve => s.close(resolve))));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
