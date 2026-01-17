import { h } from 'h'
import { identify, promptKeypair } from './identify.js'
import { imageSpan } from './profile.js'
import { apds } from 'apds'
import { composer } from './composer.js'
import { notificationsButton } from "./notifications.js"

const composeButton = async () => {
  const hasKey = !!(await apds.pubkey())
  return h('a', {
    href: '#',
    classList: hasKey ? 'material-symbols-outlined' : 'material-symbols-outlined disabled',
    onclick: async (e) => {
      e.preventDefault()
      if (!await apds.pubkey()) {
        promptKeypair()
        return
      }
      const compose = await composer()
      document.body.appendChild(compose)
    }
  }, ['Edit_Square'])
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
