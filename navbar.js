import { h } from 'h'
import { identify } from './identify.js'
import { imageSpan } from './profile.js'
import { bogbot } from 'bogbot'

export const navbar = async () => {
  const div = h('div', 
    {id: 'navbar'},
    [
      h('a', {href: '#', classList: 'material-symbols-outlined'}, ['Home']),
      ' ',
    ]
  )

  if (!await bogbot.keypair()) {
    div.appendChild(await identify())
  } else {
    div.appendChild(h('a', {href: '#' + await bogbot.pubkey()}, [await imageSpan()]))
  }

  return div
}
