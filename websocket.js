import {bogbot} from 'bogbot'
import { render} from './render.js'

const pubs = new Set()

export const sendWs = async (msg) => {
  pubs.forEach(pub => {
    pub.send(msg)
  })
}

export const makeWs = async (pub) => {
  const ws = new WebSocket(pub)

  ws.onopen = async () => {
    console.log('OPEN')
    pubs.add(ws)
    const p = await bogbot.getPubkeys()
    for (const pub of p) {
      ws.send(pub)
      const latest = await bogbot.getLatest(pub)
      if (latest.text) {
        ws.send(latest.text)
      } else {
        const blob = await bogbot.get(latest.opened.substring(13))
        if (blob) {ws.send(blob)}
      }
      ws.send(latest.sig)
    }
    //below sends everything in the client to a dovepub pds server
    const log = await bogbot.query()
    if (log) {
      for (const msg of log) {
        ws.send(msg.sig)
        if (msg.text) {
          ws.send(msg.text)
        }
        if (!msg.text) {
          const get = await bogbot.get(msg.opened.substring(13))
          if (get) {ws.send(get)}
        }
      }
    }
  }

  ws.onmessage = async (m) => {
    if (m.data.length === 44) {
      //console.log('NEEDS' + m.data)
      const blob = await bogbot.get(m.data)
      if (blob) {
        ws.send(blob)
      }
    } else {
      await render.shouldWe(m.data)
      await bogbot.make(m.data)
      await bogbot.add(m.data)
      await render.blob(m.data)
    }
  }

  ws.onclose = async () => {
    console.log('CLOSED')
    pubs.delete(ws)
  }
}

