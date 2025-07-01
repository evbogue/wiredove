import { h } from 'h'
import { identify } from './identify.js'
import { imageSpan } from './profile.js'
import { bogbot } from 'bogbot'
import { composer } from './composer.js'

const composeButton = async () => {
  if (await bogbot.pubkey()) {
    return h('a', {href: '#',
      classList: 'material-symbols-outlined',
      onclick: async (e) => {
        e.preventDefault()
        const compose = await composer()
        const scroller = document.getElementById('scroller')
        scroller.insertBefore(compose, scroller.firstChild)
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

export const navbar = async () => {
  const div = h('div', 
    {id: 'navbar'},
    [
      h('a', {href: '#', classList: 'material-symbols-outlined'}, ['Home']),
      ' ',
      await composeButton(),
      ' ',
      //h('a', {href: '#import', classList: 'material-symbols-outlined'}, ['Post_Add']),
      //' ',
      h('a', {href: '#archive', classList: 'material-symbols-outlined'}, ['Archive']),
      ' ',
      h('a', {href: '#settings', classList: 'material-symbols-outlined', style: 'float: right; margin-right: 25px;'}, ['Settings']),
      h('a', {href: 'https://github.com/evbogue/wiredove', classList: 'material-symbols-outlined', style: 'float: right; margin-right: 5px;'}, ['Folder_Data']),
      searchInput,
    ]
  )

  if (!await bogbot.keypair()) {
    div.appendChild(await identify())
  } else {
    div.appendChild(h('a', {href: '#' + await bogbot.pubkey(), style: 'float: left;'}, [await imageSpan()]))
  }

  return div
}
