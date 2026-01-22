import { apds } from 'apds'
import { render } from './render.js'
import { h } from 'h'
import { composer } from './composer.js'
import { profile } from './profile.js'
import { makeRoom } from './gossip.js'
import { settings, importKey } from './settings.js'
import { adder } from './adder.js'
import { importBlob } from './import.js'
import { send } from './send.js'
import { queueSend } from './network_queue.js'
import { noteInterest } from './sync.js'

const HOME_SEED_COUNT = 3
const HOME_BACKFILL_DEPTH = 6

const parseOpenedTimestamp = (opened) => {
  if (!opened || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isNaN(ts) ? 0 : ts
}

const isHash = (value) => typeof value === 'string' && value.length === 44

const getOpenedFromQuery = async (hash) => {
  if (!hash) { return null }
  const query = await apds.query(hash)
  if (Array.isArray(query) && query[0] && query[0].opened) {
    return query[0].opened
  }
  if (query && query.opened) {
    return query.opened
  }
  return null
}

const expandHomeLog = async (log) => {
  if (!Array.isArray(log) || !log.length) { return log || [] }
  const entries = [...log]
  const seen = new Set(entries.map(entry => entry?.hash).filter(Boolean))
  const seeds = entries.slice(0, HOME_SEED_COUNT)
  for (const seed of seeds) {
    let cursor = seed?.hash
    let depth = 0
    while (cursor && depth < HOME_BACKFILL_DEPTH) {
      const sig = await apds.get(cursor)
      if (!sig) {
        queueSend(cursor)
        break
      }
      const opened = await getOpenedFromQuery(cursor)
      if (!opened || opened.length < 14) { break }
      const contentHash = opened.substring(13)
      const content = await apds.get(contentHash)
      if (!content) {
        queueSend(contentHash)
        break
      }
      const yaml = await apds.parseYaml(content)
      const previous = yaml?.previous
      if (!isHash(previous) || seen.has(previous)) { break }
      queueSend(previous)
      const prevOpened = await getOpenedFromQuery(previous)
      const ts = parseOpenedTimestamp(prevOpened)
      entries.push({ hash: previous, opened: prevOpened, ts })
      seen.add(previous)
      cursor = previous
      depth += 1
    }
  }
  return entries
}

export const route = async () => {
  const src = window.location.hash.substring(1)
  const scroller = h('div', {id: 'scroller'})

  document.body.appendChild(scroller)
  await render.buildReplyIndex()

  if (src === '') {
    let log = await apds.query()
    log = await expandHomeLog(log)
    scroller.dataset.paginated = 'true'
    adder(log || [], src, scroller)
  }

  else if (src === 'settings') {
    if (await apds.pubkey()) {
      scroller.appendChild(await settings())
    } else {
      scroller.appendChild(await importKey())
    }
  }

  else if (src === 'import') {
    scroller.appendChild(await importBlob())
  }

  else if (src.length < 44 && !src.startsWith('?')) {
    try {
      const ar = await fetch('https://pub.wiredove.net/' + src).then(r => r.json())
      if (ar) { localStorage.setItem(src, JSON.stringify(ar))}
      console.log(ar)
      let query = []
      for (const pubkey of ar) {
        noteInterest(pubkey)
        await send(pubkey)
        const q = await apds.query(pubkey)
        if (q) {
          query.push(...q)
        }
      }
      scroller.dataset.paginated = 'true'
      adder(query, src, scroller)
    } catch (err) {console.log(err)}
  } 

  else if (src.length === 44) {
    try {
      noteInterest(src)
      const log = await apds.query(src)
      scroller.dataset.paginated = 'true'
      adder(log || [], src, scroller)
      if (!log || !log[0]) {
        console.log('we do not have it')
        await send(src)
      }
    } catch (err) { console.log(err)}
  } 
  else if (src.startsWith('?')) {
    try {
      const log = await apds.query(src)
      scroller.dataset.paginated = 'true'
      adder(log || [], src, scroller)
    } catch (err) {}
  }
  else if (src.length > 44) {
    const hash = await apds.hash(src)
    const opened = await apds.open(src)
    noteInterest(src.substring(0, 44))
    if (opened) {
      //await makeRoom(src.substring(0, 44))
      await apds.add(src)
    }
    const check = await document.getElementById(hash)
    if (!check) {
      let ts = 0
      if (opened) {
        ts = Number.parseInt(opened.substring(0, 13), 10)
        if (Number.isNaN(ts)) { ts = 0 }
      }
      if (!ts) { ts = Date.now() }
      const div = render.insertByTimestamp(scroller, hash, ts)
      if (!div) { return }
      if (opened) { div.dataset.opened = opened }
      await render.blob(src, { hash, opened })
    }
  }
  setTimeout(() => {
    hljs.highlightAll()
  }, 100)
}

window.onhashchange = async () => {
  while (document.getElementById('scroller')) {
    document.getElementById('scroller').remove()
  }
  if (window.location.hash === '#?') {
    const search = document.getElementById('search')
    search.value = ''
    search.classList = 'material-symbols-outlined'
    window.location.hash = ''
  }
  await route()
}
