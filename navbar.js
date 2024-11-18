import { h } from './lib/h.js'
import { bogbot } from './bogbot.js'
import { currentAvatar } from './avatar.js'
import { search } from './search.js'
import { mykey } from './mykey.js'

const ownerAvatar = await currentAvatar(mykey)

document.title = ownerAvatar.textContent + "'s Bog"

export const navbar = h('navbar' , {id: 'navbar'}, [
  h('span', {style: 'float: right; margin-right: 2em;'}, [
    await currentAvatar(await bogbot.pubkey()),
    ' (you) ',
    h('a', {href: '#settings'}, ['⚙️'])
  ]),
  search,
  ' ',
  ownerAvatar,
  " ",
  h('a', {href: '#public'}, ['🏦'])
])
