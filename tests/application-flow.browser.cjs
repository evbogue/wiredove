// Real pinned APDS, real ANProto signatures, durable IndexedDB and real local
// archive/media endpoints. No injected publication callback or generated posts.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
 const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'wiredove-flow-'));
 const server = spawn('deno',['run','--cached-only','--allow-net=127.0.0.1','--allow-read','--allow-write','tests/application-flow-server.js',temporary],{cwd:root,stdio:['ignore','pipe','inherit']});
 let browser, host;
 try {
  const port = await new Promise((resolve,reject)=>{server.stdout.once('data',data=>resolve(Number(String(data).trim())));server.once('exit',code=>reject(Error('Local backend exited '+code)))});
  const source = 'http://127.0.0.1:'+port; console.log('Local flow backend ready');
  host = http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><h1>Plain host</h1><button id="host-control">Host control</button><div id="wiredove"></div><script type="module">import {mountWiredove} from '${source}/app-embed.js';window.app=await mountWiredove(document.querySelector('#wiredove'));window.ready=true;</script>`)});
  await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
  const hostURL = 'http://127.0.0.1:'+host.address().port;
  const cache = new Map();
  const dependency = async url => {
   const match = url.match(/^https:\/\/esm.sh\/gh\/evbogue\/apds@(4934fac|78abedd)\/(.+)$/);
   if(!match) return null;
   if(!cache.has(url)) {
    const response = await fetch(`https://raw.githubusercontent.com/evbogue/apds/${match[1]}/${match[2]}`);
    if(!response.ok) throw Error('Pinned APDS fixture unavailable: '+response.status);
    cache.set(url,await response.text());
   }
   return cache.get(url);
  };
  browser=await chromium.launch({headless:true});
  const contexts = await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1200,height:950}})));
  const errors=[];
  for(const context of contexts) await context.route('**/*',async route=>{
    const url=route.request().url();
    if(url.startsWith(source+'/')||url.startsWith(hostURL+'/'))return route.continue();
    if (/^https:\/\/cdn.jsdelivr.net\/npm\/idb@8(?:\.0\.3)?\/\+esm$/.test(url)) {
      if(!cache.has(url)) cache.set(url,await (await fetch(url)).text());
      return route.fulfill({contentType:'text/javascript',body:cache.get(url)});
    }
    const raw=await dependency(url);
    if(raw!==null)return route.fulfill({contentType:'text/javascript',body:raw});
    if(url==='https://esm.sh/gh/evbogue/anproto@ddc040c/an.js')return route.fulfill({contentType:'text/javascript',body:`export {an} from '${source}/vendor/anproto/an.js'`});
    if(['fonts.googleapis.com','fonts.gstatic.com'].includes(new URL(url).hostname))return route.continue();
    return route.abort();
  });
  const [website,embed]=await Promise.all(contexts.map(c=>c.newPage()));
  for(const page of [website,embed]) {page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message)});page.on('requestfailed',r=>console.log('Request failed:',r.url(),r.failure()));}
  await Promise.all([website.goto(source+'/website'),embed.goto(hostURL+'/#host-route')]);
  await Promise.all([website,embed].map(p=>p.waitForFunction(()=>window.ready).catch(async error=>{console.log('Unready page',p.url(),await p.evaluate(()=>({html:document.body.innerHTML.slice(0,1500),shadow:document.querySelector('main,#wiredove')?.shadowRoot?.innerHTML.slice(0,1000)})));throw error}))); console.log('Both real application mounts ready');
  const createIdentity=async(page,name)=>{
    await page.getByRole('button',{name:'Create or import identity',exact:true}).click();
    await page.getByPlaceholder('How should people know you?').fill(name);
    await page.getByRole('button',{name:'Create identity',exact:true}).click();
    await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();
    await page.getByLabel('Bio (optional)',{exact:true}).fill(name+' bio');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Save changes',exact:true}).waitFor({state:'hidden',timeout:5000}).catch(async error=>{console.log('Profile state:',await page.locator('.profile-header').innerText());throw error});
    await page.reload();await page.waitForFunction(()=>window.ready);
    await page.getByRole('link',{name:'Your profile',exact:true}).click();
    await page.locator('.profile-header').getByText(name+' bio',{exact:true}).waitFor();
  };
  console.log('Creating real identities');
  await createIdentity(website,'Local Website Acceptance');
  await createIdentity(embed,'Local Embed Acceptance');
  assert.equal(await embed.evaluate(()=>location.hash),'#host-route');
  assert.equal(await embed.locator('iframe').count(),0);
  const publish=async(page,body,attachment)=>{
    await page.getByRole('button',{name:'Compose',exact:true}).click();
    await page.getByPlaceholder('Write a message').fill(body);
    if(attachment) {
      await page.locator('.media-composer input[type=file]').setInputFiles(attachment);
      await page.getByText('Attachment ready',{exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'Publish',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
  };
  const wav=Buffer.alloc(44+16000*8);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  await publish(website,'Real local two-author acceptance post',{name:'acceptance.wav',mimeType:'audio/wav',buffer:wav});
  let records=(await (await fetch(source+'/api/application')).json()).records;
  const post=records.find(r=>r.content.includes('Real local two-author acceptance post'));
  assert.ok(post);
  await embed.evaluate(async id=>{await app.session.refresh();await app.navigate(id)},post.id);
  await embed.getByText('Real local two-author acceptance post',{exact:true}).waitFor();
  await embed.locator('audio').first().waitFor();
  assert.equal(await embed.locator('audio').count(),1);
  await embed.locator('audio').first().evaluate(async audio=>{window.acceptancePlayer=audio;await audio.play()});
  await embed.getByRole('button',{name:'Reply',exact:true}).click();
  await embed.getByPlaceholder('Write a message').fill('Real local second-author reply');
  await embed.getByPlaceholder('Write a message').evaluate(n=>window.acceptanceInput=n);
  await embed.evaluate(()=>app.session.refresh());
  assert.equal(await embed.getByPlaceholder('Write a message').evaluate(n=>n===window.acceptanceInput&&n.getRootNode().activeElement===n),true);
  assert.equal(await embed.locator('audio').first().evaluate(n=>n===window.acceptancePlayer&&!n.paused),true);
  await embed.getByRole('button',{name:'Reply',exact:true}).last().click();
  await embed.getByRole('dialog').waitFor({state:'hidden'});
  await website.evaluate(async id=>{await app.session.refresh();await app.navigate(id)},post.id);
  await website.getByText('Real local second-author reply',{exact:true}).waitFor();
  await embed.reload();await embed.waitForFunction(()=>window.ready);
  await embed.evaluate(id=>app.navigate(id),post.id);
  await embed.getByText('Real local second-author reply',{exact:true}).waitFor();
  records=(await (await fetch(source+'/api/application')).json()).records;
  const reply=records.find(r=>r.content.includes('Real local second-author reply'));
  assert.notEqual(reply.signature.slice(0,44),post.signature.slice(0,44));
  assert.ok(reply.content.includes(post.id));
  // Reload restores the open draft, target and attachment metadata.
  await embed.getByRole('button',{name:'Reply',exact:true}).first().click();
  await embed.getByPlaceholder('Write a message').fill('Durable acceptance draft');
  await embed.reload();await embed.waitForFunction(()=>window.ready);
  assert.equal(await embed.getByPlaceholder('Write a message').inputValue(),'Durable acceptance draft');
  await embed.getByText('Replying to',{exact:false}).waitFor();
  await embed.getByRole('button',{name:'Close composer'}).click();
  // Delivery interruption keeps exactly one signed artifact; reload + retry
  // delivers that same ID without signing a duplicate.
  await embed.route(source+'/api/application',route=>route.request().method()==='POST'?route.fulfill({status:503,body:'offline'}):route.continue());
  await embed.getByRole('button',{name:'Compose',exact:true}).click();
  await embed.getByPlaceholder('Write a message').fill('Exact pending acceptance post');
  await embed.getByRole('button',{name:'Publish',exact:true}).click();
  await embed.getByText('Saved locally. Delivery is pending; use Retry pending publication in the navigation bar.',{exact:true}).waitFor();
  const pending=await embed.evaluate(()=>app.session.artifacts.pending());
  assert.equal(pending.length,1);
  await embed.reload();await embed.waitForFunction(()=>window.ready);
  await embed.unroute(source+'/api/application');
  const confirmation = embed.waitForResponse(r=>r.url()===source+'/api/application'&&r.request().method()==='POST'&&r.status()===200);
  await embed.getByRole('button',{name:'Retry pending publication',exact:true}).click();
  await confirmation;
  await embed.getByText('Delivery confirmed',{exact:true}).waitFor();
  assert.equal((await embed.evaluate(()=>app.session.artifacts.pending())).length,0);
  records=(await (await fetch(source+'/api/application')).json()).records;
  assert.equal(records.filter(r=>r.id===pending[0].id).length,1,JSON.stringify({ids:records.map(r=>r.id),pending:pending[0].id}));
  assert.equal(records.find(r=>r.id===pending[0].id).signature,pending[0].signature);
  // Both mounts use the same live query boundary. A cached empty search must
  // gain matching archive arrivals, while unrelated posts remain excluded.
  for (const page of [website,embed]) await page.evaluate(()=>app.navigate('?Shared query acceptance'));
  await website.evaluate(async()=>{
    for(let i=0;i<28;i++) await app.session.publish('Shared query acceptance '+String(i).padStart(2,'0'));
    await app.session.publish('Unrelated feed acceptance');
  });
  for (const page of [website,embed]) {
    await page.evaluate(()=>app.session.refresh());
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get())?.entries.length===28);
    assert.equal(await page.evaluate(()=>app.feeds.getFeed(app.navigation.get()).entries.some(row=>!row.hash)),false);
    await page.getByRole('button',{name:'Refresh feed',exact:true}).click();
    // The navbar icon awaits the same router refresh; joining it settles when the click's refresh completes.
    await page.evaluate(()=>app.router.refreshFeed());
    await page.evaluate(()=>app.navigate(''));
    await page.evaluate(()=>app.navigate('?Shared query acceptance'));
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get())?.entries.length===28);
    // A fresh search snapshot uses the same 25-row pagination in both mounts.
    await page.evaluate(()=>app.navigate('?Shared query acceptance '));
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get())?.entries.length===28);
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get())?.rendered.size===25);
    for(let i=0;i<8;i++) {
      await page.locator('.wiredove-application').evaluate(n=>{n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event('scroll'))});
      if(await page.evaluate(()=>app.feeds.getFeed(app.navigation.get()).rendered.size===28)) break;
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get()).rendered.size===28);
    assert.equal(await page.locator('.route-panel').getByText('Unrelated feed acceptance',{exact:true}).count(),0);
  }
  // A late snapshot from an abandoned route cannot contaminate its successor.
  for (const page of [website,embed]) {
    await page.evaluate(()=>{
      const original=app.queries.query.bind(app.queries);
      window.releaseQuery=null; window.queryDelayed=false;
      app.queries.query=async(route,options)=>{
        const rows=await original(route,options);
        if(route.includes('Shared')&&!window.queryDelayed){
          window.queryDelayed=true;
          await new Promise(resolve=>{window.releaseQuery=resolve});
        }
        return rows;
      };
      window.restoreQuery=()=>{app.queries.query=original};
      app.queries.changed();
    });
    await page.waitForFunction(()=>typeof window.releaseQuery==='function');
    await page.evaluate(()=>app.navigate('?Unrelated feed acceptance'));
    await page.evaluate(()=>{window.releaseQuery();window.restoreQuery()});
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get())?.entries.length===1);
    await page.getByText('Unrelated feed acceptance',{exact:true}).waitFor();
    assert.equal(await page.locator('.route-panel').getByText('Shared query acceptance 00',{exact:true}).count(),0);
    await page.evaluate(()=>app.navigate('?Shared query acceptance '));
    await page.waitForFunction(()=>app.feeds.getFeed(app.navigation.get())?.entries.length===28);
  }
  // A failed refresh is visible and retryable, without removing verified rows.
  await embed.route(source+'/api/application*',route=>route.fulfill({status:503,body:'offline'}));
  await embed.getByRole('button',{name:'Refresh feed',exact:true}).click();
  await embed.getByText('Backend unavailable. Local content remains available; retry refresh.',{exact:true}).waitFor();
  assert.equal(await embed.evaluate(()=>app.feeds.getFeed(app.navigation.get()).entries.length),28);
  await embed.unroute(source+'/api/application*');
  await embed.getByRole('button',{name:'Refresh feed',exact:true}).click();
  await embed.evaluate(()=>app.router.refreshFeed());
  for (const page of [website,embed]) {
    await page.setViewportSize({width:320,height:920});await page.emulateMedia({colorScheme:'light'});
    await page.evaluate(()=>{app.root.scrollTop=0;const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';app.root.getRootNode().append(style)});
    assert.equal(await page.locator('.wiredove-application').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    assert.equal(await page.locator('.material-symbols-outlined').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).fontFamily.includes('Wiredove Symbols'))),true);
    await page.screenshot({path:path.join(root,`test-results/application-query-${page===website?'website':'embed'}-320-light.png`),fullPage:true});
    await page.setViewportSize({width:1200,height:950});
  }
  console.log('Both mounts: live/cached search, 28-row pagination, unrelated exclusion and offline refresh/retry passed');
  for(const page of [website,embed]) {
    await page.evaluate(id=>app.navigate(id),post.id);
    await page.evaluate(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';app.root.getRootNode().append(style)});
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(root,'test-results/application-flow-'+(page===website?'website':'embed')+'.png'),fullPage:true});
  }
  for(const width of [390,320]) for(const colorScheme of ['light','dark']) for(const page of [website,embed]) {
    await page.setViewportSize({width,height:920});await page.emulateMedia({colorScheme});
    assert.equal(await page.locator('.wiredove-application').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    await page.screenshot({path:path.join(root,`test-results/application-flow-${page===website?'website':'embed'}-${width}-${colorScheme}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('Real website ↔ separate-origin embed: identity/profile, signed post, second-author thread/reply, reload, durable draft and exact outbox retry passed');
 } finally {
  await browser?.close();if(host)await new Promise(resolve=>host.close(resolve));server.kill();await fs.rm(temporary,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
