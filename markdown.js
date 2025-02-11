import { h } from 'h'
import { bogbot } from 'bogbot'
import { marked } from 'https://esm.sh/gh/evbogue/bog5@de70376265/lib/marked.esm.js'

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
    const num = Math.random()
    const m = marked.Renderer.prototype.link.call(this, href, title, text)
    const qr = ` <a class="material-symbols-outlined" onclick="
      console.log(${num})
      const get = document.getElementById(${num})
      get.style = 'display: block; margin-left: auto; margin-right: auto; width: 50%; margin-top: 1em; margin-bottom: 1em;'
      new QRious({
        element: document.getElementById(${num}),
        value: '${href}',
        background: '#f5f5f5',
        foreground: '#444',
        size: 525
      })">Qr_Code</a><canvas style="display: none;" id=${num}></canvas>`
    return m + qr
  }
}

// this does not work
//renderer.image = async function (src, unknown, title) {
//  if (src.length === 44) {
//    const file = await bogbot.find(src)
//    if (file) {
//      const div = document.getElementById(src)
//      div.src = file
//    } 
//    return '<div><img id="' + src + '" title="' + title + '" class="thumb" /></div>'
//  }
//}

marked.setOptions({
  renderer: renderer
})

export const markdown = async (txt) => {
  return '<p>' + marked(txt) + '</p>'
}

