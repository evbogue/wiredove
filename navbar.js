import { h } from 'h'
import { identify } from './identify.js'
import { imageSpan } from './profile.js'
import { apds } from 'apds'
import { composer } from './composer.js'
import { sendWs } from './websocket.js' 

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
  style: 'width: 75px; float: right; margin-right: 5px; height: 14px;',
  oninput: () => {
    searchInput.classList = ''
    window.location.hash = '?' + searchInput.value
    if (!searchInput.value) { searchInput.classList = 'material-symbols-outlined' }
    if (searchInput.value === '?') {searchInput.value = ''} 
  }
})

const sync = h('a', {
  style: 'float: right; margin-top: 3px;',
  classList: 'material-symbols-outlined',
  onclick: async (e) => {
    sync.remove()
    const remotelog = await fetch('https://pub.wiredove.net/all').then(l => l.json())
    for (const m of remotelog) {
      await apds.add(m.sig)
      await apds.make(m.text)
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
  const span = h('span', {style: 'margin-left: 5px; float: right;'})

  const div = h('div', 
    {id: 'navbar'},
    [
      h('a', {href: '#', classList: 'material-symbols-outlined'}, [h('img', {src: './dovepurple_sm.png', classList: 'avatar_small'})]),
      ' ',
      await composeButton(),
      ' ',
      span,
      ' ',
      h('a', {href: '#settings', classList: 'material-symbols-outlined', style: 'float: right; margin-top: 3px;'}, ['Settings']),
      sync,
      h('a', {href: 'https://github.com/evbogue/wiredove', classList: 'material-symbols-outlined', style: 'float: right; margin-right: 5px; margin-top: 3px;'}, ['Folder_Data']),
      searchInput,
    ]
  )

  if (!await apds.keypair()) {
    div.appendChild(await identify())
  } else {
    span.appendChild(h('a', {href: '#' + await apds.pubkey()},[await imageSpan()]))
  }

  return div
}
