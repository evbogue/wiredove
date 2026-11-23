import { isMessageHash } from '../client/protocol.js'
import { human } from '../client/ui/format.js'
import { parseMessageBody } from '../client/ui/body.js'
import { safeLinkURL } from '../client/ui/image-source.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char])
const nameOf = post => (typeof post.parsed?.name === 'string' && post.parsed.name.trim()) || post.author.slice(0, 12)
const clip = (value, max) => Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, max).join('')

function textFrom(blocks) {
  return blocks.flatMap(block => [
    ...(block.units || []).map(unit => unit.text || ''),
    ...(block.images || []).map(image => image.alt || ''),
    block.code || '',
    ...(block.children ? [textFrom(block.children)] : []),
  ]).join(' ')
}

function markdownHTML(blocks, webID) {
  return blocks.map(block => {
    if (block.images) return block.images.map(image => escape(image.alt)).join(' ')
    if (block.tag === 'hr') return '<hr>'
    if (block.code !== undefined) return '<pre><code>' + escape(block.code) + '</code></pre>'
    const inline = (block.units || []).map(unit => {
      if (unit.br) return '<br>'
      let text = unit.code ? '<code>' + escape(unit.text) + '</code>' : escape(unit.text)
      for (const wrap of [...(unit.parents || [])].reverse()) {
        if (wrap.tag === 'a') {
          const raw = wrap.href || ''
          const ref = raw.replace(/^\/?#/, '')
          const url = isMessageHash(ref) ? '/' + webID(ref) : safeLinkURL(raw)
          if (url && !url.startsWith('#')) text = '<a href="' + escape(url) + '" rel="noreferrer">' + text + '</a>'
        } else {
          text = '<' + wrap.tag + '>' + text + '</' + wrap.tag + '>'
        }
      }
      return text
    }).join('')
    const children = block.children ? markdownHTML(block.children, webID) : ''
    const start = block.tag === 'ol' && Number.isSafeInteger(block.start) ? ' start="' + block.start + '"' : ''
    return '<' + block.tag + start + '>' + inline + children + '</' + block.tag + '>'
  }).join('')
}

function card(post, webID) {
  const author = nameOf(post)
  const initials = Array.from(author).slice(0, 2).join('').toUpperCase()
  const date = new Date(post.timestamp)
  return `<article class="card"><header class="card-header">
    <a class="avatar" href="/${webID(post.author)}" aria-label="${escape(author)}">${escape(initials)}</a>
    <div><a class="author" href="/${webID(post.author)}">${escape(author)}</a>
    <a class="date" href="/${webID(post.id)}"><time datetime="${date.toISOString()}" title="${date.toISOString()}">${human(post.timestamp)}</time></a></div>
  </header><div class="body">${markdownHTML(parseMessageBody(post.parsed.body), webID)}</div></article>`
}

export function renderSharePage({ canonicalOrigin, canonical, returnPath, id, post, profile, parent, items, webID, previewImage }) {
  const name = nameOf(post || profile)
  const title = clip(name, 100) + ' on Wiredove'
  const description = clip(textFrom(parseMessageBody((post || profile).parsed?.body)), 200) || title
  const image = canonicalOrigin + (previewImage?.path || '/dove512x512.png')
  const imageAlt = previewImage?.alt || 'Wiredove'
  const app = '/?enter=shared&back=' + encodeURIComponent(returnPath) + '#' + id
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<link rel="canonical" href="${escape(canonical)}"><link rel="stylesheet" href="/public-share.css">
<meta property="og:type" content="website"><meta property="og:site_name" content="Wiredove">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${image}">
<meta property="og:image:alt" content="${escape(imageAlt)}"><meta name="twitter:card" content="${previewImage ? 'summary_large_image' : 'summary'}">
</head><body>
<header class="bar"><div><img src="/dove_sm.png" width="28" height="28" alt="Wiredove">
<a class="button" href="${escape(app)}">Open in Wiredove</a></div></header>
<main>
${post ? `${parent ? '<section aria-label="Parent message"><h2>Parent message</h2>' + card(parent, webID) + '</section>' : ''}${card(post, webID)}`
      : `<section class="card profile"><h1>${escape(name)}</h1><p class="key">${escape(id)}</p>
      ${typeof profile.parsed.bio === 'string' ? '<div class="body">' + markdownHTML(parseMessageBody(profile.parsed.bio), webID) + '</div>' : ''}
      </section>${items.map(item => card(item, webID)).join('')}`}
</main></body></html>`
}
