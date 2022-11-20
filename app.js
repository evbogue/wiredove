import { h, human } from './lib/misc.js'
import { keys, unbox } from './util.js'
import { compose } from './compose.js'

function start () {
  if (keys) {
    if (window.location.hash.length < 44) {
      window.location.hash = keys.pubkey()
    }
    document.body.appendChild(h('span', ['Your pubkey: ' + keys.pubkey()]))
    document.body.appendChild(compose)
    if (window.location.hash.length > 45) {
      const msg = window.location.hash.substring(1)
      unbox(msg.substring(44), msg.substring(0, 44), keys.privkey()).then(unboxed => {
        if (unboxed) {
          document.body.appendChild(h('div', [
            h('span', {style: 'float: right;'}, [human(new Date(parseInt(unboxed.substring(0,13))))]), 
            msg.substring(0, 44) + ' ' + unboxed.substring(13)]))
        }
      })
    }
  } else {
    setTimeout(function () { start()}, 25)
  }
}

start()
