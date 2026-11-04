const assert = require('node:assert/strict');
module.exports = async ({website, embed, source, photo}) => {
  // The reported post's exact shape: name + historical image URL, empty body.
  // Disposable local signatures only; neither production nor public relay writes.
  const fixtures = [
    {name:'Muse',image:source+'/media/'+photo.andfs},
    {name:'Muse',image:'/#'+'B'.repeat(43)},
    {bio:''},
    {links:[{label:'Profile example',url:'https://example.test'}]},
    {links:[]},
  ];
  const {default:nacl}=await import('../vendor/anproto/lib/nacl-fast-es.js');
  nacl.setPRNG(bytes=>require('node:crypto').randomFillSync(bytes));
  const {an}=await import('../vendor/anproto/an.js');
  const {yaml}=await import('../vendor/apds/yaml.js');
  const keypair=await an.gen();
  const records = [];
  for (const meta of fixtures) {
    const content=await yaml.create(meta,'');
    const signature=await an.sign(await an.hash(content),keypair);
    const record={id:await an.hash(signature),signature,content};
    const response=await fetch(source+'/api/application',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(record)});
    assert.equal(response.ok,true);
    records.push(record);
  }
  const before=(await(await fetch(source+'/api/application')).json()).records;
  for(const record of records)Object.assign(record,before.find(row=>row.id===record.id));
  for (const page of [website,embed]) {
    await page.evaluate(()=>app.session.refresh());
    for (const [index,record] of records.entries()) {
      await page.evaluate(id=>app.navigate(id),record.id);
      const article=page.locator('[id="'+record.id+'"]');
      await article.getByText('Updated profile',{exact:true}).waitFor();
      assert.equal(await article.locator('.content.material-symbols-outlined').count(),0);
      if(index<2) {
        await article.getByText('Display name: Muse',{exact:true}).waitFor();
        assert.equal(await article.locator('.message-header .avatarlink').textContent(),'Muse');
        if(index===0) {
          await article.locator('.profile-update img').waitFor();
          await page.waitForFunction(id=>{
            const article=app.root.querySelector('[id="'+id+'"]');
            const img=article?.querySelector('.profile-update img');
            const avatar=article?.querySelector('img.avatar');
            return img?.complete&&img.naturalWidth>0&&img.src.startsWith('data:')&&avatar?.src.startsWith('data:');
          },record.id);
        } else await article.getByText('Image hasn’t arrived',{exact:true}).waitFor();
        for(const colorScheme of ['light','dark']) {
          await page.setViewportSize({width:390,height:920});await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
          await page.evaluate(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';app.root.append(style)});
          assert.equal(await page.locator('.wiredove-application').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
          await page.screenshot({path:`test-results/profile-update-${page===website?'website':'embed'}-${index}-${colorScheme}.png`,fullPage:true,animations:'disabled'});
        }
      }
      if(index===2)await article.getByText('Bio cleared',{exact:true}).waitFor();
      if(index===3)await article.getByRole('link',{name:'Profile example',exact:true}).waitFor();
      if(index===4)await article.getByText('Profile links cleared',{exact:true}).waitFor();
    }
  }
  const archive=(await(await fetch(source+'/api/application')).json()).records;
  for(const record of records) {
    const saved=archive.find(row=>row.id===record.id);
    assert.ok(saved);
    assert.equal(saved.content,record.content);
    assert.equal(saved.signature,record.signature);
    assert.equal(saved.content.trimEnd().endsWith('---'),true,'empty signed body must remain empty');
  }
  console.log('Both mounts: empty-body name/photo, missing photo, empty bio and links-only profile updates passed');
};
