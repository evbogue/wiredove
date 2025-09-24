import { apds } from 'apds'
import { joinRoom } from './trystero-torrent.min.js'
import { render }  from './render.js'

export let chan

export const sendTry = (m) => {
  if (chan) {
    if (m.length === 44) { chan.sendHash(m)} else {
      chan.sendBlob(m)
    }
  } else {
    setTimeout(() => {sendTry(m)}, 1000)
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
      await render.shouldWe(blob)
      await apds.add(blob)
      await render.blob(blob)
    })

    room.onPeerJoin(async (id) => {
      console.log(id + ' joined the room ' + pubkey)
    })

    room.onPeerLeave(id => {
      console.log(id + ' left the room ' + pubkey)
    })

    chan = room
  }
}
