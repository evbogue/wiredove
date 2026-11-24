import { useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveImageSource, safeImageURL } from '../../client/ui/image-source.js'
import { isMessageHash } from '../../client/protocol.js'
import { fetchPeerMedia } from './peer-media'
import { resolvePeerImage } from './peer-sync'
import { previewMediaStore } from './social'

const mediaOptions = { store: previewMediaStore, fetchImpl: fetchPeerMedia }

export function AuthorAvatar({ name, image, className, fallbackClassName }) {
  const target = useRef(null)
  const [photo, setPhoto] = useState(null)

  useEffect(() => {
    if (!image) return
    const controller = new AbortController()
    let unsubscribe
    let observer
    async function load() {
      const src = safeImageURL(image, { resolved: true }) && image.startsWith('data:image/')
        ? image
        : await resolveImageSource({ src: image }, resolvePeerImage, controller.signal, false, mediaOptions).catch(() => null)
      if (src && !controller.signal.aborted) setPhoto({ image, src })
    }
    function start() {
      if (controller.signal.aborted) return
      observer?.disconnect()
      void load()
      if (isMessageHash(image)) {
        unsubscribe = resolvePeerImage.subscribe(image, ({ state }) => {
          if (state === 'received') void load()
        })
      }
    }
    if (typeof IntersectionObserver === 'undefined') start()
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) start()
      })
      observer.observe(target.current)
    }
    return () => {
      observer?.disconnect()
      unsubscribe?.()
      controller.abort()
    }
  }, [image])

  return (
    <Avatar ref={target} className={className} aria-hidden="true">
      {photo && photo.image === image && <AvatarImage key={image} src={photo.src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className={fallbackClassName}>{Array.from(name).slice(0, 2).join('').toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}
