// Guard the public widget graph and thin website adapters against regrowth.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const visited=new Set();
async function walk(url) {
  if(visited.has(url.href))return;visited.add(url.href);
  const source=await readFile(url,'utf8');
  assert(!/\bfrom\s*['"](?:apds|h)['"]/.test(source),url.pathname+' requires a website import map');
  assert(!/serviceWorker\.register|startWebsiteApplication\(/.test(source),url.pathname+' boots the website');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)) {
    if(match[1].startsWith('.'))await walk(new URL(match[1],url));
    // Pinned AndFS offers a lazily invoked diskStore for server consumers.
    else if(match[1].startsWith('node:') && url.pathname.endsWith('/vendor/andfs/stores.js')) continue;
    else assert(match[1].startsWith('https://'), 'Unexpected public widget dependency '+match[1]);
  }
}
for(const entry of ['client/ui/message.js','client/ui/profile-header.js','client/ui/settings.js','client/ui/message-controls.js','client/ui/composer-surface.js'])await walk(new URL('../'+entry,import.meta.url));
for(const [adapter,widget] of [['profile_header.js','profile-header.js'],['settings.js','settings.js']]) {
 const source=await readFile(new URL('../'+adapter,import.meta.url),'utf8');
 assert(source.includes("'./client/ui/"+widget+"'"),adapter+' must delegate to its shared widget');
 assert(!/\bh\s*\(|\.createElement\s*\(|\.querySelector/.test(source),adapter+' duplicates shared DOM rendering');
}
console.log('Public widget graphs are inert; website profile/settings adapters remain thin.');
