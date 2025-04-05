import { bogbot } from 'bogbot'
import { makeRoom } from './gossip.js'
import { render } from './render.js'

await bogbot.start('wiredovedbversion1')

const pubs = new Set()

export const send = async (msg) => {
  pubs.forEach(pub => {
    pub.send(msg)
  })
}

const startWs = async (pub) => {
  const ws = new WebSocket(pub)

  ws.onopen = async () => {
    console.log('OPEN')
    pubs.add(ws)
    const log = await bogbot.query()
    if (log) { 
      for (const msg of log) {
        ws.send(msg.sig)
        ws.send(msg.text)
        //ws.send(msg.hash)
        //ws.send(msg.opened.substring(13))
      }
    }
  }

  ws.onmessage = async (m) => {
    await render.shouldWe(m.data)
    await bogbot.add(m.data)
    await render.blob(m.data)

    console.log(m.data)
  }

  ws.onclose = async () => {
    console.log('CLOSED')
    pubs.delete(ws)
  }
}

export const connect = async () => {
  await startWs('wss://pub.wiredove.net')
  //await startWs('ws://localhost:9000')
  const pubkey = await bogbot.pubkey()
  const pubkeys = await bogbot.getPubkeys()
  if (pubkeys) {
    for (const p of pubkeys) {
      await makeRoom(pubkey, pubkeys)    
    }
  }
}
