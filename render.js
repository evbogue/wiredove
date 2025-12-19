import { apds } from 'apds'
import { h } from 'h'
import { send } from './send.js'
import { composer } from './composer.js'
import { markdown } from './markdown.js'
import { lookup } from './lookup.js'

export const render = {}

render.qr = (hash, blob, target) => {
  const link = h('a', {
    onclick: () => {
      const qrTarget = target || document.getElementById('qr-target' + hash)
      if (!qrTarget) { return }
      if (!qrTarget.firstChild) {
        const canvas = document.createElement('canvas')
        qrTarget.appendChild(canvas)
        const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        const background = darkMode ? '#222' : '#f8f8f8'
        const foreground = darkMode ? '#ccc' : '#444'
        new QRious({
          element: canvas,
          value: location.href + blob,
          size: 400,
          background,
          foreground,
        })
      } else {
        while (qrTarget.firstChild) {
          qrTarget.firstChild.remove()
        }
      }
    },
    classList: 'material-symbols-outlined'
  }, ['Qr_Code'])

  return link
}

render.meta = async (blob, opened, hash, div) => {
  const timestamp = opened.substring(0, 13)
  const contentHash = opened.substring(13)
  const author = blob.substring(0, 44)

  const [humanTime, contentBlob, img] = await Promise.all([
    apds.human(timestamp),
    apds.get(contentHash),
    apds.visual(author)
  ])

  const ts = h('a', {href: '#' + hash}, [humanTime])
  setInterval(async () => {ts.textContent = await apds.human(timestamp)}, 1000)

  const permalink = h('a', {href: '#' + blob, classList: 'material-symbols-outlined'}, ['Share'])

  let show = true

  const rawDiv = h('div')

  let rawshow = true

  let rawContent

  const raw = h('a', {classList: 'material-symbols-outlined', onclick: async () => {
    if (rawshow) {
      if (!rawContent) {
        rawContent = h('pre', {classList: 'hljs'}, [blob + '\n\n' + opened + '\n\n' + (contentBlob || '')])
      }
      rawDiv.appendChild(rawContent)
      rawshow = false
    } else {
      rawContent.parentNode.removeChild(rawContent)
      rawshow = true
    }
  }}, ['Code'])

  const qrTarget = h('div', {id: 'qr-target' + hash, classList: 'qr-target', style: 'margin: 8px auto 0 auto; text-align: center; max-width: 400px;'})

  const right = h('span', {style: 'float: right;'}, [
    h('span', {classList: 'pubkey'}, [author.substring(0, 6)]),
    ' ',
    render.qr(hash, blob, qrTarget),
    ' ',
    permalink,
    ' ',
    raw,
    ' ',
    ts,
  ])

  img.className = 'avatar'
  img.id = 'image' + contentHash
  img.style = 'float: left;'

  const name = h('span', {id: 'name' + contentHash, classList: 'avatarlink'}, [author.substring(0, 10)])

  const content = h('div', {id: contentHash, classList: 'material-symbols-outlined content'}, ['Notes'])

  const meta = h('div', {id: div.id, classList: 'message'}, [
    right,
    h('a', {href: '#' + author}, [
      img,
      name,
    ]),
    h('div', {style: 'margin-left: 43px;'}, [
      h('div', {id: 'reply' + contentHash}),
      content,
      rawDiv
    ]),
    qrTarget
  ])

  div.replaceWith(meta)
  const comments = render.comments(hash, blob, meta)
  await Promise.all([
    comments,
    contentBlob ? render.content(contentHash, contentBlob, content) : send(contentHash)
  ])
} 

render.comments = async (hash, blob, div) => {
  const num = h('span')

  const replies = await lookup.get(hash)
  const src = document.location.hash.substring(1)

  let nume = 0
  replies.forEach(async msg => {
      ++nume
      num.textContent = nume
      //if (src === yaml.reply) {
        const replyContain = h('div', {classList: 'reply'}, [
          render.hash(msg.hash)
        ])
        div.after(replyContain)
        await render.blob(await apds.get(msg.hash))
      //}
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
  const contentHashPromise = hash ? Promise.resolve(hash) : apds.hash(blob)
  const [contentHash, yaml] = await Promise.all([
    contentHashPromise,
    apds.parseYaml(blob)
  ])

  if (yaml && yaml.body) {
    div.className = 'content'
    let html = await markdown(yaml.body)
    if (yaml.reply) { html = "<span class='material-symbols-outlined'>Subdirectory_Arrow_left</span><a href='#" + yaml.reply  + "'> " + yaml.reply.substring(0, 10) + "...</a>" + html }

    div.innerHTML = html

    if (yaml.image) {
      const get = document.getElementById('image' + contentHash)
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
      const get = document.getElementById('name' + contentHash)
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
  const [hash, opened] = await Promise.all([
    apds.hash(blob),
    apds.open(blob)
  ])
  
  const div = document.getElementById(hash)

  const getimg = document.getElementById('inlineimage' + hash)
  if (opened && div && !div.childNodes[1]) {
    await render.meta(blob, opened, hash, div)
    //await render.comments(hash, blob, div)
  } else if (div && !div.childNodes[1]) {
    if (div.className.includes('content')) {
      await render.content(hash, blob, div)
    } else {
      const content = h('div', {classList: 'content'})
      const wrapper = h('div', {id: div.id, classList: 'message'}, [content])
      div.replaceWith(wrapper)
      await render.content(hash, blob, content)
    }
  } else if (getimg) {
    getimg.src = blob
  } 
}

render.shouldWe = async (blob) => {
  const [opened, hash] = await Promise.all([
    apds.open(blob),
    apds.hash(blob)
  ])
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
    const msg = await apds.get(opened.substring(13))
    const yaml = await apds.parseYaml(msg)
    
    const message = {
      hash,
      sig: blob,
      text: msg,
      author: blob.substring(0, 44),
      opened
    }
    await lookup.process(message)

    // this should detect whether the syncing message is newer or older and place the msg in the right spot
    if (blob.substring(0, 44) === src || hash === src || yaml.author === src || al.includes(blob.substring(0, 44))) {
      const scroller = document.getElementById('scroller')
      const div = render.hash(hash)
      if (div) {
        scroller.appendChild(div)
        //scroller.insertBefore(div, scroller.firstChild)
        await render.blob(blob)
      }
    }
    if (src === '') {
      const scroller = document.getElementById('scroller')
      const div = render.hash(hash)
      if (div) {
        //scroller.appendChild(div)
        scroller.insertBefore(div, scroller.firstChild)
        await render.blob(blob)
      }
    } 
  }
}

render.hash = (hash) => {
  if (!document.getElementById(hash)) {
    const div = h('div', {id: hash, className: 'premessage'}) 
    return div
  }
}
