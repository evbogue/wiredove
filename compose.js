import { h } from './lib/misc.js'
import { box, keys } from './util.js'

const textarea = h('textarea', {placeholder: 'Write a message'})

export const compose = h('div', [
  textarea,
  h('button', {onclick: function () {
    if (textarea.value) {
      // send it to yourself
      const date = Date.now()
      box(date + textarea.value, keys.pubkey(), keys.privkey()).then(boxed => {
        alert(boxed)        
      })
      const dest = window.location.hash.substring(1, 46)
      console.log(dest)
      if (keys.pubkey() != dest) {
        // send it to someone else
        box(date + textarea.value, dest, keys.privkey()).then(boxed => {
          fetch('https://ntfy.sh/wiredove', {
            method: 'POST', 
            body: 'https://wiredove.net/#' + boxed
          })
        })
      }
    }
  }}, ['Send'])  
])

