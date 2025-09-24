import { h } from 'h'
import { apds } from 'apds'
import { nameDiv, avatarSpan } from './profile.js'

export const importKey = async () => {
  const textarea = h('textarea', {placeholder: 'Keypair'})

  const button = h('button', {
    onclick: async () => {
      const trashkey = await apds.generate()
      if (textarea.value && textarea.value.length === trashkey.length) {
        await apds.put('keypair', textarea.value)
        window.location.hash = '#'
        location.reload()
      } else { alert('Invalid Keypair')}
    }
  }, ['Import key'])

  const div = h('div', {classList: 'message'}, [
    textarea, 
    button,
    deleteEverything
  ]) 

  return div 
} 

const editKey = async () => {
  const textarea = h('textarea', [await apds.keypair()])
  const span = h('span', [
    textarea,
    h('button', {
      onclick: async () => {
        const keypair = await apds.keypair()
        if (textarea.value.length === keypair.length) {
          await apds.put('keypair', textarea.value)
          window.location.hash = '#'
          location.reload()
        } else { alert('Invalid Keypair')}
      }
    }, ['Import key']),
    h('button', {
      onclick: async () => {
        await apds.deletekey()
        window.location.hash = '#'
        location.reload()
      }
    }, ['Delete key']),
  ])
  return span
} 

const deleteEverything = h('button', {
  onclick: async () => {
    await apds.clear()
    window.location.hash = '#'
    location.reload()
  }
}, ['Delete everything'])


//const didweb = async () => {
//  const input = h('input', {placeholder: 'https://yourwebsite.com/'})
//  const get = await apds.get('didweb')
//  if (get) {input.placeholder = get}
//
//  return h('div', [
//    input,
//    h('button', {onclick: async () => {
//      if (input.value) {
//        const check = await fetch(input.value + '/keys', {
//          method: 'get',
//          mode: 'no-cors',
//          headers: {
//            'Access-Control-Allow-Origin' : '*'
//          }
//        })
//        if (check) { console.log(await check.text()) }
//      }
//    }}, ['Verify'])
//  ])
//}

export const settings = async () => {
  const div = h('div', {classList: 'message'}, [
    h('p', ['Upload photo']),
    await avatarSpan(),
    h('hr'),
    h('p', ['New name']),
    await nameDiv(),
    h('hr'),
    //h('p', ['Did:web']),
    //await didweb(),
    //h('hr'),
    h('p', ['Import Keypair']),
    await editKey(),
    deleteEverything
  ])

  return div
}

