import { useEffect, useRef, useState } from 'react'
import { AudioLines, Paperclip, X } from 'lucide-react'
import { DEFAULT_MEDIA_MIME } from '../../client/andfs.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const formats = [...DEFAULT_MEDIA_MIME].filter(mime => /^(image|audio)\//.test(mime))

function Thumbnail({ file }) {
  const image = useRef(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={image} alt="" className="size-14 shrink-0 rounded-md bg-muted object-cover" />
}

export function MediaPicker({ input, disabled }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Attach media" title="Attach media"
      disabled={disabled} onClick={() => input.current?.click()}><Paperclip /></Button>
  )
}

export function MediaAttachments({ attachments, onChange, input, disabled }) {
  const photos = attachments.filter(({ file }) => file.type.startsWith('image/'))
  const [error, setError] = useState('')
  return (
    <>
      <input ref={input} type="file" multiple accept={formats.join(',')} hidden disabled={disabled}
        onChange={event => {
          const added = []
          const rejected = []
          let hasAudio = attachments.some(({ file }) => file.type.startsWith('audio/'))
          for (const file of event.target.files) {
            if (formats.includes(file.type) && file.size > 0 && file.size <= 32 * 1024 * 1024) {
              const audio = file.type.startsWith('audio/')
              if (audio && hasAudio) {
                rejected.push(file.name)
                continue
              }
              hasAudio ||= audio
              added.push({ id: crypto.randomUUID(), file, alt: '' })
            } else rejected.push(file.name)
          }
          event.target.value = ''
          if (added.length) onChange([...attachments, ...added])
          setError(rejected.length ? 'Choose photos and up to one audio file, each up to 32 MiB. Could not attach: ' + rejected.join(', ') : '')
        }} />
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map(attachment => (
            <li key={attachment.id} className="flex min-w-0 items-center gap-2">
              {attachment.file.type.startsWith('audio/') ? <AudioLines aria-hidden="true" className="mx-4 size-6 shrink-0" /> : <Thumbnail file={attachment.file} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{attachment.file.name}</p>
                {attachment.file.type.startsWith('image/') && <Input value={attachment.alt} placeholder="Alt text" aria-label={`Alt text for photo ${photos.indexOf(attachment) + 1}`} maxLength={300}
                  disabled={disabled} onChange={event => onChange(attachments.map(item =>
                    item.id === attachment.id ? { ...item, alt: event.target.value } : item))} />}
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${attachment.file.name}`}
                disabled={disabled} onClick={() => onChange(attachments.filter(item => item.id !== attachment.id))}><X /></Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
