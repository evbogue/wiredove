import { createMediaControls } from './client/ui/composer-media.js'
import { readLegacyMedia, renderLegacyMedia } from './client/ui/legacy-media.js'
import { createAndFS } from './vendor/andfs/andfs.js'
import { createAndFSMediaClient, readAndFSMedia } from './client/andfs.js'
import { defineWiredoveMedia } from './client/ui/media.js'
import { browserStore } from './vendor/andfs/stores.js'
import { an } from './vendor/anproto/an.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'

let andfsStorePromise
const getAndFSStore = () => andfsStorePromise ||= browserStore('wiredove-andfs-v1')
export async function storeMedia(input, options = {}) {
  if (options.service?.capabilities?.upload === false) throw Error('Uploads are disabled for this application')
  const localStore = await getAndFSStore()
  const client = createAndFSMediaClient({
    files: createAndFS({ store: localStore }),
    ...(options.service ? { endpoint: options.service.mediaURL + '/api/media' } : {}),
    async signPayload(authorization) {
      const keypair = await apds.keypair()
      if (!keypair) throw new Error('Create or import an identity before uploading media')
      return await an.sign(await an.hash(authorization), keypair)
    }
  })
  return await client.upload(input, options)
}

export async function renderMedia(yaml, container, options = {}) {
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
  return renderLegacyMedia(yaml, container, options)
}

// Media UI is shared; this adapter supplies authenticated durable storage.
export function createMediaComposer(options = {}) {
  return createMediaControls({
    ...options, persistMedia: blob => storeMedia(blob, options),
    resolveAttachment: async attachment => new Blob([attachment.andfs
      ? await readAndFSMedia(attachment, { store: await getAndFSStore(), baseURL: options.service?.mediaURL })
      : await readLegacyMedia(attachment, { source: options.service?.legacyMediaURL || options.service?.mediaURL })], { type: attachment.mime || '' })
  })
}
