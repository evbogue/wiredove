import { createMediaControls } from './client/ui/composer-media.js'
import { IndexedDBBlobStore, HttpBlobStore, putBlob, getBlob } from './anproto_blob.js'

const localStore = new IndexedDBBlobStore('wiredove-media-v1')
const remoteStore = new HttpBlobStore('/blobs')

const mediaType = (mime = '') => mime.startsWith('video/') ? 'video' : 'audio'

export async function storeMedia(input, { onStatus } = {}) {
  const type = mediaType(input.type)
  onStatus?.('Hashing + storing locally…')
  const blob = await putBlob(input, localStore)
  onStatus?.('Uploading verified chunks…')
  const remoteBlob = await putBlob(input, remoteStore)
  if (blob !== remoteBlob) throw new Error('local and remote blob IDs differ')
  onStatus?.('Ready to publish')
  return {
    type,
    blob,
    mime: input.type || (type === 'video' ? 'video/webm' : 'audio/webm'),
    media_name: input.name || `${type}-${Date.now()}.webm`,
    media_size: input.size || 0
  }
}

export async function loadMediaBytes(id) {
  try {
    return await getBlob(id, localStore)
  } catch {
    const bytes = await getBlob(id, remoteStore)
    // Re-store verified reconstructed bytes locally. putBlob re-derives the same ID.
    const cached = await putBlob(bytes, localStore)
    if (cached !== id) throw new Error('downloaded media changed identity')
    return bytes
  }
}

export async function renderMedia(yaml, container) {
  if (!yaml || !yaml.blob || !['audio', 'video'].includes(yaml.type)) return false

  const wrap = document.createElement('div')
  wrap.className = 'media-post'

  const status = document.createElement('div')
  status.className = 'media-status'
  status.textContent = 'Loading verified blob…'
  wrap.appendChild(status)

  const player = document.createElement(yaml.type)
  player.controls = true
  player.preload = 'metadata'
  if (yaml.type === 'video') player.playsInline = true
  player.className = 'media-player'
  wrap.appendChild(player)
  container.appendChild(wrap)

  try {
    const bytes = await loadMediaBytes(yaml.blob)
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: yaml.mime || '' }))
    player.src = objectUrl
    player.addEventListener('emptied', () => URL.revokeObjectURL(objectUrl), { once: true })
    status.textContent = 'Verified ANProto blob'
  } catch (err) {
    status.textContent = 'Media unavailable'
    status.classList.add('error')
    console.warn('media load failed', yaml.blob, err)
  }
  return true
}

// Keep production storage unchanged; the shared widget owns recording/UI.
export function createMediaComposer(options = {}) {
  return createMediaControls({
    ...options,
    persistMedia: blob => storeMedia(blob, options),
    resolveAttachment: async attachment => new Blob([await loadMediaBytes(attachment.blob)], { type: attachment.mime || '' })
  })
}
