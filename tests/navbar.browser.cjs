// Browser smoke check against a running local server. Uses an isolated identity; never publishes.
const { chromium } = require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true}); const page=await browser.newPage(); page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(8000);
page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
await page.goto(process.env.WIREDOVE_TEST_URL || 'http://localhost:8000'); await page.locator('#navbar').waitFor();
for(const width of [1280,760,390,320]) {
 await page.setViewportSize({width,height:850});
 const box = await page.locator('#navbar').evaluate(el=>({width:el.scrollWidth,client:el.clientWidth,height:el.offsetHeight}));
 if (box.width > box.client || box.height !== 64) throw Error('Navbar overflow at ' + width);
 console.log(width, box);
 if(width===1280) await page.screenshot({path:'/tmp/wiredove-navbar-desktop.png'});
}
console.log('search'); await page.getByRole('button',{name:'Search Wiredove',exact:true}).click();
await page.getByRole('searchbox').fill('hello');
await page.waitForURL('**/#?hello');
await page.keyboard.press('Escape');
console.log('menu'); await page.getByLabel('Wiredove menu',{exact:true}).click();
await page.getByRole('link',{name:'Settings',exact:true}).click();
if(await page.locator('.nav-account').getAttribute('open')!==null) throw Error('Menu did not close');
console.log('compose'); await page.getByRole('button',{name:'Compose',exact:true}).click();
await page.getByRole('dialog').waitFor(); await page.getByRole('button',{name:'Cancel',exact:true}).click();
await page.locator('#publish-state').click(); if(!await page.locator('#publish-desc').isVisible())throw Error('Status missing');
await page.screenshot({path:'/tmp/wiredove-navbar-mobile.png'});
await page.evaluate(async()=>{const {apds}=await import('apds'); await apds.put('keypair', await apds.generate());});
await page.reload(); await page.getByLabel('Account menu',{exact:true}).waitFor();
await page.getByLabel('Account menu',{exact:true}).click(); await page.getByRole('link',{name:'Your profile',exact:true}).waitFor();
await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Compose',exact:true}).click(); await page.locator('.modal-overlay').waitFor();
await page.locator('.modal-overlay').click({position:{x:2,y:2}});
await page.emulateMedia({colorScheme:'dark'}); await page.waitForTimeout(600); await page.screenshot({path:'/tmp/wiredove-navbar-dark.png'});
console.log('Navbar checks passed, including signed-in account and composer');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
