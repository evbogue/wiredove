import { h } from 'h'
import { apds } from 'apds'
import { nameDiv, avatarSpan } from './profile.js'
import { clearQueue, getQueueSize, queueSend } from './network_queue.js'

const isHash = (value) => typeof value === 'string' && value.length === 44

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

let batchTotal = 0
let batchTarget = 0
let batchStartSize = 0
let queueTicker = null

const updateQueueUi = () => {
  const size = getQueueSize()
  if (batchTotal > 0) {
    const done = Math.min(batchTotal, Math.max(0, batchTarget - size))
    queueLabel.textContent = `Queue: ${size} | Push: ${done}/${batchTotal}`
    queueProgress.max = batchTotal
    queueProgress.value = done
  } else {
    queueLabel.textContent = `Queue: ${size}`
    queueProgress.max = 1
    queueProgress.value = 0
  }
}

const queueLabel = h('div', {classList: 'queue-status'}, ['Queue: 0'])
const queueProgress = h('progress', {classList: 'queue-progress', max: 1, value: 0})
const cancelQueue = h('button', {
  onclick: () => {
    clearQueue()
    batchTotal = 0
    batchTarget = 0
    batchStartSize = 0
    updateQueueUi()
  }
}, ['Cancel queue'])

const queuePanel = h('div', {classList: 'queue-panel'}, [
  queueLabel,
  queueProgress,
  cancelQueue
])

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
    batchStartSize = getQueueSize()
    batchTotal = 0
    const log = await apds.query()
    if (log) {
      const ar = []
      for (const msg of log) {
        if (isHash(msg.hash) && queueSend(msg.hash)) { batchTotal += 1 }
        if (msg.text) {
          const yaml = await apds.parseYaml(msg.text)
          if (isHash(yaml.image) && !ar.includes(yaml.image)) {
            if (queueSend(yaml.image)) { batchTotal += 1 }
            ar.push(yaml.image)
          }
          if (yaml.body) {
            const images = yaml.body.match(/!\[.*?\]\((.*?)\)/g)
            if (images) {
              for (const image of images) {
                const src = image.match(/!\[.*?\]\((.*?)\)/)[1]
                if (isHash(src) && !ar.includes(src)) {
                  if (queueSend(src)) { batchTotal += 1 }
                  ar.push(src)
                }
              }
            }
          }
        }
        if (!msg.text) {
          const contentHash = msg.opened?.substring(13)
          if (isHash(contentHash) && queueSend(contentHash)) { batchTotal += 1 }
        }
      }
    }
    batchTarget = batchStartSize + batchTotal
    updateQueueUi()
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
  if (!queueTicker) {
    updateQueueUi()
    queueTicker = setInterval(updateQueueUi, 500)
  }
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
    queuePanel,
    pushEverything,
    pullEverything,
    h('hr'),
    h('p', ['Import Keypair']),
    await editKey(),
    deleteEverything
  ])

  return div
}
