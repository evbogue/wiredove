import { apds } from 'apds'
import { h } from 'h'
import { send } from './send.js'
import { composer } from './composer.js'
import { markdown } from './markdown.js'

export const render = {}

render.qr = async (hash, blob) => {
    const qrcode = h('span', {id: 'qr' + hash, style: 'width: 50%; margin-right: auto; margin-left: auto;'})

  const link = h('a', {onclick: () => {
    if (!qrcode.firstChild) {
      const q = new QRCode('qr' + hash, {
        text: location.href + blob,
      })
    } else {
      qrcode.firstChild.remove()
      qrcode.firstChild.remove()
    }
  }, classList: 'material-symbols-outlined'}, ['Qr_Code'])

  return h('span', [link, qrcode])
}

render.meta = async (blob, opened, hash, div) => {
  const ts = h('a', {href: '#' + hash}, [await apds.human(opened.substring(0, 13))])
  setInterval(async () => {ts.textContent = await apds.human(opened.substring(0, 13))}, 1000)
  const author = blob.substring(0, 44)

  const permalink = h('a', {href: '#' + blob, classList: 'material-symbols-outlined'}, ['Share'])

  let show = true

  const rawDiv = h('div')

  let rawshow = true

  const contentBlob = await apds.get(opened.substring(13))
  const rawContent = h('pre', {classList: 'hljs'}, [blob + '\n\n' + opened + '\n\n' + contentBlob])

  const raw = h('a', {classList: 'material-symbols-outlined', onclick: async () => {
    if (rawshow) {
      rawDiv.appendChild(rawContent)
      rawshow = false
    } else {
      rawContent.parentNode.removeChild(rawContent)
      rawshow = true
    }
  }}, ['Code'])

  const right = h('span', {style: 'float: right;'}, [
    h('span', {classList: 'pubkey'}, [author.substring(0, 6)]),
    ' ',
    await render.qr(hash, blob),
    ' ',
    permalink,
    ' ',
    raw,
    ' ',
    ts,
  ])

  const contentHash = opened.substring(13)

  const img = await apds.visual(author)
  img.classList = 'avatar'
  img.id = 'image' + contentHash
  img.style = 'float: left;'

  const name = h('span', {id: 'name' + contentHash, classList: 'avatarlink'}, [author.substring(0, 10)])

  const content = h('div', {id: contentHash, classList: 'material-symbols-outlined content'}, ['Notes'])

  const meta = h('div', {id: div.id, classList: div.classList}, [
    right,
    h('a', {href: '#' + author}, [
      img,
      name,
    ]),
    h('div', {style: 'margin-left: 43px;'}, [
      h('div', {id: 'reply' + contentHash}),
      content,
      rawDiv
    ])
  ])

  div.replaceWith(meta)
  //div.appendChild(meta)
  await render.comments(hash, blob, meta)
  const getContent = await apds.get(contentHash)
  if (getContent) {
    await render.content(contentHash, getContent, content)
  } else {
    await send(contentHash)
  }
} 

render.comments = async (hash, blob, div) => {
  const num = h('span')

  const log = await apds.getOpenedLog()
  const src = document.location.hash.substring(1)

  let nume = 0
  log.forEach(async msg => {
    const yaml = await apds.parseYaml(msg.text)
    if (yaml.replyHash) { yaml.reply = yaml.replyHash}
    if (yaml.reply === hash) {
      ++nume
      num.textContent = nume
      //if (src === yaml.reply) {
        const replyContain = h('div', {classList: 'reply'}, [
          await render.hash(msg.hash)
        ])
        div.after(replyContain)
        await render.blob(await apds.get(msg.hash))
      //}
    }
  })

  const reply = h('a', {
    classList: 'material-symbols-outlined',
    onclick: async () => {
      if (await apds.pubkey()) {
        div.after(await composer(blob))
      }
    }
  }, ['Chat_Bubble'])

  div.appendChild(h('div', {style: 'margin-left: 43px;'}, [
    reply, ' ', num
  ]))
}

const cache = new Map()

render.content = async (hash, blob, div) => {
  const contentHash = await apds.hash(blob)
  const yaml = await apds.parseYaml(blob)

  if (yaml && yaml.body) {
    div.classList = 'content'
    let html = await markdown(yaml.body)
    if (yaml.reply) { html = "<span class='material-symbols-outlined'>Subdirectory_Arrow_left</span><a href='#" + yaml.reply  + "'> " + yaml.reply.substring(0, 10) + "...</a>" + html }

    div.innerHTML = html

    if (yaml.image) {
      const get = await document.getElementById('image' + contentHash)
      if (get) {
        if (cache.get(yaml.image)) {
          get.src = cache.get(yaml.image)
        } else {
          const image = await apds.get(yaml.image)
          cache.set(yaml.image, image)
          if (image) {
            get.src = image
          } else { send(yaml.image)}
        }
      }
    }

    if (yaml.name) {
      const get = await document.getElementById('name' + contentHash)
      if (get) { get.textContent = yaml.name}
    }

    if (yaml.previous) {
      const check = await apds.query(yaml.previous)
      if (!check[0]) {
        await send(yaml.previous)
      }
    }

    //if (yaml.reply || yaml.replyHash) {
    //  if (yaml.replyHash) { yaml.reply = yaml.replyHash}
    //  try {
    //    const get = await document.getElementById('reply' + contentHash)
    //    const query = await apds.query(yaml.reply)
    //    if (get && query && query[0]) {
    //      const replyYaml = await apds.parseYaml(query[0].text)
    //      const replyDiv = h('div', {classList: 'breadcrumbs'}, [
    //        h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left']),
    //        ' ',
    //        h('a', {href: '#' + query[0].author}, [replyYaml.name || query[0].author.substring(0, 10)]), 
    //        ' | ',
    //        h('a', {href: '#' + query[0].hash}, [replyYaml.body.substring(0, 24) || query[0].hash.substring(0, 10)])
    //      ])
    //      get.appendChild(replyDiv)
    //    }
    //  } catch (err) {
    //    //console.log(err)
    //  }
    //}
  }
}

render.blob = async (blob) => {
  const hash = await apds.hash(blob)
  
  const div = await document.getElementById(hash)

  const opened = await apds.open(blob)
  const getimg = await document.getElementById('inlineimage' + hash)
  if (opened && div && !div.childNodes[1]) {
    await render.meta(blob, opened, hash, div)
    //await render.comments(hash, blob, div)
  } else if (div && !div.childNodes[1]) {
    await render.content(hash, blob, div)
  } else if (getimg) {
    getimg.src = blob
  } 
}

render.shouldWe = async (blob) => {
  const opened = await apds.open(blob)
  const hash = await apds.hash(blob)
  const already = await apds.get(hash)
  if (!already) {
    await apds.make(blob)
  }
  if (opened && !already) {
    const src = window.location.hash.substring(1)
    const al = []
    const aliases = localStorage.getItem(src)
    if (aliases) {
      const parse = JSON.parse(aliases)
      al.push(...parse)
      console.log(al)
    }
    const hash = await apds.hash(blob)
    const msg = await apds.get(opened.substring(13))
    const yaml = await apds.parseYaml(msg)
    // this should detect whether the syncing message is newer or older and place the msg in the right spot
    if (blob.substring(0, 44) === src || hash === src || yaml.author === src || src === '' || al.includes(blob.substring(0, 44))) {
      const scroller = document.getElementById('scroller')
      const div = await render.hash(hash)
      if (div) {
        scroller.appendChild(div)
        //scroller.insertBefore(div, scroller.firstChild)
        await render.blob(blob)
      }
    }
  }
}

render.hash = async (hash) => {
  if (!await document.getElementById(hash)) {
    const div = h('div', {id: hash, classList: 'message'}) 
    return div
  }
}
