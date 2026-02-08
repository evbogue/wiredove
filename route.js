import { apds } from 'apds'
import { render } from './render.js'
import { h } from 'h'
import { composer } from './composer.js'
import { buildShareMessage, parseSharePayload } from './share.js'
import { profile } from './profile.js'
import { makeRoom } from './gossip.js'
import { settings, importKey } from './settings.js'
import { adder } from './adder.js'
import { importBlob } from './import.js'
import { send } from './send.js'
import { queueSend } from './network_queue.js'
import { noteInterest } from './sync.js'
import { isBlockedAuthor } from './moderation.js'
import { buildProfileHeader } from './profile_header.js'

const HOME_SEED_COUNT = 3
const HOME_BACKFILL_DEPTH = 6
const COMMUNITY_QUERY_CONCURRENCY = 4
const HOME_EXPAND_CONCURRENCY = 3

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

const mapLimit = async (items, limit, worker) => {
  if (!Array.isArray(items) || !items.length) { return [] }
  const results = new Array(items.length)
  let cursor = 0
  const lanes = Math.max(1, Math.min(limit, items.length))
  const runLane = async () => {
    while (true) {
      const index = cursor
      if (index >= items.length) { return }
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => runLane()))
  return results
}

const expandSeedChain = async (startHash) => {
  if (!startHash) { return [] }
  const discovered = []
  const visited = new Set([startHash])
  let cursor = startHash
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
    if (!isHash(previous) || visited.has(previous)) { break }
    queueSend(previous)
    const prevOpened = await getOpenedFromQuery(previous)
    const ts = parseOpenedTimestamp(prevOpened)
    discovered.push({ hash: previous, opened: prevOpened, ts })
    visited.add(previous)
    cursor = previous
    depth += 1
  }
  return discovered
}

const expandHomeLog = async (log) => {
  if (!Array.isArray(log) || !log.length) { return log || [] }
  const entries = [...log]
  const seen = new Set(entries.map(entry => entry?.hash).filter(Boolean))
  const seeds = entries.slice(0, HOME_SEED_COUNT)
  const chains = await mapLimit(seeds, HOME_EXPAND_CONCURRENCY, async (seed) => {
    return expandSeedChain(seed?.hash)
  })
  for (const chain of chains) {
    if (!Array.isArray(chain) || !chain.length) { continue }
    for (const entry of chain) {
      if (!entry?.hash || seen.has(entry.hash)) { continue }
      entries.push(entry)
      seen.add(entry.hash)
    }
  }
  return entries
}

const waitForFirstRenderedAuthor = (container, timeoutMs = 6000) => new Promise((resolve) => {
  if (!container) { resolve(null); return }
  const existing = container.querySelector('[data-author]')
  if (existing && existing.dataset.author) {
    resolve(existing.dataset.author)
    return
  }
  let resolved = false
  const observer = new MutationObserver(() => {
    if (resolved) { return }
    const found = container.querySelector('[data-author]')
    if (found && found.dataset.author) {
      resolved = true
      observer.disconnect()
      resolve(found.dataset.author)
    }
  })
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-author'] })
  setTimeout(() => {
    if (resolved) { return }
    resolved = true
    observer.disconnect()
    resolve(null)
  }, timeoutMs)
})

export const route = async () => {
  const src = window.location.hash.substring(1)

  const scroller = h('div', {id: 'scroller'})

  document.body.appendChild(scroller)
  await render.buildReplyIndex()

  if (src.startsWith('share=')) {
    const payload = parseSharePayload(src)
    if (payload) {
      const message = buildShareMessage(payload)
      setTimeout(async () => {
        try {
          const compose = await composer(null, { initialBody: message, autoGenKeypair: true })
          document.body.appendChild(compose)
        } catch (err) {
          console.log(err)
        }
      }, 0)
      history.replaceState(null, '', '#')
      if (typeof window.onhashchange === 'function') {
        window.onhashchange()
      }
      return
    }
  }

  if (src === '' || src.startsWith('share=')) {
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
      const pubkeys = Array.isArray(ar) ? ar : []
      const batched = await mapLimit(pubkeys, COMMUNITY_QUERY_CONCURRENCY, async (pubkey) => {
        if (await isBlockedAuthor(pubkey)) { return [] }
        await noteInterest(pubkey)
        await send(pubkey)
        const q = await apds.query(pubkey)
        if (Array.isArray(q)) { return q }
        if (q) { return [q] }
        return []
      })
      const query = batched.flat()
      if (query.length) {
        const primaryKey = Array.isArray(ar) && ar.length ? ar[0] : null
        const header = await buildProfileHeader({ label: src, messages: query, canEdit: false, pubkey: primaryKey })
        if (header) { scroller.appendChild(header) }
      } else {
        const primaryKey = Array.isArray(ar) && ar.length ? ar[0] : null
        const header = await buildProfileHeader({ label: src, messages: [], canEdit: false, pubkey: primaryKey })
        if (header) { scroller.appendChild(header) }
      }
      scroller.dataset.paginated = 'true'
      adder(query, src, scroller)
    } catch (err) {console.log(err)}
  } 

  else if (src.length === 44) {
    try {
      if (await isBlockedAuthor(src)) { return }
      const selfKey = await apds.pubkey()
      await noteInterest(src)
      const log = await apds.query(src)
      const canEdit = !!(selfKey && selfKey === src)
      scroller.dataset.paginated = 'true'
      adder(log || [], src, scroller)
      void waitForFirstRenderedAuthor(scroller).then(async (author) => {
        if (!author || author !== src) { return }
        const header = await buildProfileHeader({ label: src.substring(0, 10), messages: log || [], canEdit, pubkey: src })
        if (header) { scroller.prepend(header) }
      })
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
    const author = src.substring(0, 44)
    if (await isBlockedAuthor(author)) { return }
    await noteInterest(author)
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
