import { apds } from 'apds'
import { joinRoom } from './trystero-torrent.min.js'
import { render }  from './render.js'

export let chan
const gossipQueue = []

let roomReadyResolver
const createRoomReady = () => new Promise(resolve => {
  roomReadyResolver = resolve
})
export let roomReady = createRoomReady()

const sendOverChan = (m) => {
  if (m.length === 44) {
    chan.sendHash(m)
  } else {
    chan.sendBlob(m)
  }
}

const flushGossipQueue = () => {
  while (gossipQueue.length && chan) {
    sendOverChan(gossipQueue.shift())
  }
}

export const sendTry = (m) => {
  if (chan) {
    sendOverChan(m)
  } else {
    gossipQueue.push(m)
  }
}

export const makeRoom = async (pubkey) => {
  if (!chan) {
    const room = joinRoom({appId: 'wiredovetestnet', password: 'iajwoiejfaowiejfoiwajfe'}, pubkey)
    const [ sendHash, onHash ] = room.makeAction('hash')
    const [ sendBlob, onBlob ] = room.makeAction('blob')

    room.sendHash = sendHash
    room.sendBlob = sendBlob

    onHash(async (hash, id) => {
      console.log(`Received: ${hash}`)
      const get = await apds.get(hash)
      if (get) { sendBlob(get, id)}
      const latest = await apds.getLatest(hash)
      if (latest) { sendBlob(latest.sig)}
    }) 

    onBlob(async (blob, id) => {
      console.log(`Received: ${blob}`)
      //await process(blob) <-- trystero and ws should use the same process function
      await apds.make(blob)
      await render.shouldWe(blob)
      await apds.add(blob)
      await render.blob(blob)
    })

    room.onPeerJoin(async (id) => {
      console.log(id + ' joined the room ' + pubkey)
      const latest = await apds.getLatest(await apds.pubkey()) 
      if (latest) { sendBlob(latest.sig) }
    })

    room.onPeerLeave(id => {
      console.log(id + ' left the room ' + pubkey)
    })

    chan = room
    roomReadyResolver?.()
    flushGossipQueue()
  }

  return roomReady
}
