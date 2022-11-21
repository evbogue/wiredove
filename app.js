import { h, human } from './lib/misc.js'
import { keys, unbox } from './util.js'
import { compose } from './compose.js'
import { render } from './render.js'
import { logs } from './log.js'

const scroller = h('div', {id: 'scroller'})

const stream = h('div', {id: 'stream'})

document.body.appendChild(scroller)

function start () {
  if (keys) {
    if (window.location.hash.length < 44) {
      window.location.hash = keys.pubkey()
    }
    scroller.appendChild(h('span', ['Your pubkey: ' + keys.pubkey()]))
    scroller.appendChild(compose)
    scroller.appendChild(stream)
    if (window.location.hash.length > 45) {
      const msg = window.location.hash.substring(1)
      unbox(msg.substring(44), msg.substring(0, 44), keys.privkey()).then(unboxed => {
        if (unboxed) {
          render(msg, unboxed).then(rendered => {
            if (stream.firstChild) {
              stream.insertBefore(rendered, stream.firstChild)
            } else {
              stream.appendChild(rendered)
            }
          })
        }
      })
    }
    //setTimeout(function () {
      logs.getLog().then(log => {
        log.forEach(mssg => {
          unbox(mssg.substring(44), mssg.substring(0, 44), keys.privkey()).then(unboxed => {
            if (unboxed) {
              render(mssg, unboxed).then(rendered => {
                if (stream.firstChild) {
                  stream.insertBefore(rendered, stream.firstChild)
                } else {
                  stream.appendChild(rendered)
                }
              })
            }
          })
        })
      })
    //}, 1000)
  } else {
    setTimeout(function () { start()}, 25)
  }
}

start()
