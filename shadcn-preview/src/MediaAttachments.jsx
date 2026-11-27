import { useEffect, useRef, useState } from 'react'
import { AudioLines, Film, Paperclip, X } from 'lucide-react'
import { createImageGallery } from '../../client/ui/image-gallery.js'
import { DEFAULT_MEDIA_MIME } from '../../client/andfs.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const isPhoto = ({ type }) => type.startsWith('image/')
const formatIcon = { audio: AudioLines, video: Film }

function Thumbnail({ file }) {
  const image = useRef(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={image} alt="" className="size-14 shrink-0 rounded-md bg-muted object-cover" />
}

export function DraftAttachmentsPreview({ attachments }) {
  const photos = useRef(null)
  const playable = useRef(null)
  const media = attachments.find(({ file }) => !isPhoto(file))
  useEffect(() => {
    const target = photos.current
    const images = attachments.filter(({ file }) => isPhoto(file))
      .map(({ file, alt }) => ({ src: URL.createObjectURL(file), alt: alt.trim() }))
    if (!images.length) return
    const sources = new Set(images.map(image => image.src))
    const gallery = createImageGallery({
      images, layout: 'card', document: target.ownerDocument,
      mediaOptions: { resolveLocalBlob: src => sources.has(src) ? src : null },
    })
    target.append(gallery)
    return () => {
      gallery.remove()
      for (const src of sources) URL.revokeObjectURL(src)
    }
  }, [attachments])
  useEffect(() => {
    if (!media) return
    const url = URL.createObjectURL(media.file)
    playable.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [media])

  return <>
    <div ref={photos} className="empty:hidden" />
    {media?.file.type.startsWith('audio/') && <audio ref={playable} controls preload="metadata" className="max-w-full" />}
    {media?.file.type.startsWith('video/') && <video ref={playable} controls playsInline preload="metadata" className="max-h-96 max-w-full rounded-md" />}
  </>
}

export function MediaPicker({ input, disabled }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Attach media" title="Attach media"
      disabled={disabled} onClick={() => input.current?.click()}><Paperclip /></Button>
  )
}

export function MediaAttachments({ attachments, onChange, input, disabled }) {
  const photos = attachments.filter(({ file }) => isPhoto(file))
  const [error, setError] = useState('')
  return (
    <>
      <input ref={input} type="file" multiple accept={[...DEFAULT_MEDIA_MIME].join(',')} hidden disabled={disabled}
        onChange={event => {
          const added = []
          const rejected = []
          let hasPlayable = attachments.some(({ file }) => !isPhoto(file))
          for (const file of event.target.files) {
            if (DEFAULT_MEDIA_MIME.has(file.type) && file.size > 0 && file.size <= 32 * 1024 * 1024) {
              const playable = !isPhoto(file)
              if (playable && hasPlayable) {
                rejected.push(file.name)
                continue
              }
              hasPlayable ||= playable
              added.push({ id: crypto.randomUUID(), file, alt: '' })
            } else rejected.push(file.name)
          }
          event.target.value = ''
          if (added.length) onChange([...attachments, ...added])
          setError(rejected.length ? 'Choose photos and up to one audio or video file, each up to 32 MiB. Could not attach: ' + rejected.join(', ') : '')
        }} />
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map(attachment => {
            const Icon = formatIcon[attachment.file.type.split('/')[0]]
            return (
              <li key={attachment.id} className="flex min-w-0 items-center gap-2">
                {Icon ? <Icon aria-hidden="true" className="mx-4 size-6 shrink-0" /> : <Thumbnail file={attachment.file} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{attachment.file.name}</p>
                  {isPhoto(attachment.file) && <Input value={attachment.alt} placeholder="Describe this photo…" aria-label={`Alt text for photo ${photos.indexOf(attachment) + 1}`} maxLength={300}
                    disabled={disabled} onChange={event => onChange(attachments.map(item =>
                      item.id === attachment.id ? { ...item, alt: event.target.value } : item))} />}
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${attachment.file.name}`}
                  disabled={disabled} onClick={() => onChange(attachments.filter(item => item.id !== attachment.id))}><X /></Button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
