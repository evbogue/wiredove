import { useEffect, useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const photoFormats = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function Thumbnail({ file }) {
  const image = useRef(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={image} alt="" className="size-14 shrink-0 rounded-md bg-muted object-cover" />
}

export function PhotoPicker({ input, disabled }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Attach photos" title="Attach photos"
      disabled={disabled} onClick={() => input.current?.click()}><Paperclip /></Button>
  )
}

export function PhotoAttachments({ photos, onChange, input, disabled }) {
  const [error, setError] = useState('')
  return (
    <>
      <input ref={input} type="file" multiple accept={photoFormats.join(',')} hidden disabled={disabled}
        onChange={event => {
          const added = []
          const rejected = []
          for (const file of event.target.files) {
            if (photoFormats.includes(file.type) && file.size > 0 && file.size <= 32 * 1024 * 1024) {
              added.push({ id: crypto.randomUUID(), file, alt: '' })
            } else rejected.push(file.name)
          }
          event.target.value = ''
          if (added.length) onChange([...photos, ...added])
          setError(rejected.length ? 'Choose PNG, JPEG, GIF, or WebP files up to 32 MiB. Could not attach: ' + rejected.join(', ') : '')
        }} />
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {photos.length > 0 && (
        <ul className="space-y-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex min-w-0 items-center gap-2">
              <Thumbnail file={photo.file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{photo.file.name}</p>
                <Input value={photo.alt} placeholder="Alt text" aria-label={`Alt text for photo ${index + 1}`} maxLength={300}
                  disabled={disabled} onChange={event => onChange(photos.map(item =>
                    item.id === photo.id ? { ...item, alt: event.target.value } : item))} />
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove photo ${index + 1}`}
                disabled={disabled} onClick={() => onChange(photos.filter(item => item.id !== photo.id))}><X /></Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
