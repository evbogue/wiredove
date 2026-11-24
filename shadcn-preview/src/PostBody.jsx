import { useLayoutEffect, useRef } from 'react'
import { renderLegacyMedia } from '../../client/ui/legacy-media.js'
import { disposeMedia, renderAndFSMedia } from '../../client/ui/media-render.js'
import { andfsImageMetadata, andfsSource, attachmentDisplayBody, DEFAULT_MEDIA_MIME, isAndFSPlayableMedia } from '../../client/andfs.js'
import { isMessageHash } from '../../client/protocol.js'
import { fetchPeerMedia } from './peer-media'
import { resolvePeerImage } from './peer-sync'
import { previewMediaStore } from './social'
import { appendFormattedText } from '../../client/ui/body.js'
import { mediaMime } from '../../client/ui/hash-media.js'

function resolvePostLink(href) {
  if (/^\/media\/[A-Za-z0-9_-]{43}$/.test(href)) return href
  if (href.startsWith('/#') && isMessageHash(href.slice(2))) return href.slice(1)
  return undefined
}

function localBlobURL(value) {
  if (!/^blob:https?:\/\/[^\s]+$/.test(value)) return null
  try {
    const url = new URL(value)
    return url.origin === location.origin ? url.href : null
  } catch {
    return null
  }
}

async function renderLocalBlob(target, url, signal) {
  const status = target.ownerDocument.createElement('span')
  status.setAttribute('role', 'status')
  status.textContent = 'Loading local media…'
  target.append(status)
  try {
    const response = await fetch(url, { signal })
    let mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (response.ok && response.body && (!mime || mime === 'application/octet-stream')) {
      const reader = response.body.getReader()
      try {
        const { value } = await reader.read()
        if (value) mime = mediaMime(value)
      } finally {
        await reader.cancel()
      }
    } else await response.body?.cancel()
    if (!response.ok || !DEFAULT_MEDIA_MIME.has(mime)) throw new Error('Unsupported local media')
    if (signal.aborted) return
    const type = mime.split('/')[0]
    const player = target.ownerDocument.createElement(type === 'image' ? 'img' : type)
    player.className = 'max-w-full'
    if (type === 'image') player.alt = 'Local image'
    else { player.controls = true; player.playsInline = true }
    player.addEventListener('error', () => {
      status.textContent = 'Local media is unavailable.'
      player.replaceWith(status)
    }, { once: true, signal })
    player.src = url
    status.replaceWith(player)
  } catch {
    if (!signal.aborted) status.textContent = 'Local media is unavailable.'
  }
}

export function PostBody({ body, attachment }) {
  const container = useRef(null)
  useLayoutEffect(() => {
    const target = container.current
    const fragment = target.ownerDocument.createDocumentFragment()
    const playable = isAndFSPlayableMedia(attachment) ? attachment : null
    const localBlob = localBlobURL((body || '').trim().replace(/^blob:http(s?)\\:/, 'blob:http$1:'))
    if (localBlob && !playable) {
      const controller = new AbortController()
      target.replaceChildren()
      void renderLocalBlob(target, localBlob, controller.signal)
      return () => controller.abort()
    }
    appendFormattedText(fragment, playable ? attachmentDisplayBody({ ...playable, body }) : body, {
      resolveLink: resolvePostLink,
      hashtags: false,
      acceptMarkdownImage: src => Boolean(andfsImageMetadata(src) || localBlobURL(src) || isMessageHash(src)),
      resolveImage: resolvePeerImage,
      showUnavailableAlt: true,
      mediaOptions: { store: previewMediaStore, fetchImpl: fetchPeerMedia, resolveLocalBlob: localBlobURL },
    })
    target.replaceChildren(fragment)
    if (!playable) renderLegacyMedia(attachment, target)
    if (playable) {
      renderAndFSMedia(playable, target, { store: previewMediaStore, fetchImpl: fetchPeerMedia })
      if (playable.type === 'video') {
        const link = target.ownerDocument.createElement('a')
        try { link.href = `${andfsSource(playable, location.origin)}/media/${playable.andfs}` }
        catch { return () => disposeMedia(target) }
        link.textContent = 'Direct video link'
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        target.append(link)
      }
    }
    return () => disposeMedia(target)
  }, [body, attachment])

  return <div ref={container} className="preview-post-body overflow-x-auto [overflow-wrap:anywhere]" />
}
