import { createMediaControls } from './client/ui/composer-media.js'
import { IndexedDBBlobStore, HttpBlobStore, getBlob, putBlob } from './anproto_blob.js'
import { createAndFS } from './vendor/andfs/andfs.js'
import { createAndFSMediaClient, readAndFSMedia } from './client/andfs.js'
import { defineWiredoveMedia } from './client/ui/media.js'
import { browserStore } from './vendor/andfs/stores.js'
import { an } from './vendor/anproto/an.js'
import { apds } from 'apds'

let legacyStore
const getLegacyStore = () => legacyStore ||= new IndexedDBBlobStore('wiredove-media-v1')
const legacyRemoteStore = new HttpBlobStore('/blobs')
let andfsStorePromise
const getAndFSStore = () => andfsStorePromise ||= browserStore('wiredove-andfs-v1')
const mediaLoaders = new WeakMap()
const mediaLoadObserver = typeof IntersectionObserver === 'undefined'
  ? null
  : new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      mediaLoadObserver.unobserve(entry.target)
      mediaLoaders.get(entry.target)?.()
    }
  }, { rootMargin: '300px' })

async function loadLegacyMediaBytes(id) {
  try {
    return await getBlob(id, getLegacyStore())
  } catch {
    const bytes = await getBlob(id, legacyRemoteStore)
    const cached = await putBlob(bytes, getLegacyStore())
    if (cached !== id) throw new Error('Downloaded legacy media changed identity')
    return bytes
  }
}

export async function storeMedia(input, options = {}) {
  if (options.service?.capabilities?.upload === false) throw Error('Uploads are disabled for this application')
  const localStore = await getAndFSStore()
  const client = createAndFSMediaClient({
    files: createAndFS({ store: localStore }),
    ...(options.service ? { endpoint: options.service.mediaURL + '/api/media', origin: () => options.service.mediaURL } : {}),
    async signPayload(authorization) {
      const keypair = await apds.keypair()
      if (!keypair) throw new Error('Create or import an identity before uploading media')
      return await an.sign(await an.hash(authorization), keypair)
    }
  })
  return await client.upload(input, options)
}

export async function renderMedia(yaml, container) {
  if (!yaml || !['image', 'audio', 'video'].includes(yaml.type)) return false
  if (typeof yaml.andfs === 'string') {
    if (yaml.type === 'image') {
      const { renderAndFSMedia } = await import('./client/ui/media-render.js')
      return renderAndFSMedia(yaml, container)
    }
    defineWiredoveMedia()
    const media = document.createElement('wiredove-media')
    media.mediaOptions = { store: await getAndFSStore() }
    media.attachment = yaml
    container.append(media)
    return true
  }
  if (!yaml.blob || yaml.type === 'image') return false

  const wrap = document.createElement('div')
  wrap.className = 'media-post'
  const status = document.createElement('div')
  status.className = 'media-status'
  status.textContent = 'Media will load when visible'
  wrap.appendChild(status)

  const player = document.createElement(yaml.type)
  player.controls = true
  player.preload = 'metadata'
  if (yaml.type === 'video') player.playsInline = true
  player.className = 'media-player'
  wrap.appendChild(player)
  container.appendChild(wrap)

  player.preload = 'none'
  let started = false
  const load = async () => {
    if (started) return
    started = true
    status.textContent = 'Loading verified legacy media…'
    try {
      const bytes = await loadLegacyMediaBytes(yaml.blob)
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: yaml.mime || '' }))
      player.src = objectUrl
      player.addEventListener('emptied', () => URL.revokeObjectURL(objectUrl), { once: true })
      status.textContent = 'Verified legacy ANProto blob'
    } catch (err) {
      status.textContent = 'Media unavailable'
      status.classList.add('error')
      console.warn('media load failed', yaml.blob, err)
    }
  }
  mediaLoaders.set(wrap, load)
  if (!mediaLoadObserver) {
    await load()
  } else {
    const bounds = wrap.getBoundingClientRect()
    if (bounds.top < window.innerHeight + 300 && bounds.bottom > -300) await load()
    else mediaLoadObserver.observe(wrap)
  }
  return true
}

// Media UI is shared; this adapter supplies authenticated durable storage.
export function createMediaComposer(options = {}) {
  return createMediaControls({
    ...options, persistMedia: blob => storeMedia(blob, options),
    resolveAttachment: async attachment => new Blob([attachment.andfs
      ? await readAndFSMedia(attachment, { store: await getAndFSStore() })
      : await loadLegacyMediaBytes(attachment.blob)], { type: attachment.mime || '' })
  })
}
