import { h, human } from './lib/misc.js'

export async function render (msg, unboxed) {
  const div = h('div', [
    h('span', {style: 'float: right;'}, [human(new Date(parseInt(unboxed.substring(0,13))))]),
    msg.substring(0, 44) + ' ' + unboxed.substring(13)
  ])

  return div
}

