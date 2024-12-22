import { h } from 'h'
import { identify } from './identify.js'

export const navbar = h('div', 
  {id: 'navbar'},
  [
    h('a', {href: '#'}, ['🏦']),
    ' ',
    await identify()
  ]
)
