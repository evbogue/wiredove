import { bogbot } from 'bogbot'
import { joinRoom } from 'https://esm.sh/gh/evbogue/bog5@38ac1c121f/lib/trystero-torrent.min.js'
import { render } from './render.js'

export const rooms = new Map()

const queue = new Set()

const getLatest = async (pubkey) => {
  const openedlog = await bogbot.getOpenedLog()
  const reversedlog = openedlog.slice().reverse()
  for (const msg of reversedlog) {
    if (msg.author == pubkey) {
      return msg.sig
    }
  } 
}

export const gossip = async (hash) => {
  queue.add(hash)
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
        }, (100 * speed))
      }
    }
  }

  await ask()
}

export const blast = async (blob) => {
  for (const [key, room] of rooms) {
    room.sendBlob(blob)
  }
}

export const makeRoom = async (pubkey, pubkeys) => {
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
      if (pubkeys && pubkeys.has(hash)) {
        const latest = await getLatest(hash)
        if (latest) { room.sendBlob(latest)}
      }
    }) 

    onBlob(async (blob, id) => {
      //console.log(`Received: ${blob}`)
      //const hash = await bogbot.make(blob)
      await render.shouldWe(blob)
      await bogbot.add(blob)
      await render.blob(blob)
    })

    room.onPeerJoin(async (id) => {
      console.log(id + ' joined the room ' + pubkey)
      if (pubkeys && pubkeys.size > 0) {
        pubkeys.forEach(async (key) => {
          room.sendHash(key)
          const latest = await getLatest(key)
          if (latest) {
            room.sendBlob(latest)
          }
        })
      }
    })

    room.onPeerLeave(id => {
      //console.log(id + ' left the room ' + pubkey)
    })

    rooms.set(pubkey, room)
  }
}
