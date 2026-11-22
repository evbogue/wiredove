import { apds } from 'apds'
import { joinRoom } from './trystero-torrent.min.js'
import { deliverToRenderers } from './client/runtime/render-delivery.js'
import { noteReceived, registerNetworkSenders } from './network_queue.js'
import { isBlockedAuthor } from './moderation.js'

export let chan

let roomReadyResolver
const createRoomReady = () => new Promise(resolve => {
  roomReadyResolver = resolve
})
export let roomReady = createRoomReady()

const pausedPeers = new Set()
const peerIds = room => Object.keys(room?.getPeers?.() || {})
const enabledPeers = room => peerIds(room).filter(id => !pausedPeers.has(id))
const canSync = (room, id) => chan === room && !pausedPeers.has(id)

export const getPeers = () => peerIds(chan).map(id => ({ id, enabled: !pausedPeers.has(id) }))
export const setPeerEnabled = (id, enabled) => {
  if (enabled) pausedPeers.delete(id)
  else pausedPeers.add(id)
}

export const sendTry = message => {
  const room = chan
  const targets = enabledPeers(room)
  if (!targets.length) return
  if (message.length === 44) room.sendHash(message, targets)
  else room.sendBlob(message, targets)
}

export const hasRoom = () => !!chan

registerNetworkSenders({
  sendGossip: sendTry,
  hasGossip: () => enabledPeers(chan).length > 0,
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
      if (!canSync(room, id)) return
      console.log(`Received: ${hash}`)
      const get = await apds.get(hash)
      if (!canSync(room, id)) return
      if (get) { sendBlob(get, id)}
      const latest = await apds.getLatest(hash)
      if (!canSync(room, id)) return
      if (latest?.sig) { sendBlob(latest.sig, id) }
    }) 

    onBlob(async (blob, id) => {
      if (!canSync(room, id)) return
      console.log(`Received: ${blob}`)
      noteReceived(blob)
      const author = blob.substring(0, 44)
      if (await isBlockedAuthor(author) || !canSync(room, id)) { return }
      //await process(blob) <-- trystero and ws should use the same process function
      await apds.make(blob)
      if (!canSync(room, id)) return
      await deliverToRenderers('shouldWe', blob)
      await apds.add(blob)
      await deliverToRenderers('blob', blob)
    })

    room.onPeerJoin(async (id) => {
      if (!canSync(room, id)) return
      console.log(id + ' joined the room ' + pubkey)
      const latest = await apds.getLatest(await apds.pubkey())
      if (!canSync(room, id)) return
      if (latest?.hash) {
        sendHash(latest.hash, id)
      } else if (latest?.sig) {
        const sigHash = await apds.hash(latest.sig)
        if (!canSync(room, id)) return
        sendHash(sigHash, id)
      }
    })

    room.onPeerLeave(id => {
      pausedPeers.delete(id)
      console.log(id + ' left the room ' + pubkey)
    })

    chan = room
    roomReadyResolver?.()
  }

  return roomReady
}

export const stopRoom = async () => {
  const previous = chan
  chan = null
  pausedPeers.clear()
  roomReady = createRoomReady()
  await previous?.leave()
}
