import { h } from 'h'
import { apds } from 'apds'
import { nameDiv, avatarSpan } from './profile.js'
import { queueSend } from './network_queue.js'

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

const pullEverything = h('button', {
  onclick: async () => {
    const remotelog = await fetch('https://pub.wiredove.net/all').then(l => l.json())
    for (const m of remotelog) {
      if (m && m.sig) {
        await apds.add(m.sig)
        await apds.make(m.text)
      }
    }
  }
}, ['Pull everything'])

const pushEverything = h('button', {
  onclick: async () => {
    const log = await apds.query()
    if (log) {
      const ar = []
      for (const msg of log) {
        queueSend(msg.sig, 'ws')
        if (msg.text) {
          queueSend(msg.text, 'ws')
          const yaml = await apds.parseYaml(msg.text)
          if (yaml.image && !ar.includes(yaml.image)) {
            const get = await apds.get(yaml.image)
            if (get) {
              queueSend(get, 'ws')
              ar.push(yaml.image)
            }
          }
          if (yaml.body) {
            const images = yaml.body.match(/!\[.*?\]\((.*?)\)/g)
            if (images) {
              for (const image of images) {
                const src = image.match(/!\[.*?\]\((.*?)\)/)[1]
                const imgBlob = await apds.get(src)
                if (imgBlob && !ar.includes(src)) {
                  queueSend(imgBlob, 'ws')
                  ar.push(src)
                }
              }
            }
          }
        }
        if (!msg.text) {
          const get = await apds.get(msg.opened.substring(13))
          if (get) { queueSend(get, 'ws') }
        }
      }
    }
  }
}, ['Push everything'])


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
    h('p', ['Sync']),
    pushEverything,
    pullEverything,
    h('hr'),
    h('p', ['Import Keypair']),
    await editKey(),
    deleteEverything
  ])

  return div
}
