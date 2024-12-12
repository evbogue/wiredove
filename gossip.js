import { joinRoom } from 'https://esm.sh/gh/evbogue/bog5@38ac1c121f/lib/trystero-torrent.min.js'

export const rooms = new Map()

const queue = new Set()

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
  }

  ask()
}

export const makeRoom = async (pubkey) => {
  const room = joinRoom({appId: 'wiredove1', password: 'iajwoiejfaowiejfoiwajfe'}, pubkey)

  console.log('Joining: ' + pubkey)

  const [ sendHash, onHash ] = room.makeAction('hash')
  const [ sendBlob, onBlob ] = room.makeAction('blob')

  room.sendHash = sendHash
  room.sendBlob = sendBlob

  onHash(async (hash, id) => {

  }) 

  onBlob(async (blob, id) => {

  })

  room.onPeerJoin(async (id) => {
    console.log(id + ' joined the room ' + pubkey)
  })

  room.onPeerLeave(id => {
    console.log(id + ' left the room ' + pubkey)
  })

  rooms.set(pubkey, room)
}
