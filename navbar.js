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

export const navbar = async () => {
  const div = h('div', 
    {id: 'navbar'},
    [
      h('a', {href: '#', classList: 'material-symbols-outlined'}, ['Home']),
      ' ',
      await composeButton(),
      ' ',
      h('a', {href: '#archive', classList: 'material-symbols-outlined'}, ['Archive']),
      ' ',
      h('a', {href: '#settings', classList: 'material-symbols-outlined', style: 'float: right; margin-right: 25px;'}, ['Settings']),
      h('a', {href: 'https://github.com/evbogue/wiredove', classList: 'material-symbols-outlined', style: 'float: right; margin-right: 5px;'}, ['Folder_Data'])
    ]
  )

  if (!await bogbot.keypair()) {
    div.appendChild(await identify())
  } else {
    div.appendChild(h('a', {href: '#' + await bogbot.pubkey(), style: 'float: left;'}, [await imageSpan()]))
  }

  return div
}
