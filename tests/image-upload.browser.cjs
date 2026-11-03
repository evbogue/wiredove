// Local-only shared upload/editor/preview acceptance; all media writes are mocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {createAndFS}=await import('../vendor/andfs/andfs.js');
 const {memoryStore}=await import('../vendor/andfs/stores.js');
 const store=memoryStore(),files=createAndFS({store});
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0vQAAAAASUVORK5CYII=','base64');
 const {manifestHash}=await files.add(new Blob([bytes],{type:'image/png'}));
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/'){
    const prefix=url.searchParams.has('dist')?'/dist/app-v1':'';
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module">
import {createImageUpload} from '${prefix}/client/ui/image-upload.js';
import {createComposerSurface} from '${prefix}/client/ui/composer-surface.js';
import {appendFormattedText} from '${prefix}/client/ui/body.js';
const surface=createComposerSurface({onClose:()=>{},onPreview:target=>{target.replaceChildren();appendFormattedText(target,surface.textarea.value)}});
const face=new FontFace('Wiredove Symbols','url(/vendor/material-symbols/outlined-v382.ttf)');document.fonts.add(face);await face.load();
window.changes=0;window.fail=false;window.hold=false;window.disposeUpload=()=>upload.destroy();
const upload=createImageUpload(surface.textarea,{onBusy:value=>surface.publish.disabled=value,onChange:()=>{changes++;localStorage.setItem('draft',surface.textarea.value)},persistMedia:async()=>{if(hold)await new Promise(resolve=>window.releaseUpload=resolve);if(fail)throw Error('Upload rejected');return {media_url:location.origin+'/#${manifestHash}'}}});
surface.tools.append(upload);document.body.append(surface.root);
const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.append(style);
window.ready=true;
</script>`);return;
   }
   if(url.pathname.startsWith('/blobs/')){
    const block=await store.get(decodeURIComponent(url.pathname.slice(7)));
    res.writeHead(block?200:404,{'content-type':'application/octet-stream'});res.end(block?Buffer.from(block):'');return;
   }
   const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
   res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/javascript');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
  for(const distribution of ['source','dist']) for(const colorScheme of ['light','dark']){
   const context=await browser.newContext({viewport:{width:390,height:844},colorScheme});
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+(distribution==='dist'?'/?dist':''));await page.waitForFunction(()=>ready);
   const editor=page.getByRole('textbox'),input=page.locator('input[type=file]');
   const fixture={name:'photo.png',mimeType:'image/png',buffer:bytes};
   await editor.fill('Photo draft');await page.evaluate(()=>hold=true);
   await input.setInputFiles(fixture);await page.waitForFunction(()=>typeof releaseUpload==='function');
   assert.equal(await editor.inputValue(),'Photo draft');assert.ok(await page.getByRole('button',{name:'Publish',exact:true}).isDisabled());
   await page.evaluate(()=>{hold=false;releaseUpload()});await page.waitForFunction(()=>changes===1);
   const reference=`![](${origin}/#${manifestHash})`;
   assert.equal(await editor.inputValue(),'Photo draft\n'+reference);
   assert.equal(await page.locator('.composer-attachments img,.composer-image-card,[popover]').count(),0);
   await input.setInputFiles(fixture);await page.waitForFunction(()=>changes===2);
   assert.equal(await editor.inputValue(),'Photo draft\n'+reference+'\n'+reference);
   await page.getByRole('button',{name:'Preview',exact:true}).click();
   await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.composer-preview img')];return images.length===2&&images.every(img=>img.complete&&img.naturalWidth>0)});
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});
   await page.screenshot({path:path.join(root,`test-results/image-upload-preview-${distribution}-${colorScheme}.png`)});
   await page.getByRole('button',{name:'Back to editing'}).click();
   await editor.fill('Photo draft\n'+reference);
   await page.evaluate(()=>fail=true);await input.setInputFiles(fixture);await page.getByRole('status').filter({hasText:'Upload rejected'}).waitFor();
   assert.equal(await editor.inputValue(),'Photo draft\n'+reference);
   await page.evaluate(()=>fail=false);await input.setInputFiles(fixture);await page.waitForFunction(()=>changes===3);
   await editor.fill('Photo draft');await page.getByRole('button',{name:'Preview',exact:true}).click();
   assert.equal(await page.locator('.composer-preview img').count(),0);
   await page.getByRole('button',{name:'Back to editing'}).click();
   let count=3;
   const choose=async()=>{
    const chooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Upload image',exact:true}).click();
    await (await chooser).setFiles(fixture);
   };
   const complete=async()=>{
    await page.waitForFunction(expected=>changes===expected,++count);
    assert.equal(await page.evaluate(()=>localStorage.getItem('draft')),await editor.inputValue());
   };
   const select=async(start,end=start)=>editor.evaluate((node,range)=>{node.focus();node.setSelectionRange(...range)},[start,end]);
   for(const [body,position,expected] of [
    ['',0,reference],
    ['After',0,reference+'\nAfter'],
    ['BeforeAfter',6,'Before\n'+reference+'\nAfter'],
    ['Before\nAfter',7,'Before\n'+reference+'\nAfter'],
    ['Before\n\nAfter',7,'Before\n'+reference+'\nAfter'],
    ['Before',6,'Before\n'+reference]
   ]){
    await editor.fill(body);await select(position);await choose();await complete();
    assert.equal(await editor.inputValue(),expected);
   }
   // A selection never loses authored prose when inserting an image.
   await editor.fill('Keep these words');await select(5,10);await choose();await complete();
   assert.equal(await editor.inputValue(),'Keep \n'+reference+'\nthese words');
   await page.getByRole('button',{name:'Preview',exact:true}).click();
   await page.waitForFunction(()=>{const img=document.querySelector('.composer-preview img');return img?.complete&&img.naturalWidth>0});
   await page.screenshot({path:path.join(root,`test-results/image-upload-cursor-${distribution}-${colorScheme}.png`)});
   await page.getByRole('button',{name:'Back to editing'}).click();
   const held=async(body,position)=>{
    await editor.fill(body);await select(position);
    await page.evaluate(()=>{hold=true;delete window.releaseUpload});
    await choose();await page.waitForFunction(()=>typeof releaseUpload==='function');
   };
   const release=async()=>{await page.evaluate(()=>{hold=false;releaseUpload()});await complete()};
   await held('BeforeAfter',6);
   // Typing before the pending image moves its anchor; typing after it doesn't.
   await select(0);await editor.pressSequentially('New ');
   await select((await editor.inputValue()).length);await editor.pressSequentially(' tail');
   await release();assert.equal(await editor.inputValue(),'New Before\n'+reference+'\nAfter tail');
   assert.equal(await editor.evaluate(node=>node.selectionStart),(await editor.inputValue()).length);
   // Moving the caret while waiting must not relocate the image.
   await held('BeforeAfter',6);await select(0);await release();
   assert.equal(await editor.inputValue(),'Before\n'+reference+'\nAfter');
   assert.equal(await editor.evaluate(node=>node.selectionStart),0);
   // Removing text across the insertion point keeps the surviving draft intact.
   await held('BeforeAfter',6);await select(3,9);await editor.press('Backspace');await release();
   assert.equal(await editor.inputValue(),'Bef\n'+reference+'\ner');
   // Repeated characters need real beforeinput bounds rather than an ambiguous diff.
   await held('aaaa',2);await select(0);await editor.pressSequentially('a');await release();
   assert.equal(await editor.inputValue(),'aaa\n'+reference+'\naa');
   // Replacing selected text while uploading also remaps the insertion anchor.
   await held('BeforeAfter',6);await select(0,6);await editor.pressSequentially('Intro');await release();
   assert.equal(await editor.inputValue(),'Intro\n'+reference+'\nAfter');
   // Picker cancel leaves text unchanged and the next click captures a fresh caret.
   await editor.fill('BeforeAfter');await select(6);
   await page.getByRole('button',{name:'Upload image',exact:true}).click();
   await input.dispatchEvent('cancel');assert.equal(await editor.inputValue(),'BeforeAfter');
   assert.equal(await page.evaluate(()=>changes),count);
   await select(0);await choose();await complete();assert.equal(await editor.inputValue(),reference+'\nBeforeAfter');
   await editor.fill('BeforeAfter');await select(6);await page.evaluate(()=>fail=true);await choose();
   await page.getByRole('status').filter({hasText:'Upload rejected'}).waitFor();
   assert.equal(await editor.inputValue(),'BeforeAfter');
   assert.equal(await page.evaluate(()=>changes),count);
   await page.evaluate(()=>fail=false);await choose();await complete();
   assert.equal(await editor.inputValue(),'Before\n'+reference+'\nAfter');
   // Closing a composer while bytes are in flight cannot mutate its saved draft.
   await held('Closed draft',6);await page.evaluate(()=>disposeUpload());
   await page.evaluate(()=>{hold=false;releaseUpload()});
   await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
   assert.equal(await editor.inputValue(),'Closed draft');
   assert.equal(await page.evaluate(()=>changes),count);
   assert.deepEqual(errors,[]);await context.close();
   console.log(`Image upload ${distribution}/${colorScheme}: cursor placement, live edits, selection, cancel/disposal, draft saving, verified preview and failure/retry passed`);
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
