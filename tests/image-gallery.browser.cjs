// NODE_PATH=<playwright installation> CHROMIUM_EXECUTABLE=<optional path> node tests/image-gallery.browser.cjs
// Actual website render.content + actual embed widgets, isolated fixtures, no publishing.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
let origin;
const deps = {
  '/test-apds.js': `export const apds = {get: async hash => window.fixtureBlobs?.[hash] ?? (window.sourceResolver ? window.sourceResolver(hash) : hash.startsWith('a') ? ${JSON.stringify(png)} : null), pubkey: async()=>'a'.repeat(44), visual:async()=>{const img=document.createElement('img');img.src=${JSON.stringify(png)};return img}, query: async hash=>window.fixtureQueries?.[hash]||window.editFixtures||[], human:async()=> 'now', parseYaml:async text=>JSON.parse(text)};`,
  '/test-h.js': `export function h(tag, attrs={}, children=[]) {const el=document.createElement(tag); for(const [key,value] of Object.entries(attrs)) { if(key==='classList')el.className=value;else el[key]=value;} for(const child of children)if(child)el.append(child); return el;}`,
  '/send.js': 'export const send = async()=>{};',
  '/composer.js': 'export const composer = async()=>{};',
  '/sync.js': 'export const noteSeen = ()=>{};',
  '/identify.js': 'export const promptKeypair = ()=>{};',
  '/moderation.js': 'export const addBlockedAuthor=()=>{},addHiddenHash=()=>{},addMutedAuthor=()=>{},isBlockedAuthor=async()=>false,removeHiddenHash=()=>{},removeMutedAuthor=()=>{},shouldHideMessage=async()=>false;',
  '/lazy_vendor.js': 'export const ensureHighlight=async()=>({highlightElement(){}}),ensureQRious=async()=>{};',
  '/reply_index.js': 'export const addReplyToIndex=()=>{},ensureReplyIndex=async()=>{},getReplyCount=()=>0,getRepliesForParent=()=>[];',
  '/feed_row_cache.js': 'export const makeFeedRow=()=>{},upsertFeedRow=()=>{},parseOpenedTimestamp=()=>0;',
  '/perf.js': 'export const perfStart=()=>{},perfEnd=()=>{};',
  '/media.js': 'export const renderMedia=async()=>false;',
};
function harness(embed=false) { return `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${origin}/style.css"><style>body{margin:12px;font:16px system-ui;background:var(--wiredove-page)}#fixture{max-width:660px;margin:auto}.message{margin:0}.message-main{padding:0}</style><script type="importmap">{"imports":{"apds":"${origin}/test-apds.js","h":"${origin}/test-h.js"}}</script><div id="fixture"></div><script type="module">
import {render} from '${origin}/render.js';
import {defineWiredoveMessage} from '${origin}/client/ui/message.js';
import {defineWiredoveThread} from '${origin}/client/ui/thread.js';
import {createImagePopover} from '${origin}/client/ui/image-popover.js';
defineWiredoveMessage();defineWiredoveThread();
window.mount=async(text,meta={})=>{ const fixture=document.getElementById('fixture');fixture.replaceChildren();if(${embed}){const message=document.createElement('wiredove-message');message.presentation={resolveImage:async hash=>window.sourceResolver?window.sourceResolver(hash):hash.startsWith('a')?${JSON.stringify(png)}:null};message.post={author:'a'.repeat(44),timestamp:Date.now(),parsed:{body:text,...meta}};fixture.append(message);window.bodyNode=message.shadowRoot.querySelector('.content');}else{const content=document.createElement('div');fixture.append(content);await render.content('fixture','',content,null,{body:text,...meta});window.bodyNode=content;}};
window.edit=async text=>{window.editFixtures=[{hash:'edit-id',author:'author',ts:2,text:JSON.stringify({edit:'fixture-message',body:text})}];render.registerMessage('fixture-message',{author:'author',baseYaml:{body:'Original body'},contentHash:'fixture',contentDiv:window.bodyNode});render.invalidateEdits('fixture-message');await render.refreshEdits('fixture-message',{forceLatest:true});};
window.mountShell=async(kind='post')=>{
  const fixture=document.getElementById('fixture');fixture.replaceChildren();
  window.editFixtures=[];window.fixtureBlobs={};window.fixtureQueries={};
  const author='a'.repeat(44), id='shell-message', contentHash='c'.repeat(43)+'=', parent='p'.repeat(43)+'=';
  const parsed={name:'Shell Author',body:'Full shell **body**',...(kind==='reply'?{reply:parent}:{}),...(kind==='edit'?{edit:parent,body:'Changed body'}:{})};
  window.shellReplyCount=0;
  if(${embed}){
    const message=document.createElement('wiredove-message');
    message.onReply=()=>window.shellReplyCount++;
    message.onNavigate=event=>window.shellNavigation=event;
    message.post={id,author,timestamp:Date.now(),parsed};fixture.append(message);
  }else{
    const parentContent='d'.repeat(43)+'=';
    window.fixtureBlobs[parent]=author+'parent-signature';
    window.fixtureBlobs[parentContent]=JSON.stringify({name:'Parent Author',body:'Parent body'});
    window.fixtureQueries[parent]=[{opened:'1793290000000'+parentContent}];
    const wrapper=document.createElement('div');wrapper.id=id;wrapper.className='message-wrapper';
    const shell=document.createElement('div');shell.className='message-shell';wrapper.append(shell);fixture.append(wrapper);
    await render.meta(author+'fixture-signature','1793290000000'+contentHash,id,shell,{contentBlob:JSON.stringify(parsed),yaml:parsed});
  }
};
window.ready=true;</script>`; }
const requests=[];
const serve = async(req,res) => {
  const url = new URL(req.url,'http://localhost');
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    if (url.pathname==='/' || url.pathname==='/site' || url.pathname==='/embed') {res.setHeader('Content-Type','text/html');res.end(harness(url.pathname==='/embed'));return;}
    if (url.pathname==='/parent') {res.setHeader('Content-Type','text/html');res.end(`<!doctype html><iframe title="Separate origin embed" width="320" height="900" src="${origin}/embed"></iframe>`);return;}
    if (url.pathname.startsWith('/image/')) {
      requests.push(url.pathname);
      if(url.pathname.includes('broken')){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type','image/svg+xml');
      const id = url.pathname.split('/').at(-1).split('.')[0];
      const width = id==='portrait'?500:1200, height=id==='portrait'?1000:800;
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${Number(id)*37||240},38%,40%)"/><circle cx="80%" cy="30%" r="140" fill="#ffffff22"/><text x="50%" y="55%" fill="white" font-family="sans-serif" font-size="110" text-anchor="middle">${id}</text></svg>`);return;
    }
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.js')?'text/javascript':'text/html');
    res.end(deps[url.pathname] || await fs.readFile(file));
  } catch(e){res.writeHead(404);res.end(e.message);}
};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
(async()=>{
  const server=http.createServer(serve), parent=http.createServer(serve);await listen(server);await listen(parent);origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']});
  const image=n=>`![Image ${n}](${origin}/image/${n}.svg)`;
  const run=n=>Array.from({length:n},(_,i)=>image(i+1)).join('\n\n');
  try {
    for(const mobile of [false,true])for(const theme of ['light','dark']) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1200,height:900},isMobile:mobile,hasTouch:mobile,colorScheme:theme});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      for(const surface of ['site','embed']) {
        await page.goto(origin+'/'+surface);await page.waitForFunction(()=>window.ready);
        for(const count of [1,2,3,4,5,10,30]) {
          await page.evaluate(text=>mount(text),run(count));
          const gallery=page.locator('wiredove-image-gallery');
          await gallery.waitFor();assert.equal(await gallery.count(),1);
          assert.equal(await gallery.locator('.image-gallery-tile').count(),count);
          await page.evaluate(()=>Promise.all([...bodyNode.querySelectorAll('wiredove-image-gallery')].flatMap(g=>[...g.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.addEventListener('load',r,{once:true});img.addEventListener('error',r,{once:true});})))));
          for(const width of [240,320,660]) {
            await page.locator('#fixture').evaluate((el,width)=>el.style.width=width+'px',width);
            // Let container queries and percentage image sizes settle after resizing.
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            const size=await gallery.boundingBox();assert.ok(size.width<=width+1);assert.ok(size.height>50&&size.height<5000,JSON.stringify({count,width,size}));
            const cells=await gallery.locator('.image-gallery-cell').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,radius:getComputedStyle(el).borderRadius};}));
            for(const cell of cells){assert.ok(Math.abs(cell.width-cell.height)<1);assert.ok(cell.width<=(count===1?220:140));assert.equal(cell.radius,'12px');}
            if(count>4)assert.ok(cells.at(-1).top>cells[0].top);
            assert.equal(await gallery.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,JSON.stringify({surface,count,width,detail:await gallery.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,html:el.outerHTML,display:getComputedStyle(el).display}))}));
          }
          await page.locator('#fixture').evaluate(el=>el.style.width='');
          const tile=gallery.locator('.image-gallery-tile').nth(Math.min(count,4)-1);
          if(mobile)await tile.tap();else await tile.click();
          const dialog=page.getByRole('dialog',{name:'Image viewer'});await dialog.waitFor();
          assert.equal(await dialog.locator('.image-popover-counter').textContent(),`${Math.min(count,4)} of ${count}`);
          while((await dialog.locator('.image-popover-counter').textContent())!==`${count} of ${count}`)await dialog.getByRole('button',{name:'Next image',exact:true}).click();
          assert.equal(await dialog.getByRole('button',{name:'Next image',exact:true}).isDisabled(),true);
          // Full image tap/click closes, without triggering the original post again.
          await dialog.locator('img').waitFor({state:'visible'});
          if(mobile)await dialog.locator('img').tap();else await dialog.locator('img').click();
          await dialog.waitFor({state:'hidden'});
          assert.equal(await tile.evaluate(el=>el.getRootNode().activeElement===el),true);
        }
        // Full website render.meta shell and the actual embed element, not just body rendering.
        for(const kind of ['post','reply','edit']) {
          await page.evaluate(kind=>mountShell(kind),kind);
          const main=page.locator('.message-main').first();
          await main.waitFor();
          assert.equal(await main.locator(':scope > a > img.avatar').count(),1);
          assert.equal(await main.locator(':scope > .message-stack').count(),1);
          assert.ok((await main.locator('.avatarlink').first().textContent()).includes('Shell Author'));
          const order=await main.evaluate(el=>[...el.children].map(child=>child.className||child.tagName));
          assert.deepEqual(order,['A','message-stack']);
          if(kind!=='edit') assert.equal(await page.locator('[data-wiredove-message]').count(),1,'Website and embed must mount the canonical message component');
          assert.equal(await page.locator('.message-meta').count(),1);
          const metaBounds=await page.locator('.message-meta').boundingBox();
          const mainBounds=await main.boundingBox();
          assert.ok(metaBounds.y+metaBounds.height<=mainBounds.y+1,'Metadata overlaps author/body');
          if(surface==='site' && kind==='edit') {
            assert.equal(await main.locator('.edit-summary-verb').textContent(),'edited');
            assert.equal(await main.locator('.edit-summary-link').getAttribute('href'),'#'+'p'.repeat(43)+'=');
          } else {
            assert.equal(await main.locator('.message-body').count(),1);
            assert.ok((await main.locator('.message-body').textContent()).includes(kind==='edit'?'Changed body':'Full shell body'));
          }
          if(surface==='site') {
            const raw=page.locator('.message-meta a').filter({hasText:/^Code$/});
            await raw.click();assert.ok((await page.locator('.message-raw').textContent()).includes('fixture-signature'));
            await raw.click();assert.equal(await page.locator('.message-raw').textContent(),'');
            if(kind!=='edit') {
              assert.equal(await main.locator('.message-actions-edit a').filter({hasText:'Edit'}).count(),1);
              assert.equal(await main.locator('.message-actions-reply a').count(),1);
              if(kind==='reply')await main.locator('.reply-preview-author').filter({hasText:'Parent Author'}).waitFor();
            }
          } else {
            await main.getByRole('button',{name:'Reply to this post'}).click();
            assert.equal(await page.evaluate(()=>window.shellReplyCount),1);
            await main.locator('.avatarlink').click();
            assert.equal(await page.evaluate(()=>window.shellNavigation.type),'profile');
          }
          const bounds=await main.boundingBox();
          assert.ok(bounds.width<= (mobile?390:1200));
          assert.equal(await main.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
          await page.screenshot({path:`/tmp/message-shell-${surface}-${mobile?'mobile':'desktop'}-${theme}-${kind}.png`,animations:'disabled'});
        }
        // Inline order, repeated sources, containers, captions and literal code.
        await page.evaluate(text=>mount(text),`Before **bold ${image(1)} after** ${image(2)} end\n\nCaption\n\n${image(3)}\n\n- ${image(4)}\n- ${image(4)}\n\n> ${image(5)}\n\n\`${image(6)}\`\n\n\`\`\`md\n${image(7)}\n\`\`\``);
        const order=await page.evaluate(()=>[...bodyNode.children].filter(el=>!el.classList.contains('message-actions')).map(el=>el.tagName==='WIREDOVE-IMAGE-GALLERY'?'gallery:'+el.items[0].alt:el.tagName+':'+el.textContent.trim()));
        assert.ok(order[0].includes('Before bold'));assert.equal(order[1],'gallery:Image 1');assert.ok(order[2].includes('after'));assert.equal(order[3],'gallery:Image 2');
        assert.equal(await page.locator('li wiredove-image-gallery').count(),2);
        assert.equal(await page.locator('blockquote wiredove-image-gallery').count(),1);
        assert.equal(await page.locator('pre wiredove-image-gallery, code wiredove-image-gallery').count(),0);
        await page.evaluate(()=>mount('A #river tag and a [message]('+ 'a'.repeat(43) + '=)'));
        assert.equal(await page.locator('a').filter({hasText:'#river'}).getAttribute('href'),'#?#river');
        // Linked image viewer retains action; navigation does not close; dialog focus stays inside.
        await page.evaluate(text=>mount(text),`[${image(1)}](https://example.com/original)\n\n${image(2)}`);
        await page.locator('.image-gallery-tile').first().click();
        const dialog=page.getByRole('dialog',{name:'Image viewer'});
        assert.equal(await dialog.getByRole('link',{name:'Original link',exact:true}).getAttribute('href'),'https://example.com/original');
        await page.keyboard.press('ArrowRight');assert.equal(await dialog.locator('.image-popover-counter').textContent(),'2 of 2');
        for(let i=0;i<10;i++)await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
        await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
        if (mobile) {
          await page.evaluate(text=>mount(text), run(3));
          await page.locator('.image-gallery-tile').first().tap();
          await dialog.locator('img').waitFor({state:'visible'});
          const bounds=await dialog.locator('img').boundingBox();
          const session=await context.newCDPSession(page);
          const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
          await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+60,y}]});
          await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y}]});
          await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          assert.equal(await dialog.locator('.image-popover-counter').textContent(),'2 of 3');
          assert.equal(await dialog.isVisible(),true);
          await session.detach();
          await dialog.getByRole('button',{name:'Close image',exact:true}).tap();
        }
        // Bad source and late legacy resolution never affect another occurrence.
        await page.evaluate(text=>mount(text),`![Bad](${origin}/image/broken.svg)\n\n![Legacy](${'a'.repeat(43)}=)\n\n![Duplicate](${'a'.repeat(43)}=)`);
        await page.locator('.image-gallery-retry').first().waitFor({state:'visible'});
        await page.waitForFunction(()=>[...bodyNode.querySelectorAll('img')].filter(el=>el.src.startsWith('data:')).length===2);
        await page.locator('.image-gallery-tile').nth(1).click();await page.evaluate(()=>mount('Replaced message'));await dialog.waitFor({state:'hidden'});
        await page.evaluate(text=>{
          window.sourceResolver=()=>new Promise(resolve=>{window.finishSource=resolve;});
          return mount(text);
        },`![Slow](${'b'.repeat(43)}=)`);
        await page.waitForFunction(()=>typeof window.finishSource==='function');
        await page.evaluate(async text=>{await mount(text);window.finishSource('data:image/png;base64,invalid');delete window.sourceResolver;delete window.finishSource;},image(1));
        await page.waitForFunction(()=>bodyNode.querySelector('img')?.complete&&bodyNode.querySelector('img').naturalWidth>0);
        assert.match(await page.locator('.image-gallery-tile img').getAttribute('src'),/image\/1.svg/);
        if(surface==='site') {
          await page.evaluate(text=>edit(text),'Edited before '+image(1)+' edited middle '+image(2)+' edited after');
          assert.equal(await page.locator('wiredove-image-gallery').count(),2);
          assert.ok(await page.evaluate(()=>bodyNode.textContent.includes('edited middle')));
        } else {
          await page.evaluate(text=>{
            const fixture=document.getElementById('fixture');fixture.replaceChildren();
            const thread=document.createElement('wiredove-thread');
            const post={author:'a'.repeat(44),parsed:{body:text}};
            thread.post=post;thread.replies=[post,post];fixture.append(thread);
          }, run(4));
          assert.equal(await page.locator('.reply wiredove-image-gallery').count(),2);
          assert.equal(await page.locator('.image-gallery-tile').count(),12);
          await page.locator('.reply .image-gallery-tile').first().click();
          await dialog.getByRole('button',{name:'Close image',exact:true}).click();
        }
        // Typed AndFS images join the shared presentation without duplicating authored occurrences.
        await page.evaluate(({text,source})=>mount(text,{type:'image',andfs:'manifest',media_url:source}),{text:image(1)+' '+image(1),source:origin+'/image/1.svg'});
        assert.equal(await page.locator('wiredove-image-gallery').count(),1);
        assert.equal(await page.locator('.image-gallery-tile').count(),2);
        // Unsafe sources/HTML stay inert.
        await page.evaluate(text=>mount(text),'<img src=x onerror="window.compromised=true">\n\n![Bad](javascript:alert(1))');
        assert.equal(await page.evaluate(()=>Boolean(window.compromised)),false);
        assert.equal(await page.locator('img[src^="javascript:"]').count(),0);
        // Capture actual module output for visual review.
        await page.evaluate(text=>mount(text),'A few moments from the river.\n\n'+run(10)+'\n\nA closer look.\n\n'+image('portrait'));
        await page.waitForFunction(()=>[...bodyNode.querySelectorAll('wiredove-image-gallery img')].every(img=>img.complete&&img.naturalWidth>0));
        await page.evaluate(async()=>{
          const article=document.querySelector('wiredove-message')?.shadowRoot.querySelector('article');
          if(article)await Promise.all(article.getAnimations({subtree:true}).map(animation=>animation.finished));
        });
        await page.screenshot({path:`/tmp/gallery-${surface}-${mobile?'mobile':'desktop'}-${theme}.png`,fullPage:true});
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`Website + embed: ${mobile?'mobile':'desktop'} ${theme} passed`);
    }
    // Real queue events drive both placeholders and the open viewer, without networking.
    const statusPage=await browser.newPage({viewport:{width:390,height:844}});
    await statusPage.goto(origin+'/site');await statusPage.waitForFunction(()=>window.ready);
    await statusPage.evaluate(async()=>{
      const queue=await import('/network_queue.js');
      const {createImageGallery}=await import('/client/ui/image-gallery.js');
      const hash='z'.repeat(43)+'=';
      window.statusQueue=queue; window.statusHash=hash;
      window.imageArrived=false;
      // The adapter must return a safe absolute URL.
      const adapter=async(hash,{retry}={})=>{if(window.imageArrived)return location.origin+'/image/1.svg';queue.queueSend(hash,{retry});return null;};
      adapter.subscribe=queue.subscribeHashRequest;
      document.getElementById('fixture').append(createImageGallery({images:[{src:hash,alt:'Pending photo'}],resolveImage:adapter}));
      queue.queueSend(hash);
    });
    await statusPage.getByText('Waiting to request image…',{exact:true}).waitFor();
    assert.equal(await statusPage.locator('.image-gallery-retry').isVisible(),false);
    await statusPage.screenshot({path:'/tmp/gallery-sync-queued.png'});
    await statusPage.evaluate(()=>statusQueue.registerNetworkSenders({hasWs:()=>true,sendWs:()=>{}}));
    await statusPage.locator('.image-gallery-status').filter({hasText:'Asking peers for image…'}).waitFor();
    await statusPage.locator('.image-gallery-tile').click();
    await statusPage.locator('.image-popover-status').filter({hasText:'Asking peers for image…'}).waitFor();
    assert.equal(await statusPage.locator('.image-gallery-retry, .image-popover-stage button').count(),2);
    assert.equal(await statusPage.locator('.image-popover-stage button').isVisible(),false);
    await statusPage.getByRole('button',{name:'Close image',exact:true}).click();
    await statusPage.screenshot({path:'/tmp/gallery-sync-requested.png'});
    await statusPage.locator('.image-gallery-status').filter({hasText:'Image hasn’t arrived'}).waitFor({timeout:20000});
    assert.equal(await statusPage.locator('.image-gallery-retry').isVisible(),true);
    await statusPage.screenshot({path:'/tmp/gallery-sync-idle.png'});
    await statusPage.locator('.image-gallery-retry').click();
    await statusPage.locator('.image-gallery-status').filter({hasText:'Asking peers for image…'}).waitFor();
    await statusPage.evaluate(()=>{window.imageArrived=true;statusQueue.completeHashRequest(statusHash)});
    await statusPage.waitForFunction(()=>document.querySelector('.image-gallery-tile img').naturalWidth>0);
    assert.equal(await statusPage.locator('.image-gallery-retry').isVisible(),false);
    await statusPage.evaluate(()=>statusQueue.clearQueue());await statusPage.close();
    console.log('Real queue: queued/requested/timeout/retry/arrival, thumbnail and viewer passed');
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${parent.address().port}/parent`);const frame=page.frames().find(f=>f.url().startsWith(origin+'/embed'));await frame.waitForFunction(()=>window.ready);await frame.evaluate(()=>mountShell('reply'));await frame.getByRole('button',{name:'Reply to this post'}).click();assert.equal(await frame.evaluate(()=>window.shellReplyCount),1);assert.equal(await frame.locator('.message-main > .message-stack > .message-body').count(),1);await frame.evaluate(text=>mount(text),run(10));await frame.locator('.image-gallery-tile').nth(3).click();assert.equal(await frame.locator('.image-popover-counter').textContent(),'4 of 10');await frame.getByRole('button',{name:'Next image',exact:true}).click();assert.equal(await frame.locator('.image-popover-counter').textContent(),'5 of 10');await frame.getByRole('button',{name:'Close image',exact:true}).click();
    console.log('Observed separate-origin iframe: shared gallery + viewer passed');await page.close();
    const cacheContext=await browser.newContext();const cachePage=await cacheContext.newPage();
    await cachePage.goto(origin+'/site');await cachePage.waitForFunction(()=>window.ready);
    await cachePage.evaluate(async()=>{
      localStorage.setItem('identity-sentinel','preserve-me');
      const old=await caches.open('wiredove-app-shell-v8-image-popover-close');
      await old.put('/client/ui/body.js',new Response('throw Error("Old cached renderer")',{headers:{'content-type':'text/javascript'}}));
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    });
    await cachePage.reload();await cachePage.waitForFunction(()=>window.ready);
    await cachePage.evaluate(text=>mount(text),run(10));
    assert.equal(await cachePage.locator('.image-gallery-tile').count(),10);
    assert.equal(await cachePage.evaluate(()=>localStorage.getItem('identity-sentinel')),'preserve-me');
    const cacheKeys=await cachePage.evaluate(()=>caches.keys());
    assert.ok(cacheKeys.includes('wiredove-app-shell-v15-shared-message-view'));assert.ok(!cacheKeys.some(key=>key.includes('v8-')));
    console.log('Warm service-worker cache upgrade preserves storage and renders new gallery');await cacheContext.close();
  } finally {await browser.close();server.close();parent.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
