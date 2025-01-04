import { bogbot } from 'bogbot'
import { h } from 'h'
import { gossip } from './gossip.js'
import { composer } from './composer.js'

export const render = {}

render.blob = async (blob) => {
  const hash = await bogbot.hash(blob)

  const opened = await bogbot.open(blob)
  if (opened) {
    const ts = h('span', [await bogbot.human(opened.substring(0, 13))])
    setInterval(async () => {
      ts.textContent = await bogbot.human(opened.substring(0, 13))
    }, 1000)
    const div = await document.getElementById(hash)
    if (div && !div.firstChild) {
      const img = await bogbot.visual(blob.substring(0, 44))
      img.id = 'image'
      img.classList = 'avatar'
      const contentDiv = h('div', {id: opened.substring(13), style: 'margin-left: 58px;'}, ['\n'])
      const name = h('a', {href: '#' + blob.substring(0, 44), id: 'name', classList: 'avatarlink', title: blob.substring(0, 44)}, [blob.substring(0, 10)])
      const permalink = h('a', {href: '#' + blob, classList: 'material-symbols-outlined', style: 'float: right;'}, ['Share'])
      const hashlink = h('a', {href: '#' + hash, classList: 'unstyled'}, [ts])
      const right = h('span', {style: 'float: right;'}, [
        h('span', {classList: 'pubkey'}, [blob.substring(0, 10)]),
        ' ',
        hashlink
      ])
      const reply = h('a', {
        classList: 'material-symbols-outlined', 
        onclick: async () => { 
          messageDiv.parentNode.appendChild(await composer(opened))
        }
      }, ['Chat_Bubble'])

      const controlsDiv = h('div', {style: 'margin-top: 5px; margin-left: 58px;'}, [
        permalink,
        reply
      ])
      const messageDiv = h('div', {
          onclick: () => { window.location.hash = hash},
          classList: 'message'
        }, [
        right,
        img,
        name,
        contentDiv,
        controlsDiv
      ])
      const content = await bogbot.get(opened.substring(13))
      if (content) {
        await render.blob(content)
      } else {
        await gossip(opened.substring(13))
      }

      const src = document.location.hash.substring(1)

      if (src === '' || src === hash || src === blob.substring(0, 44) || src === blob) {
        div.appendChild(messageDiv)
      } 
    } 
  } else {
    setTimeout(async () => {
      const yaml = await bogbot.parseYaml(blob)
      const div = await document.getElementById(hash)
      if (div) {
        div.textContent = yaml.body
        div.parentNode.childNodes.forEach(async (node) => {
          if (yaml.name && node.id === 'name') {
            node.textContent = yaml.name
          }
          if (yaml.image && node.id === 'image') {
            const image = await bogbot.get(yaml.image)
            if (!image) { gossip(yaml.image)}
            node.src = image
          }
          if (yaml.previous) {
            console.log(yaml.previous)
            const check = await bogbot.get(yaml.previous)
            if (!check) { 
              console.log('GOSSIPING' + yaml.previous)
              gossip(yaml.previous)
              //div.parentNode.after(h('div', {id: yaml.previous})) 
            }
          }
        })
      }
    }, 50)
  } 
}

render.hash = async (hash, scroller) => {
  if (!await document.getElementById(hash)) {
    const div = h('div', {id: hash}) 
    scroller.insertBefore(div, scroller.firstChild)
    const sig = await bogbot.get(hash)

    if (sig) {
      await render.blob(sig)
    } //else {
      //await gossip(hash)
    //}
  }
}
