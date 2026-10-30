// Run with Playwright available: node tests/profile-cache-upgrade.cjs http://127.0.0.1:8000
const {chromium}=require('playwright');
const http=require('node:http');
(async()=>{
  let upgraded=false;
  const upstream=process.argv[2] || 'http://127.0.0.1:8000';
  const server=http.createServer(async(req,res)=>{
    try {
      const response=await fetch(upstream+req.url);
      let body=Buffer.from(await response.arrayBuffer());
      if(req.url==='/') body=Buffer.from(body.toString().replace("<script type='module' src='app.js'></script>",''));
      if(req.url==='/sw.js') {if(!upgraded)body=Buffer.from(body.toString().replace('v15-shared-message-view','v9-andfs-images'));res.setHeader('Cache-Control','no-store');}
      if(req.url==='/client/ui/profile-editor.js'&&!upgraded)body=Buffer.from('// previous profile editor fixture');
      res.statusCode=response.status;
      if(response.headers.get('content-type'))res.setHeader('Content-Type',response.headers.get('content-type'));
      res.end(body);
    }catch(error){res.statusCode=500;res.end(error.message);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext();await context.routeWebSocket('**',socket=>socket.close());
    await context.route('**/*',route=>{const r=route.request(),h=new URL(r.url()).hostname;return !['127.0.0.1','localhost'].includes(h)&&r.method()!=='GET'?route.abort():route.continue();});
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const publicKey=await page.evaluate(async()=>{
      const {apds}=await import('apds');await apds.start('warm-profile-upgrade-test');await apds.put('keypair',await apds.generate());
      await apds.put('profile_photo',{image:'persisted-photo-reference',original:'persisted-original-reference',crop:{version:1}});
      localStorage.setItem('warm-profile-upgrade','keep');
      await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
      return await apds.pubkey();
    });
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const old=await page.evaluate(async()=>await(await fetch('/client/ui/profile-editor.js')).text());
    if(!old.includes('previous profile editor fixture'))throw Error('Old module was not primed');
    await page.waitForFunction(async()=>{const cache=await caches.open('wiredove-app-shell-v9-andfs-images');return !!(await cache.match('/client/ui/profile-editor.js'));});
    upgraded=true;
    await page.evaluate(async()=>await(await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async()=>{const keys=await caches.keys();return keys.includes('wiredove-app-shell-v15-shared-message-view')&&!keys.includes('wiredove-app-shell-v9-andfs-images');});
    await page.reload();
    const after=await page.evaluate(async()=>{
      const {apds}=await import('apds');await apds.start('warm-profile-upgrade-test');
      return {key:await apds.pubkey(),photo:await apds.get('profile_photo'),marker:localStorage.getItem('warm-profile-upgrade'),code:await(await fetch('/client/ui/profile-editor.js')).text()};
    });
    if(after.key!==publicKey||after.photo.image!=='persisted-photo-reference'||after.marker!=='keep'||!after.code.includes('createPhotoCropper'))throw Error('Warm upgrade lost identity/photo data or retained old code');
    console.log('PASS: warm service-worker upgrade replaces the old profile module and retains identity, profile photo state and local storage.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
