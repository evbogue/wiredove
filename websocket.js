import {apds} from 'apds'
import { render} from './render.js'

const pubs = new Set()
const wsQueue = []

let wsReadyResolver
const createWsReadyPromise = () => new Promise(resolve => {
  wsReadyResolver = resolve
})
export let wsReady = createWsReadyPromise()

const deliverWs = (msg) => {
  pubs.forEach(pub => {
    pub.send(msg)
  })
}

const flushWsQueue = () => {
  while (wsQueue.length) {
    deliverWs(wsQueue.shift())
  }
}

export const sendWs = async (msg) => {
  if (pubs.size) {
    deliverWs(msg)
  } else {
    wsQueue.push(msg)
  }
}

export const makeWs = async (pub) => {
  const ws = new WebSocket(pub)

  ws.onopen = async () => {
    console.log('OPEN')
    pubs.add(ws)
    wsReadyResolver?.()
    flushWsQueue()
    const p = await apds.getPubkeys()
    for (const pub of p) {
      ws.send(pub)
      const latest = await apds.getLatest(pub)
      if (latest.text) {
        ws.send(latest.text)
      } else {
        const blob = await apds.get(latest.opened.substring(13))
        if (blob) {ws.send(blob)}
      }
      ws.send(latest.sig)
    }
    //below sends everything in the client to a dovepub pds server
    //const log = await apds.query()
    //if (log) {
    //  const ar = []
    //  for (const msg of log) {
    //    ws.send(msg.sig)
    //    if (msg.text) {
    //      ws.send(msg.text)
    //      const yaml = await apds.parseYaml(msg.text)
    //      //console.log(yaml)
    //      if (yaml.image && !ar.includes(yaml.image)) {
    //        const get = await apds.get(yaml.image)
    //        if (get) {
    //          ws.send(get)
    //          ar.push(yaml.image)
    //        }
    //      }
    //    }
    //    if (!msg.text) {
    //      const get = await apds.get(msg.opened.substring(13))
    //      if (get) {ws.send(get)}
    //    }
    //  }
    //}
  }

  ws.onmessage = async (m) => {
    if (m.data.length === 44) {
      //console.log('NEEDS' + m.data)
      const blob = await apds.get(m.data)
      if (blob) {
        ws.send(blob)
      }
    } else {
      await render.shouldWe(m.data)
      await apds.make(m.data)
      await apds.add(m.data)
      await render.blob(m.data)
    }
  }

  ws.onclose = async () => {
    console.log('CLOSED')
    pubs.delete(ws)
    if (!pubs.size) {
      wsReady = createWsReadyPromise()
    }
  }

  return wsReady
}
