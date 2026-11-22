// Real application/router/feed/renderer, disposable DOM and offline APDS session.
// Tests UI ownership, not protocol/backend or full milestone-1 acceptance.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stubs = {
  '/offline-apds.js': `export const apds={put:async()=>{},getHashLog:async()=>[],getOpenedLog:async()=>[],start:async(name)=>{window.testDatabase=name},pubkey:async()=>null,keypair:async()=>null,query:async()=>[],visual:async()=>document.createElement('img'),get:async key=>key==='name'?'Offline fixture':null,parseYaml:async()=>({}),human:async()=>'',open:async()=>null};`,
  '/connect.js': 'export const connect=async()=>{},disconnect=async()=>{};',
  '/sync.js': 'export const startSync=async()=>{},stopSync=()=>{},noteInterest=async()=>{},noteSeen=async()=>{};',
  '/offline-h.js': `export function h(tag,attrs={},children=[]){if(Array.isArray(attrs)){children=attrs;attrs={}}const node=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(k==='classList')node.className=v;else node[k]=v}for(const child of children)if(child)node.append(child);return node}`,
};
(async () => {
  let syncFailure = false;
  const server = http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://localhost');
      res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');
      if (url.pathname === '/api/application') { res.setHeader('content-type','application/json');res.end(JSON.stringify({records:[],cursor:0,more:false,scope:'backend-archive'}));return; }
      if (url.pathname === '/gossip/poll') { res.setHeader('content-type','application/json');res.end(JSON.stringify({messages:[],nextSince:0}));return; }
      if (['/api/git/demo-repo/overview', '/api/git/' + 'a'.repeat(43) + '/overview'].includes(url.pathname)) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          repository: { id: url.pathname.split('/')[3], name: 'Demo repository', level: 2 },
          revision: { ref: 'refs/heads/main', commit: 'a'.repeat(40) }, path: '', entries: [],
        }));
        return;
      }
      if (['/api/git/demo-repo/commit', '/api/git/' + 'a'.repeat(43) + '/commit'].includes(url.pathname)) {
        res.setHeader('content-type', 'application/json');
        const hash = 'a'.repeat(40);
        res.end(JSON.stringify({
          repository: { id: url.pathname.split('/')[3], name: 'Demo repository', level: 2 },
          revision: { ref: null, commit: hash }, path: '', files: [],
          details: { hash, author: 'Fixture author', parents: [], message: '<script>commit message</script>' },
        }));
        return;
      }
      if (url.pathname === '/sync/status') {
        res.setHeader('content-type', 'application/json');
        if (url.search || syncFailure) { res.statusCode = 503; res.end('{}'); return; }
        res.end(JSON.stringify({ selection: {
          repoId: 'a'.repeat(43) + '=', ref: 'refs/heads/main', updateId: 'verified-update',
        } }));
        return;
      }
      if (url.pathname === '/hosted') {
        res.setHeader('content-type','text/html');
        res.end(`<!doctype html><script type="importmap">{"imports":{"apds":"/offline-apds.js","h":"/offline-h.js"}}</script><script type="module">
          import {anbotWebsiteServices, startWebsiteApplication} from '/client/runtime/website-application.js';
          await startWebsiteApplication({services:anbotWebsiteServices,network:false});
        </script>`);
        return;
      }
      if (url.pathname === '/website') {
        res.setHeader('content-type','text/html');
        res.end(`<!doctype html><link rel="stylesheet" href="/style.css"><script type="importmap">{"imports":{"apds":"/offline-apds.js","h":"/offline-h.js"}}</script><script type="module" src="/app.js"></script>`);return;
      }
      if (url.pathname === '/') {
        res.setHeader('content-type','text/html');
        res.end(`<!doctype html><link rel="stylesheet" href="/style.css"><script type="importmap">{"imports":{"apds":"/offline-apds.js","h":"/offline-h.js"}}</script><div id="host">Host page</div><div id="one"></div><div id="two"></div><script type="module">
import {createApplication} from '/client/runtime/application.js';
import {createNavigation} from '/client/runtime/application-context.js';
const make=async id=>{
const root=document.querySelector('#'+id), navigation=createNavigation('');
let top=0;
const scroll={get:()=>top,to:value=>{top=value.top},target:root,observerRoot:root,height:()=>800};
const app=await createApplication({root,navigation,scroll});await app.start();return app;
};
window.apps=await Promise.all(['one','two'].map(make));window.ready=true;
</script>`); return;
      }
      const file=path.resolve(root,'.'+url.pathname);
      if (!file.startsWith(root+path.sep)) throw Error('bad path');
      res.end(stubs[url.pathname] || await fs.readFile(file));
    } catch { res.writeHead(404);res.end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1200,height:900}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin);
    await page.waitForFunction(()=>window.ready);
    await page.evaluate(async()=>{
      const {composer}=await import('/composer.js');
      const overlay=await composer(null,{application:apps[0]});
      apps[0].root.append(overlay);
      window.testOverlay=overlay;
    });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#host').evaluate(node=>node.inert),false);
    assert.equal(await page.locator('#two').evaluate(node=>node.inert),false);
    await page.evaluate(()=>testOverlay.remove());
    await page.waitForTimeout(30);
    await page.evaluate(async()=>{
      const [a,b]=apps;
      window.originalPanel=a.root.querySelector('.route-panel');
      a.scroll.to({top:125});
      await a.navigate('?cats');
      if(b.navigation.get()!=='')throw Error('navigation leaked');
      await a.navigate('');
    });
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(()=>apps[0].root.querySelector('.route-panel')===originalPanel),true);
    assert.equal(await page.evaluate(()=>apps[0].scroll.get()),125);
    await page.evaluate(async()=>{
      const [a,b]=apps;
      const {subscribeRenderer,deliverToRenderers}=await import('/client/runtime/render-delivery.js');
      let deliveries=0;
      const unsubscribe=subscribeRenderer(a.render);
      const gallery=document.createElement('wiredove-image-gallery');
      gallery.refreshSource=()=>{deliveries++};
      a.root.append(gallery);
      await deliverToRenderers('blob','data:image/png;base64,AA==',{hash:'legacy-image'});
      unsubscribe();
      await deliverToRenderers('blob','data:image/png;base64,AA==',{hash:'legacy-image'});
      if(deliveries!==1)throw Error('renderer delivery subscription lifecycle failed');
      gallery.remove();
      for (const app of apps) app.root.querySelector('.route-panel').append(app.render.hash('same-id'));
      if(a.root.querySelector('[id="same-id"]')===b.root.querySelector('[id="same-id"]'))throw Error('renderer leaked');
      a.feeds.status('Only first app',{sticky:true});
      if(b.root.textContent.includes('Only first app'))throw Error('status leaked');
      await a.feeds.enqueue('',{hash:'local-entry',ts:1700000000000,local:true});
      if(b.root.querySelector('[id="local-entry"]'))throw Error('feed leaked');
      await a.navigate('settings');
      await b.navigate('?dogs');
      window.oldRoot=a.root;
      a.destroy();
      await a.navigate('?after-destroy');
      if(oldRoot.querySelector('.route-panel'))throw Error('destroyed router rendered');
      if(b.navigation.get()!=='?dogs')throw Error('destroy affected other instance');
      if(Object.keys(window).some(key=>key.startsWith('__feed')))throw Error('global feed hook');
      if(location.hash)throw Error('host hash changed');
      const {createApplication}=await import('/client/runtime/application.js');
      const remount=await createApplication({root:oldRoot,navigation:a.navigation,scroll:a.scroll});
      await remount.start();
      if(oldRoot.querySelectorAll('nav').length!==1 || oldRoot.querySelectorAll('.route-panel').length!==1)throw Error('remount duplicated UI');
      remount.destroy();
    });
    assert.deepEqual(errors,[]);
    await page.evaluate(async()=>{
      const Original=window.WebSocket;
      const sockets=[];
      class FakeSocket {
        static OPEN=1;static CONNECTING=0;
        readyState=0;
        constructor(){sockets.push(this)}
        close(){this.readyState=3;this.closed=true}
      }
      window.WebSocket=FakeSocket;
      const {makeWs,stopNetwork,hasWs}=await import('/websocket.js');
      await makeWs(location.origin.replace('http:','ws:'),{waitForReady:false});
      if(!hasWs())throw Error('HTTP fallback not started');
      sockets[0].onerror();
      stopNetwork();
      if(hasWs() || !sockets[0].closed)throw Error('transport still active');
      await new Promise(resolve=>setTimeout(resolve,1200));
      if(sockets.length!==1)throw Error('reconnect survived disposal');
      await makeWs(location.origin.replace('http:','ws:'),{waitForReady:false});
      if(sockets.length!==2)throw Error('transport did not restart');
      stopNetwork();
      window.WebSocket=Original;
    });
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(root,'test-results/application-state.png'),fullPage:true});
    await page.goto(origin+'/website');
    await page.locator('#scroller .route-panel').waitFor();
    await page.getByRole('searchbox').fill('website-search');
    await page.waitForFunction(()=>location.hash==='#?website-search');
    await page.locator('.route-panel[data-route-key="?website-search"]').waitFor();
    await page.getByRole('link',{name:'Home',exact:true}).click();
    await page.locator('.route-panel[data-route-key="__home__"]').waitFor();
    await page.setViewportSize({ width: 390, height: 780 });
    await page.getByRole('searchbox').fill('workspace-back');
    const socialPanel = page.locator('.route-panel[data-route-key="?workspace-back"]');
    await socialPanel.waitFor();
    await socialPanel.evaluate(node => { node.dataset.workspaceTest = 'original'; });
    const workspace = page.getByRole('link', { name: 'Workspace', exact: true });
    await workspace.focus();
    await workspace.press('Enter');
    const sidebar = page.getByRole('navigation', { name: 'Workspace navigation' });
    const openMenu = () => page.getByRole('button', { name: 'Menu', exact: true }).click();
    await openMenu();
    await sidebar.getByRole('link', { name: 'Feed', exact: true }).waitFor();
    assert.equal(await sidebar.getByRole('link', { name: 'Feed', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).count(), 0);
    assert.ok(page.url().endsWith('#?workspace-back'));
    assert.equal(await socialPanel.getAttribute('data-workspace-test'), 'original');
    await page.keyboard.press('Escape');
    await sidebar.waitFor({ state: 'hidden' });
    await openMenu();
    await sidebar.getByRole('link', { name: 'Feed', exact: true }).click();
    await sidebar.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => location.hash === '' || location.hash === '#');
    await page.reload();
    await openMenu();
    await page.keyboard.press('Escape');
    const search = page.getByRole('searchbox', { name: 'Search Wiredove' });
    await search.fill('inside-workspace');
    await search.press('Enter');
    await page.waitForFunction(() => location.hash === '#?inside-workspace');
    await openMenu();
    await sidebar.getByRole('link', { name: 'Repository', exact: true }).click();
    await page.getByRole('heading', { name: 'Demo repository', level: 2 }).waitFor();
    await sidebar.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Copy clone URL' }).waitFor();
    const workspaceColumns = () => page.locator('.workspace-layout:visible').evaluate(
      layout => getComputedStyle(layout).gridTemplateColumns.split(' ').length,
    );
    assert.equal(await workspaceColumns(), 1);
    await page.setViewportSize({ width: 1200, height: 780 });
    await sidebar.getByRole('link', { name: 'Files', exact: true }).waitFor();
    assert.equal(await sidebar.getByLabel('Repository ID').isVisible(), false);
    assert.equal(await workspaceColumns(), 2);
    assert.ok((await page.locator('.workspace-layout:visible').boundingBox()).width > 1000);
    assert.ok((await sidebar.boundingBox()).x < 30);
    await page.setViewportSize({ width: 390, height: 780 });
    await openMenu();
    await sidebar.getByText('Open by ID', { exact: true }).click();
    await sidebar.getByLabel('Repository ID').fill('demo-repo');
    await sidebar.getByRole('button', { name: 'Open repository' }).click();
    await page.getByRole('heading', { name: 'Demo repository', level: 2 }).waitFor();
    const repositoryURL = page.url();
    await openMenu();
    await sidebar.getByRole('button', { name: 'Social view', exact: true }).click();
    await sidebar.waitFor({ state: 'detached' });
    await page.locator('.route-panel[data-route-key="?inside-workspace"]').waitFor();
    await page.goBack();
    await page.getByRole('heading', { name: 'Demo repository', level: 2 }).waitFor();
    assert.equal(page.url(), repositoryURL);
    await page.reload();
    await page.getByRole('heading', { name: 'Demo repository', level: 2 }).waitFor();
    assert.deepEqual(errors,[]);
    await page.getByRole('link', { name: 'Latest commit in view' }).click();
    await page.getByText('<script>commit message</script>', { exact: true }).waitFor();
    const commitURL = page.url();
    await page.evaluate(() => {
      localStorage.setItem('wiredove-composer-draft:anon:new', JSON.stringify({ body: 'Existing draft' }));
    });
    await page.getByRole('link', { name: 'Discuss in Social' }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).waitFor();
    assert.ok(page.url().includes('#compose') || page.url().includes('#share='));
    const draftBody = await page.getByPlaceholder('Write a message').inputValue();
    assert.ok(draftBody.startsWith('Existing draft\n\n'));
    assert.ok(draftBody.includes(commitURL));
    assert.deepEqual(errors,[]);
    await page.keyboard.press('Escape');
    await page.goto(origin + '/website#sync');
    await page.getByRole('heading', { name: 'Server Git selection' }).waitFor();
    await page.getByText('verified-update').waitFor();
    syncFailure = true;
    await page.getByRole('button', { name: 'Refresh Git status' }).click();
    await page.getByText('Refresh failed. Showing the last known Git selection.').waitFor();
    await page.getByText('verified-update').waitFor();
    await page.getByRole('heading', { name: 'Browser Social sync' }).waitFor();
    await page.evaluate(() => {
      window.testRelaySockets = [];
      window.WebSocket = class {
        static OPEN = 1;
        constructor(url) { this.url = url; window.testRelaySockets.push(this); }
        close() { this.closed = true; }
      };
    });
    const relayAddress = page.getByLabel('APDS WebSocket URL');
    for (const address of ['ws://127.0.0.1:9000/', 'ws://127.0.0.1:9001/']) {
      await relayAddress.fill(address);
      await page.getByRole('button', { name: 'Add APDS relay' }).click();
      await page.getByRole('switch', { name: new RegExp(address) }).waitFor();
    }
    await page.getByRole('switch', { name: /9000/ }).uncheck();
    assert.deepEqual(await page.evaluate(() => testRelaySockets.map(socket => !!socket.closed)), [true, false]);
    assert.match(await page.evaluate(() => localStorage.getItem('anbot:custom-apds')), /9000.*9001/);

    assert.deepEqual(errors,[]);
    let releaseHostedPoll;
    const hostedPoll = new Promise(resolve => { releaseHostedPoll = resolve; });
    await page.route(origin + '/gossip/poll?since=0', async route => {
      await hostedPoll;
      await route.continue();
    });
    try {
      await page.goto(origin + '/hosted#compose');
      await page.getByPlaceholder('Write a message').waitFor({timeout:5000});
    } finally {
      releaseHostedPoll();
    }
    await page.getByPlaceholder('Write a message').waitFor();
    assert.equal(await page.evaluate(() => window.testDatabase), 'anbot-wiredove-preview');
    assert.match(await page.getByPlaceholder('Write a message').inputValue(), /Existing draft/);
    assert.deepEqual(errors,[]);
    console.log('Website bootstrap: offline startup, hash search and home passed');
    console.log('Application ownership: two roots, navigation, cached panels, scroll, renderer IDs, feed enqueue/status and disposal passed');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
