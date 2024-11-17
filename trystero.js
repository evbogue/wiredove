import { joinRoom } from './lib/trystero-torrent.min.js'
import { bogbot } from './bogbot.js'
import { encode } from './lib/base64.js'
import { render } from './render.js'
import { markdown } from './markdown.js'
import { parseYaml } from './yaml.js'
import { mykey } from './mykey.js'

export const rooms = new Map()

const queue = new Set()

export const blastBlob = async (blob) => {
  console.log('Sending: ' + blob)
  rooms.forEach(room => {
    if (room.sendBlob) {
      room.sendBlob(blob)
    }
  })
}

export const gossip = async (hash, author) => {
  queue.add(hash)

  let speed = 1

  const ask = async () => {
    const haveBlob = await bogbot.find(hash)
    const havePost = await bogbot.query(hash)
    if (haveBlob || havePost && havePost[0]) {
      queue.delete(hash)
    }
    if (queue.has(hash)) {
      speed++
      const values = [...rooms.values()]
      const room = values[Math.floor(Math.random() * values.length)]
      if (room.sendHash) {
        room.sendHash(hash)
      setTimeout(() => {
        ask()
      }, (100 * speed)) 
    }
  }

  ask()
}

export const makeRoom = async (pubkey) => {
  const room = joinRoom({appId: 'bogsite', password: 'password'}, pubkey)
  
  const [ sendHash, onHash ] = room.makeAction('hash')
  const [ sendBlob, onBlob ] = room.makeAction('blob')

  room.sendHash = sendHash
  room.sendBlob = sendBlob

  onHash(async (hash, id) => {
    try {
      const q = await bogbot.query(hash)
      if (q && q.length) { 
        const blob = q[q.length - 1]
        sendBlob(blob.raw, id)
      } else {
        const b = await bogbot.find(hash)
        if (b) {
          sendBlob(b, id)
        } 
      }
    } catch (err) {
    }
  })
  
  onBlob(async (blob, id) => {
    console.log('Got: ' + blob)
    let opened 
    try { 
      const open = await bogbot.open(blob)
      if (open) { opened = open} 
    } catch (err) {}
    if (opened) {
      const src = window.location.hash.substring(1)
      if (src === 'public' || (src === '' && opened.author === mykey)  || src === opened.author || src === opened.hash) {
        const el = document.getElementById(opened.hash)
        if (!el) {
          const rendered = await render(opened)
          const scroller = document.getElementById('scroller')
          scroller.firstChild.after(rendered)
        }
        if (el && el.childNodes.length == 0) {
          console.log('WE SHOULD RENDER')
          const rendered = await render(opened)
          el.replaceWith(rendered)
        }
      }
      await bogbot.add(opened.raw)
    } else {
      const hash = encode(Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(blob))
        ))
      )
      const q = await bogbot.query(hash)
      await bogbot.make(blob)
      try {
        const got = document.getElementById('image:' + hash)
        if (got) { got.src = blob}
      } catch (err) {}
      try {
        const got = document.getElementById(hash)
        try {
          const obj = await parseYaml(blob)
          const mark = await markdown(obj.body)
          got.innerHTML = mark
        } catch (err) {}
      } catch (err) {}
      try {queue.delete(hash)} catch (err) {}
    } 
  })
  
  room.onPeerJoin(async (id) => {
    console.log(id + ' joined the room ' + pubkey)
    sendHash(await bogbot.pubkey(), id)
    try {
      const latest = await bogbot.getLatest(await bogbot.pubkey())
      sendBlob(latest.raw)
    } catch (err) {}
  })
  
  room.onPeerLeave(id => {
    console.log(id + ' left the room ' + pubkey)
  })

  rooms.set(pubkey, room)
}
