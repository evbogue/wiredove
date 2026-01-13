import { h } from 'h'
import { identify } from './identify.js'
import { imageSpan } from './profile.js'
import { apds } from 'apds'
import { composer } from './composer.js'
import { sendWs } from './websocket.js' 
import { notificationsButton } from "./notifications.js"

const composeButton = async () => {
  if (await apds.pubkey()) {
    return h('a', {href: '#',
      classList: 'material-symbols-outlined',
      onclick: async (e) => {
        e.preventDefault()
        const compose = await composer()
        document.body.appendChild(compose)
      }
    }, ['Edit_Square'])
  } else { return h('span')}
}

const searchInput = h('input', {
  id: 'search',
  placeholder: 'Search',
  classList: 'material-symbols-outlined',
  style: 'width: 75px; height: 14px;',
  oninput: () => {
    searchInput.classList = ''
    window.location.hash = '?' + searchInput.value
    if (!searchInput.value) { searchInput.classList = 'material-symbols-outlined' }
    if (searchInput.value === '?') {searchInput.value = ''} 
  }
})

const sync = h('a', {
  style: 'margin-top: 3px;',
  classList: 'material-symbols-outlined',
  onclick: async (e) => {
    sync.remove()
    const remotelog = await fetch('https://pub.wiredove.net/all').then(l => l.json())
    for (const m of remotelog) {
      if (m && m.sig) {
        await apds.add(m.sig)
        await apds.make(m.text)
      }
    }
    const log = await apds.query()
    if (log) {
      const ar = []
      for (const msg of log) {
        sendWs(msg.sig)
        if (msg.text) {
          sendWs(msg.text)
          const yaml = await apds.parseYaml(msg.text)
          if (yaml.image && !ar.includes(yaml.image)) {
            const get = await apds.get(yaml.image)
            if (get) {
              sendWs(get)
              ar.push(yaml.image)
            }
          }
          if (yaml.body) {
            const images = yaml.body.match(/!\[.*?\]\((.*?)\)/g)
            if (images) {
              for (const image of images) {
                const src = image.match(/!\[.*?\]\((.*?)\)/)[1]
                const imgBlob = await apds.get(src)
                if (imgBlob && !ar.includes(src)) { 
                  sendWs(imgBlob) 
                  ar.push(src)
                }
              }
            }
          }
        }
        if (!msg.text) {
          const get = await apds.get(msg.opened.substring(13))
          if (get) {sendWs(get)}
        }
      }
    }
    window.location.hash = 'whut'
    window.location.hash = ''
  }
}, ['Autorenew'])

export const navbar = async () => {
  const span = h('span')

  const left = h('span', {classList: 'navbar-left'}, [
    h('a', {href: '#', classList: 'material-symbols-outlined'}, [
      h('img', {src: './dovepurple_sm.png', classList: 'avatar_small'})
    ]),
    await composeButton(),
  ])

  const right = h('span', {classList: 'navbar-right'}, [
    searchInput,
    h('a', {href: 'https://github.com/evbogue/wiredove', classList: 'material-symbols-outlined', style: 'margin-top: 3px;'}, ['Folder_Data']),
    sync,
    notificationsButton(),
    h('a', {href: '#settings', classList: 'material-symbols-outlined', style: 'margin-top: 3px;'}, ['Settings']),
    span,
  ])

  const div = h('div', {id: 'navbar'}, [left, right])

  if (!await apds.keypair()) {
    div.appendChild(await identify())
  } else {
    span.appendChild(h('a', {href: '#' + await apds.pubkey()},[await imageSpan()]))
  }

  return div
}
