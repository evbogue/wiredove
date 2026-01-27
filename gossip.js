import { apds } from 'apds'
import { joinRoom } from './trystero-torrent.min.js'
import { render }  from './render.js'
import { noteReceived, registerNetworkSenders } from './network_queue.js'
import { isBlockedAuthor } from './moderation.js'

export let chan

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

export const sendTry = (m) => {
  if (chan) { sendOverChan(m) }
}

export const hasRoom = () => !!chan

registerNetworkSenders({
  sendGossip: sendTry,
  hasGossip: hasRoom
})

export const makeRoom = async (pubkey) => {
  if (pubkey && pubkey.length === 44 && await isBlockedAuthor(pubkey)) {
    return roomReady
  }
  if (!chan) {
    const room = joinRoom({appId: 'wiredovetestnet', password: 'iajwoiejfaowiejfoiwajfe'}, pubkey)
    const [ sendHash, onHash ] = room.makeAction('hash')
    const [ sendBlob, onBlob ] = room.makeAction('blob')

    room.sendHash = sendHash
    room.sendBlob = sendBlob

    onHash(async (hash, id) => {
      console.log(`Received: ${hash}`)
      noteReceived(hash)
      const get = await apds.get(hash)
      if (get) { sendBlob(get, id)}
      const latest = await apds.getLatest(hash)
      if (latest?.sig) { sendBlob(latest.sig) }
    }) 

    onBlob(async (blob, id) => {
      console.log(`Received: ${blob}`)
      noteReceived(blob)
      const author = blob.substring(0, 44)
      if (await isBlockedAuthor(author)) { return }
      //await process(blob) <-- trystero and ws should use the same process function
      await apds.make(blob)
      await render.shouldWe(blob)
      await apds.add(blob)
      await render.blob(blob)
    })

    room.onPeerJoin(async (id) => {
      console.log(id + ' joined the room ' + pubkey)
      const latest = await apds.getLatest(await apds.pubkey())
      if (latest?.hash) {
        sendHash(latest.hash)
      } else if (latest?.sig) {
        const sigHash = await apds.hash(latest.sig)
        sendHash(sigHash)
      }
    })

    room.onPeerLeave(id => {
      console.log(id + ' left the room ' + pubkey)
    })

    chan = room
    roomReadyResolver?.()
  }

  return roomReady
}
