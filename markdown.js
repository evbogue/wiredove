import { h } from 'h'
import { apds } from 'apds'
import { marked } from 'https://esm.sh/gh/evbogue/bog5@de70376265/lib/marked.esm.js'
import { send } from './send.js'

const renderer = new marked.Renderer()

renderer.paragraph = function (paragraph) {
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

renderer.image = function (src, unknown, title) {
  if (src.length === 44) {
    apds.get(src).then(async (img) => {
      if (img) {
        const image = document.getElementById('image'+src)
        image.src = img
      } else {
        await send(src)
      }
    })
    return `<img id="image${src}" />`
  }
}

marked.setOptions({
  renderer: renderer
})

export const markdown = async (txt) => {
  return '<p>' + marked(txt) + '</p>'
}

