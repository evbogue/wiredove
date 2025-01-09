import { h } from 'h'
import { identify } from './identify.js'
import { imageSpan } from './profile.js'
import { bogbot } from 'bogbot'
import { composer } from './composer.js'

export const navbar = async () => {
  const div = h('div', 
    {id: 'navbar'},
    [
      h('a', {href: '#', classList: 'material-symbols-outlined'}, ['Home']),
      ' ',
      h('a', {href: '#', 
        classList: 'material-symbols-outlined',
        onclick: async () => {
          const compose = await composer()
          const scroller = document.getElementById('scroller')
          scroller.insertBefore(compose, scroller.firstChild)
        }
      }, ['Edit_Square']),
      ' ',
      h('a', {href: '#settings', classList: 'material-symbols-outlined'}, ['Settings'])
    ]
  )

  if (!await bogbot.keypair()) {
    div.appendChild(await identify())
  } else {
    div.appendChild(h('a', {href: '#' + await bogbot.pubkey(), style: 'float: left;'}, [await imageSpan()]))
  }

  return div
}
