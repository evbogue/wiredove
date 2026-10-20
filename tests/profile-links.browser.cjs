// Run with Node and Playwright installed. All identity/transport operations
// are mocked; this never signs or publishes to a live user's feed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = [{ ts: 1, text: JSON.stringify({ name: 'Example', bio: 'My introduction.', links: [{ label: 'Home', url: 'https://example.com/' }] }) }];
const mocks = {
  '/test-apds.js': `
    window.published = []; window.sent = []; window.historyMessages = ${JSON.stringify(fixture)};
    export const apds = {
      parseYaml: async text => JSON.parse(text), query: async () => window.historyMessages,
      visual: async () => null, put: async () => {},
      get: async key => key === 'published' ? 'signed-proof' : key === 'content-hash' ? 'encoded-content' : null,
      open: async () => '1234567890123content-hash',
      compose: async (body, meta) => {
        if (window.failSave) throw Error('offline');
        window.published.push(structuredClone(meta));
        window.historyMessages.unshift({ts: Date.now(), text: JSON.stringify(meta)});
        return 'published';
      }
    };`,
  '/test-h.js': `export function h(tag, attrs = {}, content = []) {
    const el = document.createElement(tag);
    for (const [key,value] of Object.entries(attrs)) el[key] = value;
    for (const child of content) if (child) el.append(child);
    return el;
  }`,
  '/markdown.js': `export const markdown = async text => { const p = document.createElement('p'); p.textContent = text; return p.outerHTML; };`,
  '/send.js': 'export const send = async value => { window.sent.push(value); };',
};
const harness = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css">
  <script type="importmap">{"imports":{"apds":"/test-apds.js","h":"/test-h.js"}}</script>
  <script type="module">
    import { buildProfileHeader } from '/profile_header.js';
    window.mount = async () => {
      document.querySelector('.profile-header')?.remove();
      document.body.append(await buildProfileHeader({label:'Example',messages:window.historyMessages || ${JSON.stringify(fixture)},canEdit:true,pubkey:'test'}));
    };
    await window.mount(); window.ready = true;
  </script>`;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    if (pathname === '/') { res.setHeader('Content-Type','text/html'); res.end(harness); return; }
    res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(mocks[pathname] || await fs.readFile(path.join(root, pathname)));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  if (process.env.PROFILE_LINKS_SERVE_ONLY) {
    console.log(`Profile test harness on port ${server.address().port}`);
    return;
  }
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.waitForFunction(() => window.ready);
    assert.equal(await page.locator('.profile-links a').innerText(), 'Home');
    assert.equal(await page.locator('.profile-links').evaluate(el => getComputedStyle(el).display), 'flex');
    assert.equal(await page.locator('.profile-bio').evaluate(el => getComputedStyle(el).textAlign), 'left');
    await page.getByRole('button', {name:'Edit profile', exact:true}).click();
    assert.equal(await page.locator('.profile-links').isVisible(), false);
    await page.getByRole('button', {name:'Add link', exact:true}).click();
    await page.getByLabel('Link 2 label', {exact:true}).fill('GitHub');
    await page.getByLabel('Link 2 URL', {exact:true}).fill('https://github.com/example');
    await page.getByRole('button', {name:'Move up link 2', exact:true}).click();
    await page.getByRole('button', {name:'Save profile', exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.profile-editing'));
    assert.deepEqual(await page.locator('.profile-links a').allTextContents(), ['GitHub', 'Home']);
    assert.deepEqual(await page.evaluate(() => window.sent), ['signed-proof', 'encoded-content']);
    await page.evaluate(() => window.mount());
    assert.deepEqual(await page.locator('.profile-links a').allTextContents(), ['GitHub', 'Home']);
    await page.getByRole('button', {name:'Edit profile', exact:true}).click();
    await page.getByLabel('Link 1 label', {exact:true}).fill('Unsaved');
    await page.getByRole('button', {name:'Cancel', exact:true}).click();
    assert.equal(await page.locator('.profile-links a').first().innerText(), 'GitHub');
    await page.getByRole('button', {name:'Edit profile', exact:true}).click();
    await page.getByLabel('Link 1 URL', {exact:true}).fill('javascript:alert(1)');
    await page.getByRole('button', {name:'Save profile', exact:true}).click();
    assert.match(await page.getByRole('status').innerText(), /Link 1/);
    assert.equal(await page.evaluate(() => window.published.length), 1);
    await page.getByLabel('Link 1 URL', {exact:true}).fill('https://bsky.app/profile/example.com');
    await page.evaluate(() => { window.failSave = true; });
    await page.getByRole('button', {name:'Save profile', exact:true}).click();
    await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Failed'));
    assert.equal(await page.getByRole('button', {name:'Save profile', exact:true}).isEnabled(), true);
    await page.evaluate(() => { window.failSave = false; });
    await page.getByRole('button', {name:'Save profile', exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.profile-editing'));
    for (const width of [375, 1100]) for (const colorScheme of ['light', 'dark']) {
      await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.profile-bio').evaluate(el => getComputedStyle(el).textAlign), 'left');
    }
    await page.getByRole('button', {name:'Edit profile', exact:true}).click();
    await page.getByRole('button', {name:'Remove link 1', exact:true}).click();
    await page.getByRole('button', {name:'Remove link 1', exact:true}).click();
    await page.getByRole('button', {name:'Save profile', exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('.profile-editing'));
    assert.deepEqual(await page.evaluate(() => window.published.at(-1).links), []);
    await page.evaluate(() => window.mount());
    assert.equal(await page.locator('.profile-links a').count(), 0);
    // Import actual widget modules from a different origin into a host page.
    await page.evaluate(async port => {
      document.body.replaceChildren();
      const {defineWiredoveWidget} = await import(`http://localhost:${port}/client/ui/widget.js`);
      defineWiredoveWidget();
      const widget = document.createElement('wiredove-widget');
      document.body.append(widget);
      widget.posts = [
        {author:'example',timestamp:1,parsed:{links:[{label:'<img src=x onerror=alert(1)>',url:'https://example.com/'}]}},
        {author:'example',timestamp:2,parsed:{name:'New name'}},
      ];
      widget.navigate({type:'profile',author:'example'});
    }, port);
    const link = page.locator('wiredove-widget').locator('.profile-link');
    assert.equal(await link.innerText(), '<img src=x onerror=alert(1)>');
    assert.equal(await link.locator('img').count(), 0);
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer me');
    await page.evaluate(() => {
      const widget = document.querySelector('wiredove-widget');
      widget.posts = [{author:'example',timestamp:2,parsed:{links:[]}}, ...widget._posts];
    });
    assert.equal(await page.locator('wiredove-widget').locator('.profile-link').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: profile edit/save/reload/reorder/cancel/clear, unsafe URLs, failed-save retry, responsive light/dark, separate-origin embed and text escaping');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
