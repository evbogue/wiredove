// Structural application mount acceptance. Offline APDS/session fixtures; this
// does not claim the real signed two-author publication flow is complete.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 let source;
 const serve=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/host'){
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{background:#ebdfc9;margin:18px;font:18px serif}button{background:magenta!important;font:32px fantasy!important}section{border:40px solid red!important}nav{position:fixed!important}#mounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px}h1{font:24px serif}
</style><h1>Separate-origin host</h1><button id="host-button">Host control</button><div id="mounts"><div id="one"></div><div id="two"></div></div><script type="module">
window.releases=0;window.hostStyle=document.body.style.cssText;
window.api=await import('${source}/app-embed.js');window.imported=true;
window.mount=async id=>api.mountWiredove(document.getElementById(id),{session:{runExclusive:fn=>fn(),release:async()=>{releases++}}});
window.run=async()=>{window.apps=await Promise.all(['one','two'].map(mount));window.ready=true};
</script>`);return;
   }
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep))throw Error('bad path');
   res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.png')?'image/png':'text/javascript');
   res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end()}
 };
 const sourceServer=http.createServer(serve),hostServer=http.createServer(serve);
 await Promise.all([sourceServer,hostServer].map(s=>new Promise(r=>s.listen(0,'127.0.0.1',r))));
 source=`http://127.0.0.1:${sourceServer.address().port}`;
 const host=`http://127.0.0.1:${hostServer.address().port}`;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const width of [1200,390,320])for(const colorScheme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:920},colorScheme});
   await context.addInitScript(()=>{
    window.storageOpens=0;const open=indexedDB.open.bind(indexedDB);
    indexedDB.open=(...args)=>{storageOpens++;return open(...args)};
   });
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.href==='https://esm.sh/gh/evbogue/apds@4934fac/apds.js')return route.fulfill({contentType:'text/javascript',body:`export const apds={pubkey:async()=>null,keypair:async()=>null,query:async()=>[],get:async key=>key==='name'?'Offline fixture':null,visual:async()=>document.createElement('img'),parseYaml:async()=>({}),human:async()=>''};`});
    if(url.href==='https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js')return route.fulfill({contentType:'text/javascript',body:`export function h(tag,attrs={},children=[]){if(Array.isArray(attrs)){children=attrs;attrs={}}const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='classList')n.className=v;else n[k]=v}for(const child of children)if(child)n.append(child);return n}`});
    // Fonts are read-only assets; all other remote requests are blocked.
    if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();
    return route.abort();
   });
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host+'/host#host-route');
   await page.waitForFunction(()=>window.imported);
   assert.equal(await page.evaluate(()=>storageOpens),0);
   assert.equal(await page.locator('iframe').count(),0);
   assert.equal(await page.locator('script[type="importmap"]').count(),0);
   await page.evaluate(()=>run());
   await page.waitForFunction(()=>window.ready);
   const app=page.locator('#one'),other=page.locator('#two');
   await app.getByRole('searchbox').fill('local-search');
   assert.equal(await page.evaluate(()=>apps[1].navigation.get()),'');
   assert.equal(await page.evaluate(()=>location.hash),'#host-route');
   assert.equal(await app.locator('.wiredove-application').evaluate(n=>getComputedStyle(n).fontSize),'16px');
   assert.equal(await app.locator('.wiredove-application').evaluate(n=>getComputedStyle(n).borderTopWidth),'0px');
   assert.equal(await app.locator('.wiredove-application').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   await app.getByRole('button',{name:'Create or import identity'}).click();
   assert.equal(await app.getByRole('dialog').count(),1);
   assert.equal(await other.getByRole('dialog').count(),0);
   assert.equal(await page.locator('body > dialog').count(),0);
   await page.keyboard.press('Escape');
   await app.getByRole('dialog').waitFor({state:'detached'});
   if(width===1200 && colorScheme==='light'){
    await page.evaluate(async source=>{
      const {createProfileEditor}=await import(source+'/dist/app-v1/client/ui/profile-editor.js');
      const editor=createProfileEditor({});apps[0].root.append(editor.photo,editor.fields);
    },source);
    await app.locator('input[type=file]').setInputFiles({name:'crop-fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0vQAAAAASUVORK5CYII=','base64')});
    await app.getByRole('dialog',{name:'Frame your photo'}).waitFor();
    assert.equal(await page.locator('body > dialog').count(),0);
    await app.getByRole('button',{name:'Cancel crop'}).click();
   }
   await page.evaluate(async source=>{
    const {composer}=await import(source+'/dist/app-v1/composer.js');
    apps[0].root.append(await composer(null,{application:apps[0]}));
   },source);
   await app.getByRole('dialog').waitFor();
   const composerIcons = await app.locator('.composer-icon .material-symbols-outlined').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily));
   assert.ok(composerIcons.length > 0);
   assert.ok(composerIcons.every(family => family.split(',')[0].trim() === '"Wiredove Symbols"'));
   assert.equal(await page.evaluate(() => [...document.fonts].some(face => face.family.replaceAll('"', '') === 'Wiredove Symbols' && face.status === 'loaded')), true);
   await page.waitForTimeout(50);
   assert.equal(await page.locator('#host-button').evaluate(n=>n.inert),false);
   await page.locator('#host-button').click();
   assert.equal(await page.evaluate(()=>document.body.style.cssText===hostStyle),true);
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});
   await page.screenshot({path:path.join(root,`test-results/application-shadow-composer-${width}-${colorScheme}.png`),fullPage:true});
   await app.locator('textarea').first().focus();
   await page.keyboard.press('Escape');
   await page.evaluate(async source=>{
    const {openImageGallery}=await import(source+'/dist/app-v1/client/ui/image-popover.js');
    const owner=document.createElement('span');apps[0].root.append(owner);
    window.stopViewer=openImageGallery({owner,images:[{src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0vQAAAAASUVORK5CYII=',alt:'Local image'}],index:0});
   },source);
   assert.equal(await app.getByRole('dialog',{name:'Image viewer'}).count(),1);
   assert.equal(await page.locator('body > dialog').count(),0);
   await page.evaluate(()=>stopViewer());
   // Disable animations inside each shadow root before visual inspection.
   await page.evaluate(()=>{for(const a of apps){const s=document.createElement('style');s.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';a.root.getRootNode().append(s)}});
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});
   await page.screenshot({path:path.join(root,`test-results/application-shadow-${width}-${colorScheme}.png`),fullPage:true});
   await page.evaluate(async()=>{const old=apps[0];await old.destroy();apps[0]=await mount('one');await old.destroy()});
   assert.equal(await page.evaluate(()=>releases),1);
   assert.equal(await app.getByRole('navigation').count(),1);
   assert.equal(await page.evaluate(()=>location.hash),'#host-route');
   assert.equal(await page.evaluate(()=>storageOpens),0);
   assert.deepEqual(errors,[]);
   console.log(`Separate-origin application shadow mount: ${width}px ${colorScheme}, inert imports, host isolation, dialogs, disposal/remount passed`);
   await context.close();
  }
 }finally{await browser?.close();await Promise.all([sourceServer,hostServer].map(s=>new Promise(r=>s.close(r))))}
})().catch(e=>{console.error(e);process.exitCode=1});
