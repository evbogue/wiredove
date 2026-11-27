import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createProfileEditor } from '../../client/ui/profile-editor.js'
import { resolveImageSource } from '../../client/ui/image-source.js'
import { fetchPeerMedia } from './peer-media'
import { resolvePeerImage } from './peer-sync'
import { previewMediaStore } from './social'
import './profile-editor.css'

const mediaOptions = { store: previewMediaStore, fetchImpl: fetchPeerMedia }

export function EditAuthorProfile({ initial, onSave, onCancel, disabled, localOnly }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mount = useRef(null)
  const editor = useRef(null)
  const photo = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    const widget = createProfileEditor({
      ...initial, mediaOptions, helpOnDemand: true,
      onImageChange(_data, file, { original, crop }) {
        photo.current = { file, original, crop }
      },
    })
    editor.current = widget
    mount.current.replaceChildren(widget.photo, widget.fields)
    widget.nameInput.focus()
    if (initial.image) {
      void resolveImageSource({ src: initial.image }, resolvePeerImage, controller.signal, false, mediaOptions)
        .then(src => {
          if (src && !controller.signal.aborted && !photo.current) widget.image.src = src
        }).catch(() => {})
    }
    return () => controller.abort()
  }, [initial])

  async function save(event) {
    event.preventDefault()
    if (busy || disabled) return
    const widget = editor.current
    const name = widget.nameInput.value.trim()
    setError('')
    try {
      if (!name) throw Error('Enter a display name.')
      const links = widget.linksEditor.getLinks()
      setBusy(true)
      widget.disabled = true
      await onSave({ name, bio: widget.bioInput.value.trim(), links }, photo.current)
    } catch (error) {
      setError(error.message)
    } finally {
      widget.disabled = false
      setBusy(false)
    }
  }

  return (
    <form className="preview-profile-editor space-y-4" noValidate onSubmit={save}>
      <div ref={mount} className="space-y-4" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || disabled}>{busy ? 'Saving…' : localOnly ? 'Save locally' : 'Save profile'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
