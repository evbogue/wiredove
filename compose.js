import { h } from './lib/misc.js'
import { box, unbox, keys } from './util.js'
import { render } from './render.js'
import { logs } from './log.js'
import { send } from './connect.js' 

const textarea = h('textarea', {placeholder: 'Write a message'})

export const compose = h('div', [
  textarea,
  h('button', {onclick: function () {
    if (textarea.value) {
      const stream = document.getElementById('stream')
      const date = Date.now()
      if (window.location.hash.substring(1, 45) != keys.pubkey()) {
        box(date + textarea.value, keys.pubkey(), keys.privkey()).then(boxed => {
          logs.add(boxed)
          const msg = boxed
          unbox(msg.substring(44), msg.substring(0, 44), keys.privkey()).then(unboxed => {
            render(msg, unboxed).then(rendered => {
              if (stream.firstChild) {
                stream.insertBefore(rendered, stream.firstChild)
              } else {
                stream.appendChild(rendered)
              }
            })
          }) 
        })
      }
      const dest = window.location.hash.substring(1, 45)
      box(date + textarea.value, dest, keys.privkey()).then(boxed => {
        send(boxed)
        fetch('https://ntfy.sh/wiredove', {
          method: 'POST', 
          body: window.location.origin + '/#' + boxed
        })
      })
      textarea.value = ''
    }
  }}, ['Send'])  
])

