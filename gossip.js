import { bogbot } from 'bogbot'
import { joinRoom } from './trystero-torrent2.min.js'
import { render } from './render.js'
import { send } from './connect.js'

export const rooms = new Map()

const queue = new Set()

export const gossip = async (hash) => {
  let speed = 1

  const ask = async () => {
    const haveBlob = await bogbot.get(hash)
    if (haveBlob) {
      await bogbot.add(haveBlob)
      queue.delete(hash)
    }
    if (queue.has(hash)) {
      speed++
      const values = [...rooms.values()]
      const room = values[Math.floor(Math.random() * values.length)]
      if (room && room.sendHash) {
        room.sendHash(hash)
        setTimeout(() => {
          if (speed === 100) {
            queue.delete(hash)
          }
          ask()
        }, (10000 * speed))
      }
    }
  }
  if (!queue.has(hash)) {
    send(hash)
    // prevent dupes
    queue.add(hash)
    await ask()
  }
}

export const blast = async (pubkey, blob) => {
  const room = rooms.get(pubkey) 
  if (room) {
    room.sendBlob(blob)
  }
}

export const makeRoom = async (pubkey) => {
  const get = rooms.get(pubkey)

  if (!get) {
    const room = joinRoom({appId: 'wiredovetestnet', password: 'iajwoiejfaowiejfoiwajfe'}, pubkey)
    const [ sendHash, onHash ] = room.makeAction('hash')
    const [ sendBlob, onBlob ] = room.makeAction('blob')

    room.sendHash = sendHash
    room.sendBlob = sendBlob

    onHash(async (hash, id) => {
      //console.log(`Received: ${hash}`)
      const get = await bogbot.get(hash)
      if (get) { sendBlob(get, id)}
      const latest = await bogbot.getLatest(hash)
      if (latest) { room.sendBlob(latest.sig)}
    }) 

    onBlob(async (blob, id) => {
      //console.log(`Received: ${blob}`)
      await render.shouldWe(blob)
      await bogbot.add(blob)
      await render.blob(blob)
    })

    room.onPeerJoin(async (id) => {
      console.log(id + ' joined the room ' + pubkey)
      room.sendHash(pubkey)
      const pubkeys = await bogbot.getPubkeys()
      for (const key of pubkeys) {
        room.sendHash(key)
        const latest = await bogbot.getLatest(key)
        if (latest) {
          room.sendBlob(latest.sig)
        }
      }
    })

    room.onPeerLeave(id => {
      //console.log(id + ' left the room ' + pubkey)
    })

    rooms.set(pubkey, room)
  }
}
