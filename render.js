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
      img.style = 'float: left;'
      const contentDiv = h('div', {id: opened.substring(13), style: 'margin-left: 58px;'}, ['\n'])
      const name = h('a', {href: '#' + blob.substring(0, 44), id: 'name', classList: 'avatarlink', title: blob.substring(0, 44)}, [blob.substring(0, 10)])
      const permalink = h('a', {href: '#' + blob, classList: 'material-symbols-outlined', style: 'float: right;'}, ['Share'])
      const qrcode = h('div')
      const qr = h('a', {onclick: () => {
        if (!qrcode.firstChild) {
          new QRCode(qrcode, {
            text: location.href + blob,
            width: 255,
            height: 255,
            colorDark: "#f5f5f5",
            colorLight: "#333"
          })
        } 
        if (qrcode.firstChild) {
          qrcode.removeChild(qrcode.firstChild)
        }  
      }, classList: 'material-symbols-outlined', style: 'float: right;'}, ['Qr_Code'])
   
      const hashlink = h('a', {href: '#' + hash, classList: 'unstyled'}, [ts])
      const right = h('span', {style: 'float: right;'}, [
        h('code', {classList: 'pubkey'}, [blob.substring(0, 10)]),
        ' ',
        h('span', {classList: 'material-symbols-outlined', onclick: async () => {
          contentDiv.appendChild(h('pre', [await bogbot.get(opened.substring(13))]))
        }}, ['Code']),
        ' ',
        hashlink
      ])

      const num = h('span')

      const log = await bogbot.getOpenedLog()
      const src = document.location.hash.substring(1)
 
      let nume = 0
      log.forEach(async msg => {
        const yaml = await bogbot.parseYaml(msg.text)
        if (yaml.replyHash) { yaml.reply = yaml.replyHash}
        if (yaml.reply === hash) {
          ++nume
          num.textContent = nume
          if (src === yaml.reply) {
            const replyDiv = await render.hash(msg.hash)
            div.parentNode.appendChild(replyDiv)
          }
        } 
      })

      const reply = h('a', {
        classList: 'material-symbols-outlined', 
        onclick: async () => { 
          messageDiv.parentNode.appendChild(await composer(blob))
        }
      }, ['Chat_Bubble'])

      const controlsDiv = h('div', {style: 'margin-top: 5px; margin-left: 58px;'}, [
        qr,
        permalink,
        reply,
        ' ',
        num,
        qrcode
      ])
      const messageDiv = h('div', {
          //onclick: () => { window.location.hash = hash},
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
        const yaml = await bogbot.parseYaml(content)
        if (yaml && yaml.replyHash) { yaml.reply === yaml.replyHash}
        if (src === yaml.reply) {
          div.appendChild(messageDiv)
        }
        await render.blob(content)
      } else {
        await gossip(opened.substring(13))
      }

      if (src === '' || src === hash || src === blob.substring(0, 44) || src === blob) {
        div.appendChild(messageDiv)
      } 
    } 
  } else {
    setTimeout(async () => {
      const yaml = await bogbot.parseYaml(blob)
      const div = await document.getElementById(hash)
      if (div) {
        if (yaml.replyHash || yaml.reply) {
          if (yaml.replyHash) { yaml.reply = yaml.replyHash }
          const replyAuthor = h('span')
          const replyContent = h('a', {href: '#' + yaml.reply}, [yaml.reply.substring(0, 10)])
          const replySymbol = h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left'])
          const replyDiv = h('div', [replyAuthor, ' ', replySymbol, ' ', replyContent])
          const getMsg = await bogbot.get(yaml.reply)
          if (getMsg) {
            const link = h('a', {href: '#' + getMsg.substring(0, 44)}, [getMsg.substring(0, 10)])
            replyAuthor.appendChild(link)
            const opened = await bogbot.open(getMsg)
            const content = await bogbot.get(opened.substring(13))
            const replyYaml = await bogbot.parseYaml(content)
            if (replyYaml && replyYaml.name) {
              link.textContent = replyYaml.name
            }
            if (replyYaml && replyYaml.body) {
              replyContent.textContent = replyYaml.body.substring(0, 10) + '...'
            }
          } 
          div.parentNode.insertBefore(replyDiv, div)
        }
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
            const check = await bogbot.get(yaml.previous)
            if (!check) { 
              gossip(yaml.previous)
            }
          }
        })
      }
    }, 50)
  } 
}

render.hash = async (hash) => {
  if (!await document.getElementById(hash)) {
    const div = h('div', {id: hash}) 
    const sig = await bogbot.get(hash)

    if (sig) {
      console.log('we have it')
      render.blob(sig)
    }
    return div
  }
}
