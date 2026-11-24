import { chan, getPeers, hasRoom, makeRoom, stopRoom } from '../../gossip.js'
import { resumeQueue } from '../../network_queue.js'
import { makeWs, stopWs } from '../../websocket.js'
import { acceptPeerBlob, primePeerFeed } from './peer-sync'
import { preparePeerStorage } from './peer-apds'
import { attachMediaRoom, setMediaRelay } from './peer-media'

export const defaultRelay = 'wss://pub.wiredove.net/'
const relayPreference = 'wiredove-shadcn:default-relay-enabled'
const roomPreference = 'wiredove-shadcn:trystero-enabled'
let startup
let detachMediaRoom

function defaultEnabled(key) {
  try { return localStorage.getItem(key) !== 'false' }
  catch { return true }
}

function savePreference(key, enabled) {
  try { localStorage.setItem(key, String(enabled)) }
  catch { /* The connection can still be changed for this tab. */ }
}

async function updateRelay(url, enabled, beforePoll) {
  if (!enabled) {
    setMediaRelay(url, false)
    stopWs(url)
    return
  }

  await preparePeerStorage()
  resumeQueue()
  try {
    await makeWs(url, { waitForReady: false, catchUp: true, catchUpDelay: 750, beforePoll, acceptBlob: acceptPeerBlob })
    setMediaRelay(url, true)
  } catch (error) {
    stopWs(url)
    throw error
  }
}

async function updateRoom(enabled) {
  if (!enabled) {
    detachMediaRoom?.()
    detachMediaRoom = undefined
    await stopRoom()
    return
  }

  await preparePeerStorage()
  if (hasRoom()) return
  resumeQueue()
  await makeRoom('wiredovev1', { acceptBlob: acceptPeerBlob })
  try {
    detachMediaRoom = attachMediaRoom(chan, () => getPeers().filter(peer => peer.enabled).map(peer => peer.id))
  } catch (error) {
    await stopRoom()
    throw error
  }
}

export function startDefaultPeers() {
  if (startup) return startup
  const enabled = defaultEnabled(relayPreference)
  const recent = primePeerFeed(enabled ? defaultRelay : null)
  startup = Promise.allSettled([
    enabled ? updateRelay(defaultRelay, true, recent) : recent,
    defaultEnabled(roomPreference) ? updateRoom(true) : undefined,
  ]).then(results => {
    for (const result of results) {
      if (result.status === 'rejected') console.warn('Could not start a default peer connection', result.reason)
    }
  })
  return startup
}

export async function setRelayEnabled(url, enabled) {
  await startDefaultPeers()
  await updateRelay(url, enabled)
  if (url === defaultRelay) savePreference(relayPreference, enabled)
}

export async function setRoomEnabled(enabled) {
  await startDefaultPeers()
  await updateRoom(enabled)
  savePreference(roomPreference, enabled)
}
