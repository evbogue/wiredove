// Emit the real application graph with explicit browser dependency URLs. This is
// a generated distribution, never a second editable renderer.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'dist/app-v1')
const imports = {
  apds: 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js',
  h: 'https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js',
}
const seen = new Set(), manifest = {}
await rm(out, { recursive: true, force: true })
async function emit(path) {
  path = resolve(path)
  if (!path.startsWith(root + '/')) throw Error('Dependency escapes repository')
  if (seen.has(path)) return
  seen.add(path)
  const name = relative(root,path), bytes = await readFile(path)
  let source = bytes
  if (/\.(?:js|css)$/.test(path)) {
    source = bytes.toString()
    if (path.endsWith('.js')) {
      source = source.replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])(apds|h)\2/g,
        (_,prefix,quote,key)=>prefix+quote+imports[key]+quote)
      const specifiers = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)].map(m=>m[1])
      for (const dep of specifiers) {
        if (!dep.startsWith('.') && !dep.startsWith('https://') && !dep.startsWith('node:')) throw Error('Unresolved browser import: '+dep)
        if (dep.startsWith('.')) await emit(resolve(dirname(path),dep))
      }
      for (const match of source.matchAll(/new URL\(['"]([^'"]+)['"],\s*import\.meta\.url\)/g)) {
        if (match[1].startsWith('.')) await emit(resolve(dirname(path),match[1]))
      }
    } else {
      for (const match of source.matchAll(/(?:url\(\s*|@import\s*)['"]([^'"]+)['"]/g)) {
        if (match[1].startsWith('.')) await emit(resolve(dirname(path),match[1]))
      }
    }
  }
  await mkdir(dirname(resolve(out,name)),{recursive:true})
  await writeFile(resolve(out,name),source)
  manifest[name] = createHash('sha256').update(source).digest('hex')
}
await emit(resolve(root,'client/app-embed.js'))
const entry = `export { mountWiredove, createNavigation } from './client/app-embed.js'\n`
await writeFile(resolve(out,'app-embed.js'), entry)
manifest['app-embed.js'] = createHash('sha256').update(entry).digest('hex')
await emit(resolve(root,'client/application.css'))
for (const license of ['vendor/andfs/LICENSE','vendor/cropperjs/LICENSE','vendor/marked/LICENSE.md','vendor/simple-icons/LICENSE.md']) await emit(resolve(root,license))
if ([...seen].some(path=>['app.js','client/runtime/website-application.js'].includes(relative(root,path)))) throw Error('Website bootstrap leaked into embed')
await writeFile(resolve(out,'manifest.json'),JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()),null,2)+'\n')
console.log(`Built ${seen.size} application files in dist/app-v1`)
