const assert=require('node:assert/strict');
module.exports=async({website,embed,source,post})=>{
 for(const page of [website,embed]) {
  const author=await page.evaluate(async()=>{const {apds}=await import('https://esm.sh/gh/evbogue/apds@4934fac/apds.js');return apds.pubkey()});
  await page.evaluate(async author=>{await app.session.publish('',{bio:'Older profile history',links:[{label:'History link',url:'https://example.test/old'}]});await app.navigate(author)},author);
  await page.locator('.profile-header').getByText('Older profile history',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='#673ab7';ctx.fillRect(0,0,320,240);return Array.from(Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),c=>c.charCodeAt(0)))}));
  await page.locator('.profile-photo-editor input[type=file]').setInputFiles({name:'parity-profile.png',mimeType:'image/png',buffer:png});
  const use=page.getByRole('button',{name:'Use photo',exact:true});await use.waitFor();await use.click();
  await page.getByText('Photo ready. Save changes to publish it.',{exact:true}).waitFor();
  await page.getByLabel('Bio (optional)',{exact:true}).fill('');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Edit profile',exact:true}).waitFor();
  const profile=await page.evaluate(async author=>{const {apds}=await import('https://esm.sh/gh/evbogue/apds@4934fac/apds.js');const rows=(await apds.query(author)).slice().sort((a,b)=>Number(b.ts)-Number(a.ts));for(const row of rows){const p=await apds.parseYaml(row.text||'');if(p.image_original&&p.image_crop&&p.bio==='')return p}throw Error('Missing exact signed photo metadata')},author);
  assert(profile.image_original.includes('/#'));assert(profile.image.includes('/#'));
  const actual=await page.evaluate(async url=>{const {readAndFSMedia}=await import(new URL('/client/andfs.js',url));const hash=url.split('#')[1];return [...await readAndFSMedia({andfs:hash,media_source:new URL(url).origin})]},profile.image_original);
  assert.deepEqual(Buffer.from(actual),png,'original photo bytes must be retained');
  await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(author=>app.navigate(author),author);
  await page.locator('.profile-header').getByRole('link',{name:'History link',exact:true}).waitFor();
  assert.equal(await page.locator('.profile-bio').innerText(),'');
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  await page.getByRole('button',{name:'Adjust crop',exact:true}).click();await page.getByRole('button',{name:'Cancel crop',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const previousViewport=page.viewportSize();
  for(const width of [390,1200])for(const colorScheme of ['light','dark']) {
    await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
    await page.evaluate(()=>{app.root.scrollTop=0;const scroller=app.root.querySelector('#scroller');if(scroller)scroller.scrollTop=0});
    assert(await page.locator('.wiredove-application').evaluate(element=>element.scrollWidth<=element.clientWidth+1));
    await page.screenshot({path:'test-results/application-profile-'+(page===website?'website':'embed')+'-'+width+'-'+colorScheme+'.png',fullPage:true,animations:'disabled'});
  }
  await page.setViewportSize(previousViewport);await page.emulateMedia({colorScheme:'light'});
  const backupValid=await page.evaluate(async source=>{
    const {apds}=await import('https://esm.sh/gh/evbogue/apds@4934fac/apds.js');
    const {validateIdentityBackup}=await import(source+'/dist/app-v1/identity_backup.js');
    const key=await apds.keypair();return await validateIdentityBackup(key)===key;
  },source);assert.equal(backupValid,true);
  await page.evaluate(()=>app.navigate('settings'));await page.getByRole('button',{name:'Download identity backup',exact:true}).waitFor();
  // Check only presence; no secret backup is downloaded, logged or captured.
  await page.getByRole('button',{name:'Refresh selected archive',exact:true}).click();
 }
 await website.evaluate(id=>app.navigate(id),post.id);
 const original=post.content;
 await website.locator('[id="'+post.id+'"]').getByText('Edit',{exact:true}).first().click();
 await website.getByPlaceholder('Write a message').fill('Shared parity edited original');
 await website.getByRole('button',{name:'Save changes',exact:true}).click();await website.getByRole('dialog').waitFor({state:'hidden'});
 for(const page of [website,embed]) {
  await page.evaluate(async id=>{await app.session.refresh();await app.navigate(id)},post.id);
  const article=page.locator('[id="'+post.id+'"]');await article.getByText('Shared parity edited original',{exact:true}).waitFor();
  await article.getByText('Chevron_Left',{exact:true}).first().click();
  await article.getByText('Real local two-author acceptance post',{exact:true}).waitFor();
  await article.getByText('Chevron_Right',{exact:true}).first().click();await article.getByText('Shared parity edited original',{exact:true}).waitFor();
  await article.getByTitle('Hide message',{exact:true}).first().click();
  await article.getByText('Hidden by local moderation',{exact:true}).waitFor();
  await article.getByRole('button',{name:'Unhide',exact:true}).click();await article.getByText('Shared parity edited original',{exact:true}).waitFor();
 }
 const rows=(await(await fetch(source+'/api/application')).json()).records;
 assert.equal(rows.find(row=>row.id===post.id).content,original);
 console.log('Both mounts: signed profile/photo/empty bio/history links/re-crop/reload/settings, compatible edits/version history and local hide/unhide passed.');
};
