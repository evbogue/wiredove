import { h, human } from './lib/misc.js'

export async function render (msg, unboxed) {
  const ts = h('span', [human(new Date(parseInt(unboxed.substring(0,13))))])
  const div = h('div', [
    h('span', {style: 'float: right;'}, [ts]),
    h('a', {href: '#' + msg.substring(0, 44)}, [msg.substring(0, 7) + '...']),
     ' ' + unboxed.substring(13)
  ])

  setInterval(function () {
    ts.textContent = human(new Date(parseInt(unboxed.substring(0,13))))
  }, 10000)

  return div
}

