import { bogbot } from 'bogbot'
import { joinRoom } from 'https://esm.sh/gh/evbogue/bog5@38ac1c121f/lib/trystero-torrent.min.js'
import { render } from './render.js'

export const rooms = new Map()

const queue = new Set()

export const gossip = async (hash) => {
  queue.add(hash)
  let speed = 1

  const ask = async () => {
    const haveBlob = await bogbot.get(hash)
    const log = await bogbot.getLog()
    const havePost = await log.includes(hash)
    if (haveBlob || havePost) {
      queue.delete(hash)
    }
    if (queue.has(hash)) {
      speed++
      const values = [...rooms.values()]
      const room = values[Math.floor(Math.random() * values.length)]
      if (room && room.sendHash) {
        console.log('Asking for ' + hash)
        room.sendHash(hash)
        setTimeout(() => {
          if (speed === 100) {
            queue.delete(hash)
          }
          ask()
        }, (1000 * speed))
      }
    }
  }

  await ask()
}

export const blast = async (blob) => {
  if (rooms.size) {
    rooms.forEach(room => {
      room.sendBlob(blob)
    })
  }
}

export const makeRoom = async (pubkey) => {
  const get = rooms.get(pubkey)

  if (!get) {
    const room = joinRoom({appId: 'wiredovetestnet', password: 'iajwoiejfaowiejfoiwajfe'}, pubkey)

    console.log('Joining: ' + pubkey)

    const [ sendHash, onHash ] = room.makeAction('hash')
    const [ sendBlob, onBlob ] = room.makeAction('blob')

    room.sendHash = sendHash
    room.sendBlob = sendBlob

    onHash(async (hash, id) => {
      console.log(`Received: ${hash}`)
      const get = await bogbot.get(hash)
      if (get) { sendBlob(get, id)}
    }) 

    onBlob(async (blob, id) => {
      console.log(`Received: ${blob}`)
      const hash = await bogbot.make(blob)
      try {
        await render.blob(blob)
        const opened = await bogbot.open(blob)
        if (opened) {
          await bogbot.add(blob)
          const check = document.getElementById(hash)
          if (!check) {
            await render.hash(hash, document.getElementById('scroller'))
          }
        }
      } catch (err) { 
        await render.blob(blob)
        //console.log(err)
      }
    })

    room.onPeerJoin(async (id) => {
      console.log(id + ' joined the room ' + pubkey)
    })

    room.onPeerLeave(id => {
      console.log(id + ' left the room ' + pubkey)
    })

    rooms.set(pubkey, room)
  }
}
