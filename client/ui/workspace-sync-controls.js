import { h } from 'h'
import { getRelayStatus, makeWs, stopWs } from '../../websocket.js'
import { getPeers, hasRoom, makeRoom, setPeerEnabled, stopRoom } from '../../gossip.js'
import { resumeQueue } from '../../network_queue.js'

const knownRelay = 'wss://pub.wiredove.net/'
const storageKey = 'anbot:custom-apds'

function relayAddress(value) {
  const url = new URL(value.trim())
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw Error('Enter a ws:// or wss:// relay URL without credentials or fragments.')
  }
  return url.href
}

function control(label, change, refresh, isActive) {
  const input = h('input', { type: 'checkbox' })
  input.setAttribute('role', 'switch')
  const info = h('span')
  input.addEventListener('change', async () => {
    input.disabled = true
    try {
      await change(input.checked)
      if (isActive()) refresh()
    } catch {
      if (isActive()) {
        input.checked = !input.checked
        info.textContent = 'Could not change this connection.'
      }
    } finally { input.disabled = false }
  })
  return { input, info, node: h('label', {}, [input, ' ' + label + ' ', info]) }
}

export function getPeerTransportControls({ signal, isActive }) {
  const relayList = h('ul')
  const peerList = h('ul')
  const relays = new Map()
  const peers = new Map()
  const setRelay = (url, enabled) => {
    if (!enabled) { stopWs(url); return }
    resumeQueue()
    return makeWs(url, { waitForReady: false, catchUp: true })
  }
  const refresh = () => {
    for (const [url, row] of relays) {
      const state = getRelayStatus(url)
      row.input.checked = state.enabled
      const time = state.lastPollAt ? new Date(state.lastPollAt).toLocaleTimeString() : 'none this session'
      row.info.textContent = state.enabled
        ? (state.connected ? 'Connected' : state.polling) + ' · Last poll ' + time : 'Off'
    }
    trystero.input.checked = hasRoom()
    const connected = getPeers()
    trystero.info.textContent = hasRoom() ? connected.length + ' connected peers' : 'Off'
    const ids = new Set(connected.map(peer => peer.id))
    for (const [id, row] of peers) {
      if (!ids.has(id)) { row.item.remove(); peers.delete(id) }
    }
    for (const peer of connected) {
      let row = peers.get(peer.id)
      if (!row) {
        row = control(peer.id, enabled => setPeerEnabled(peer.id, enabled), refresh, isActive)
        row.item = h('li', {}, [row.node])
        peers.set(peer.id, row)
        peerList.append(row.item)
      }
      row.input.checked = peer.enabled
      row.info.textContent = peer.enabled ? 'Syncing' : 'Paused'
    }
  }
  const add = url => {
    if (relays.has(url)) return
    const row = control(url, enabled => setRelay(url, enabled), refresh, isActive)
    relays.set(url, row)
    relayList.append(h('li', {}, [row.node]))
  }
  const trystero = control('Trystero', enabled => {
    if (!enabled) return stopRoom()
    resumeQueue()
    return makeRoom('wiredovev1')
  }, refresh, isActive)
  add(knownRelay)
  try {
    for (const value of JSON.parse(localStorage.getItem(storageKey) || '[]')) {
      try { add(relayAddress(value)) } catch {}
    }
  } catch {}
  const address = h('input', { type: 'url', required: true, placeholder: 'wss://relay.example.com/' })
  const status = h('p')
  status.setAttribute('role', 'status')
  const submit = h('button', { type: 'submit' }, ['Add APDS relay'])
  const form = h('form', { classList: 'workspace-git-compare-form' }, [
    h('label', {}, ['APDS WebSocket URL', address]), submit,
  ])
  form.addEventListener('submit', async event => {
    event.preventDefault()
    submit.disabled = true
    try {
      const url = relayAddress(address.value)
      if (relays.has(url)) throw Error('This relay is already listed.')
      await setRelay(url, true)
      if (!isActive()) return
      add(url)
      refresh()
      address.value = ''
      status.textContent = 'Relay added.'
      try { localStorage.setItem(storageKey, JSON.stringify([...relays.keys()].filter(key => key !== knownRelay))) }
      catch { status.textContent = 'Relay enabled for this session. The browser could not save the address.' }
    } catch (error) {
      if (isActive()) status.textContent = error.message
    } finally { submit.disabled = false }
  })
  refresh()
  const timer = setInterval(refresh, 1000)
  signal.addEventListener('abort', () => clearInterval(timer), { once: true })
  return h('div', {}, [h('h3', {}, ['APDS relays']), relayList, form, status,
    h('h3', {}, ['Trystero peers']), trystero.node, peerList])
}
