import { bogbot } from 'bogbot'
import { h } from 'h'
import { gossip } from './gossip.js'

export const render = {}

render.blob = async (blob) => {
  const hash = await bogbot.hash(blob)

  const div = await document.getElementById(hash)

  try {
    const opened = await bogbot.open(blob)
    if (opened) {
      await bogbot.add(blob)
    }
    const ts = h('span', [await bogbot.human(opened.substring(0, 13))])
    setInterval(async () => {
      ts.textContent = await bogbot.human(opened.substring(0, 13))
    }, 1000)
    if (div && !div.firstChild) {
      const img = await bogbot.visual(blob.substring(0, 44))
      img.id = 'image'
      img.style = 'width: 30px; height: 30px; float: left; margin-right: 5px; object-fit: cover;'
      const name = h('a', {href: '#' + blob.substring(0, 44), id: 'name'}, [blob.substring(0, 10)])
      const permalink = h('a', {href: '#' + blob}, [' [Link] '])
      const hashlink = h('a', {href: '#' + hash}, [ts])
      const right = h('span', {style: 'float: right;'}, [
        hashlink,
        ' ',
        permalink
      ])
      div.appendChild(img)
      div.appendChild(name)
      div.appendChild(right)      
      const contentDiv = h('div', {id: opened.substring(13)}, ['\n'])
      div.appendChild(contentDiv)
      const content = await bogbot.find(opened.substring(13))
      if (content) {
        await render.blob(content)
      } else {
        await gossip(opened.substring(13))
      }
    } else {
      //console.log('Div is not in view')
    }
  } catch (err) {
    //console.log('Not a valid protocol message')
    const yaml = await bogbot.parseYaml(blob)
    if (div) {
      div.textContent = yaml.body
      div.parentNode.childNodes.forEach(async (node) => {
        if (yaml.name && node.id === 'name') {
          node.textContent = yaml.name
        }
        if (yaml.image && node.id === 'image') {
          const image = await bogbot.find(yaml.image)
          if (!image) { gossip(yaml.image)}
          node.src = image
        }
        if (yaml.previous) {
          console.log(yaml.previous)
          const check = await bogbot.find(yaml.previous)
          if (!check) { console.log('GOSSIPING' + yaml.previous); gossip(yaml.previous) }
        }
      })
    }
  }
}

render.hash = async (hash, scroller) => {
  const makeSure = document.getElementById(hash)
  if (!makeSure) {
    const div = h('div', {id: hash}) 
    scroller.insertBefore(div, scroller.firstChild)
    const sig = await bogbot.find(hash)

    if (sig) {
      await render.blob(sig)
    } else {
      await gossip(hash)
    }
  }
}
