import { bogbot } from 'bogbot'
import { joinRoom } from 'https://esm.sh/gh/evbogue/bog5@38ac1c121f/lib/trystero-torrent.min.js'
import { render } from './render.js'

export const rooms = new Map()

const queue = new Set()

export const gossip = async (hash) => {
  queue.add(hash)
  let speed = 1

  const ask = async () => {
    const haveBlob = await bogbot.find(hash)
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
          ask()
        }, (100 * speed))
      }
    }
  }

  await ask()
}

export const makeRoom = async (pubkey) => {
  const get = rooms.get(pubkey)

  if (!get) {
    const room = joinRoom({appId: 'wiredove1', password: 'iajwoiejfaowiejfoiwajfe'}, pubkey)

    console.log('Joining: ' + pubkey)

    const [ sendHash, onHash ] = room.makeAction('hash')
    const [ sendBlob, onBlob ] = room.makeAction('blob')

    room.sendHash = sendHash
    room.sendBlob = sendBlob

    onHash(async (hash, id) => {
      console.log(`Received: ${hash}`)
      const get = await bogbot.find(hash)
      if (get) { sendBlob(get, id)}
    }) 

    onBlob(async (blob, id) => {
      console.log(`Recieved: ${blob}`)
      const hash = await bogbot.make(blob)
      await render.blob(hash)
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
