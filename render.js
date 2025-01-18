import { bogbot } from 'bogbot'
import { h } from 'h'
import { gossip } from './gossip.js'
import { composer } from './composer.js'

export const render = {}


render.meta = async (blob, opened, hash, div) => {
  const ts = h('a', {href: '#' + hash}, [await bogbot.human(opened.substring(0, 13))])
  setInterval(async () => {ts.textContent = await bogbot.human(opened.substring(0, 13))}, 1000)
  const author = blob.substring(0, 44)

  const permalink = h('a', {href: '#' + blob, classList: 'material-symbols-outlined'}, ['Share'])

  const qrcode = h('canvas', {style: 'display: none;'})

  let show = true

  const qr = h('a', {onclick: () => {
    if (show === true) {
      const q = new QRious({
        element: qrcode,
        value: location.href + blob,
        background: '#444',
        foreground: '#f5f5f5',
        size: 1024
      })
      qrcode.style = 'display: block; margin-left: auto; margin-right: auto; width: 100%;'
      show = false
    } else {
      qrcode.style = 'display: none;'
      show = true
    }
  }, classList: 'material-symbols-outlined'}, ['Qr_Code'])

  const right = h('span', {style: 'float: right;'}, [
    h('code', {classList: 'pubkey'}, [author.substring(0, 10)]),
    ' ',
    permalink,
    ' ',
    qr,
    ' ',
    ts,
  ])

  const contentHash = opened.substring(13)

  const img = await bogbot.visual(author)
  img.classList = 'avatar'
  img.id = 'image' + contentHash
  img.style = 'float: left;'

  const name = h('span', {id: 'name' + contentHash, classList: 'avatarlink'}, [author.substring(0, 10)])

  const content = h('span', {id: contentHash, classList: 'material-symbols-outlined'}, ['Notes'])

  const meta = h('span', [
    right,
    h('a', {href: '#' + author}, [
      img,
      name,
    ]),
    h('br'),
    h('div', {id: 'reply' + contentHash}),
    content,
    qrcode
  ])

  div.appendChild(meta)
  const getContent = await bogbot.get(contentHash)
  if (getContent) {
    await render.content(contentHash, getContent, content)
  } else {
    await gossip(contentHash)
  }
} 

render.comments = async (hash, blob, div) => {
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
        replyDiv.classList = 'message reply'
        div.after(replyDiv)
      }
    }
  })

  const reply = h('a', {
    classList: 'material-symbols-outlined',
    onclick: async () => {
      div.after(await composer(blob))
    }
  }, ['Chat_Bubble'])

  div.appendChild(h('div', [
    reply, ' ', num
  ]))
}

render.content = async (hash, blob, div) => {
  const contentHash = await bogbot.hash(blob)
  if (!div.childNodes[1]) {
    const yaml = await bogbot.parseYaml(blob)
    if (yaml && yaml.body) {
      div.classList = ''
      div.textContent = yaml.body

      if (yaml.image) {
        const get = document.getElementById('image' + contentHash)
        if (get) {
          const image = await bogbot.get(yaml.image)
          if (image) {
            get.src = image
          } else { gossip(yaml.image)}
        }
      }

      if (yaml.name) {
        const get = document.getElementById('name' + contentHash)
        if (get) { get.textContent = yaml.name}
      }

      if (yaml.previous) {
        const check = await bogbot.get(yaml.previous)
        if (!check) {
          gossip(yaml.previous)
        }
      }

      if (yaml.reply || yaml.replyHash) {
        if (yaml.replyHash) { yaml.reply = yaml.replyHash}
        try {
          const get = document.getElementById('reply' + contentHash)
          const query = await bogbot.query(yaml.reply)
          console.log(query)
          const replyYaml = await bogbot.parseYaml(query[0].text)
          console.log(replyYaml)
          const replyDiv = h('div', [
            h('a', {href: '#' + query[0].author}, [replyYaml.name || query[0].author.substring(0, 10)]), 
            ' ',
            h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left']),
            ' ',
            h('a', {href: '#' + query[0].hash}, [replyYaml.body.substring(0, 10) || query[0].hash.substring(0, 10)])
          ])
          get.appendChild(replyDiv)
        } catch (err) {
          console.log(err)
        }
      }
    }
  }
}

render.blob = async (blob) => {
  const hash = await bogbot.hash(blob)

  const div = await document.getElementById(hash)

  const opened = await bogbot.open(blob)

  if (opened && div && !div.childNodes[1]) {
    await render.meta(blob, opened, hash, div)
    await render.comments(hash, blob, div)
  } else if (div) {
    await render.content(hash, blob, div)
  }

  //} else {
  //  setTimeout(async () => {
  //    const yaml = await bogbot.parseYaml(blob)
  //    const div = await document.getElementById(hash)
  //    if (div) {
  //      if (yaml.replyHash || yaml.reply) {
  //        if (yaml.replyHash) { yaml.reply = yaml.replyHash }
  //        const replyAuthor = h('span')
  //        const replyContent = h('a', {href: '#' + yaml.reply}, [yaml.reply.substring(0, 10)])
  //        const replySymbol = h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left'])
  //        const replyDiv = h('div', [replyAuthor, ' ', replySymbol, ' ', replyContent])
  //        const getMsg = await bogbot.get(yaml.reply)
  //        if (getMsg) {
  //          const link = h('a', {href: '#' + getMsg.substring(0, 44)}, [getMsg.substring(0, 10)])
  //          replyAuthor.appendChild(link)
  //          const opened = await bogbot.open(getMsg)
  //          const content = await bogbot.get(opened.substring(13))
  //          const replyYaml = await bogbot.parseYaml(content)
  //          if (replyYaml && replyYaml.name) {
  //            link.textContent = replyYaml.name
  //          }
  //          if (replyYaml && replyYaml.body) {
  //            replyContent.textContent = replyYaml.body.substring(0, 10) + '...'
  //          }
  //        } 
  //        div.parentNode.insertBefore(replyDiv, div)
  //      }
}

render.hash = async (hash) => {
  if (!await document.getElementById(hash)) {
    const div = h('div', {id: hash, classList: 'message'}) 
    const sig = await bogbot.get(hash)

    if (sig) {
      render.blob(sig)
    }
    return div
  }
}
