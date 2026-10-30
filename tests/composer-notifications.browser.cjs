// Exercise the real composer and notification modules. All network writes are local mocks.
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
  const content = JSON.stringify({ name: 'Notification Fixture', body: 'Notification fixture' });
  const contentHash = await an.hash(content);
  const signature = await an.sign(contentHash, keypair);
  const hash = await an.hash(signature);
  const opened = await an.open(signature);
  const stubs = {
    '/test-apds.js': `export const apds={pubkey:async()=>${JSON.stringify(keypair.slice(0,44))},compose:async()=>${JSON.stringify(hash)},get:async id=>id===${JSON.stringify(hash)}?${JSON.stringify(signature)}:${JSON.stringify(content)},open:async()=>${JSON.stringify(opened)},hash:async()=>${JSON.stringify(hash)}}`,
    '/test-h.js': `export function h(tag,attrs={},children=[]){if(Array.isArray(attrs)){children=attrs;attrs={}}const el=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key==='classList')el.className=value;else el[key]=value}for(const child of children)if(child)el.append(child);return el}`,
    '/render.js': 'export const render={insertByTimestamp:()=>null};',
    '/profile.js': 'export const avatarSpan=async()=>document.createElement("span"),nameSpan=avatarSpan;',
    '/send.js': 'export const send=async message=>{window.sent.push(message)};',
    '/media.js': 'export const createMediaComposer=()=>{const div=document.createElement("div");div.actions=document.createElement("div");return div};',
    '/upload.js': 'export const imgUpload=async()=>{const div=document.createElement("div");div.preview=document.createElement("div");return div};',
    '/markdown.js': 'export const appendMarkdown=(node,body)=>node.textContent=body;',
    '/websocket.js': 'export const confirmMessagesPersisted=async targets=>{window.confirmTargets=targets;return await new Promise(resolve=>window.confirm=resolve)};'
  };
  const server = http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://localhost');
      if(url.pathname==='/') {
        res.setHeader('content-type','text/html');
        res.end(`<link rel="stylesheet" href="/style.css"><script type="importmap">{"imports":{"apds":"/test-apds.js","h":"/test-h.js"}}</script><script type="module">window.sent=[];window.warnings=[];console.warn=(...args)=>window.warnings.push(args.map(String).join(' '));import {composer} from '/composer.js';import {getPublishStatusSnapshot} from '/publish_status.js';window.publishStatus=getPublishStatusSnapshot;document.body.append(await composer());window.ready=true;</script>`);return;
      }
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep))throw Error('bad path');
      res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');
      res.end(stubs[url.pathname]||await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
    for(const scenario of ['confirmed','unconfirmed','missing-content','missing-signature','ntfy-error','push-error']) {
      const context=await browser.newContext();
      const calls=[];
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===origin && url.pathname!=='/push-now')return route.continue();
        if(url.href==='https://pub.wiredove.net/gossip') {
          const key=request.postData();calls.push({kind:'read',key});
          const messages=key===hash?(scenario==='missing-signature'?[]:[signature]):(scenario==='missing-content'?[]:[content]);
          return route.fulfill({json:{messages}});
        }
        if(url.href==='https://ntfy.sh/wiredove'||url.pathname==='/push-now'){
          calls.push({kind:url.pathname==='/push-now'?'push':'ntfy',body:request.postData()});
          return route.fulfill({status:((scenario==='ntfy-error'&&url.hostname==='ntfy.sh')||(scenario==='push-error'&&url.pathname==='/push-now'))?503:200,body:'{}'});
        }
        return route.abort();
      });
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin);await page.waitForFunction(()=>window.ready);
      await page.getByRole('textbox',{name:'Write a message',exact:true}).fill('Notification fixture');
      await page.getByRole('button',{name:'Publish',exact:true}).click();
      await page.waitForFunction(()=>window.confirmTargets);
      assert.deepEqual(calls,[],'No notifications or availability reads before confirmation');
      assert.deepEqual(await page.evaluate(()=>window.sent),[signature,content]);
      const pushResponse = scenario==='confirmed' ? page.waitForResponse(response=>new URL(response.url()).pathname==='/push-now') : null;
      await page.evaluate(ok=>window.confirm({ok,missing:[],attempts:1}),scenario!=='unconfirmed');
      if(scenario==='unconfirmed'||scenario.startsWith('missing-')||scenario.endsWith('-error')) {
        await page.waitForFunction(()=>window.warnings.length>0);
      } else {
        await page.waitForFunction(()=>window.publishStatus().pendingCount===0);
        await pushResponse;
      }
      if(scenario==='confirmed'||scenario.endsWith('-error')) {
        assert.equal(calls.filter(call=>call.kind==='ntfy').length,1);
        assert.equal(calls.find(call=>call.kind==='ntfy').body,'https://wiredove.net/#'+hash);
        assert.equal(calls.filter(call=>call.kind==='push').length,1,'ntfy failure must not suppress browser push');
      } else {
        assert.equal(calls.filter(call=>call.kind!=='read').length,0);
      }
      assert.equal(await page.evaluate(()=>window.publishStatus().lastResult.ok),scenario!=='unconfirmed');
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('Composer notification flow: '+scenario+' passed');
    }
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
