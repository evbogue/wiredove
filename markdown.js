import { andfsImageMetadata } from './client/andfs.js'
import { defineWiredoveInlineImage } from './client/ui/inline-image.js'

import { h } from 'h'
import { apds } from 'apds'
import { marked } from 'https://esm.sh/gh/evbogue/bog5@de70376265/lib/marked.esm.js'
import { send } from './send.js'

const renderer = new marked.Renderer()

renderer.paragraph = function (paragraph) {
  const images = paragraph.match(/<img\b[^>]*>|<wiredove-inline-image\b[^>]*><\/wiredove-inline-image>/gi) || []
  if (images.length) {
    const textOnly = paragraph
      .replace(/<img\b[^>]*>|<wiredove-inline-image\b[^>]*><\/wiredove-inline-image>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!textOnly) {
      return `<div class="post-image-row">${images.join('')}</div>`
    }

    const words = textOnly.split(' ')
    for (let i = 0; i < words.length; i += 1) {
      let word = words[i]
      if (!word.startsWith('#')) { continue }
      let end
      if (['.', ',', '?', ':', '!'].some(char => word.endsWith(char))) {
        end = word[word.length - 1]
        word = word.substring(0, word.length - 1)
      }
      let hashtag = "<a href='#?" + word + "'>" + word + "</a>"
      if (end) { hashtag += end }
      words[i] = hashtag
    }

    return '<p>' + words.join(' ') + '</p><div class="post-image-row">' + images.join('') + '</div>'
  }

  const array = paragraph.split(' ')

  for (let i = 0; i < array.length; i++) {
    let word = array[i]
    if (word.startsWith('#')) {
      let end

      if (['.', ',', '?', ':', '!'].some(char => word.endsWith(char))) {
        end = word[word.length - 1]
        word = word.substring(0, word.length - 1)
      }

      let hashtag = "<a href='#?" + word + "'>" + word + "</a>"

      if (end) {
        hashtag = hashtag + end
      }
      array[i] = hashtag
    }
  }

  const newgraph = array.join(' ')

  return '<p>' + newgraph + '</p>'
}

renderer.link = function (href, title, text) {
  if (href.length == 44 && !href.startsWith('http')) {
    href  = '#' + href
    return marked.Renderer.prototype.link.call(this, href, title, text);
  } else {
    const m = marked.Renderer.prototype.link.call(this, href, title, text)
    return m
  }
}

const escapeAttribute = value => String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
renderer.image = function (src, title, text) {
  if (andfsImageMetadata(src)) {
    defineWiredoveInlineImage()
    return `<wiredove-inline-image source="${escapeAttribute(src)}" alt="${escapeAttribute(text)}"></wiredove-inline-image>`
  }
  if (src && src.length === 44) {
    apds.get(src).then(async (img) => {
      if (img) {
        const image = document.getElementById('inlineimage' + src)
        if (image) {
          image.src = img
        }
      } else {
        await send(src)
      }
    })
    const altText = text ? text.replace(/"/g, '&quot;') : 'Post image'
    return `<img class="post-image" data-hash="${src}" id="inlineimage${src}" alt="${altText}" loading="lazy" tabindex="0" />`
  }
}

marked.setOptions({
  renderer: renderer
})

export const markdown = async (txt) => {
  const rendered = marked(txt || '')
  // If markdown splits image-only paragraphs (e.g. due blank lines), merge adjacent rows.
  return rendered.replace(/<\/div>\s*<div class="post-image-row">/g, '')
}
