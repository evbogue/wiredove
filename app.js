import { h, human } from './lib/misc.js'
import { keys, unbox } from './util.js'
import { compose } from './compose.js'
import { render } from './render.js'
import { logs } from './log.js'
import { addSocket } from './connect.js'

const ws = new WebSocket('wss://' + location.host + '/ws')
ws.binaryType = 'arraybuffer'

const screen = h('div', {id: 'screen'})

const scroller = h('div', {id: 'scroller'})

const stream = h('div', {id: 'stream'})

document.body.appendChild(screen)
screen.appendChild(scroller)

function start () {
  if (keys) {
     
    if (window.location.hash.length < 44) {
      window.location.hash = keys.pubkey()
    }
    scroller.appendChild(h('div', [
      'Your pubkey: ', 
      h('a', {href: '#' + keys.pubkey()}, [keys.pubkey()])
    ]))
    const destDiv = h('div')
    const dest = h('div', [
      'Sending to: ', 
      h('a', {href: '#' + window.location.hash.substring(1, 45)}, [window.location.hash.substring(1, 45)])
    ])
    destDiv.appendChild(dest)
    scroller.appendChild(destDiv)

    window.onhashchange = function () {
      destDiv.removeChild(destDiv.firstChild)
      destDiv.appendChild(h('div', [
        'Sending to: ', 
        h('a', {href: '#' + window.location.hash.substring(1, 45)}, [window.location.hash.substring(1, 45)])
      ]))      
    }

    scroller.appendChild(compose)
    scroller.appendChild(stream)
    if (window.location.hash.length > 45) {
      const msg = window.location.hash.substring(1)
      unbox(msg.substring(44), msg.substring(0, 44), keys.privkey()).then(unboxed => {
        if (unboxed) {
          logs.getLog().then(log => {
            if (!log.includes(msg)) {
              logs.add(msg)
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
      })
    }

    ws.onopen = () => { addSocket(ws) }
    
    ws.onmessage = (e) => {
      console.log(e.data)
      unbox(e.data.substring(44), e.data.substring(0, 44), keys.privkey()).then(unboxed => {
        if (unboxed) {
          logs.getLog().then(log => {
            if (!log.includes(e.data)) {
              logs.add(e.data)
              render(e.data, unboxed).then(rendered => {
                if (stream.firstChild) {
                  stream.insertBefore(rendered, stream.firstChild)
                } else {
                  stream.appendChild(rendered)
                }
              })
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
