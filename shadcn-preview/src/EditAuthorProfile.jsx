import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createProfileEditor } from '../../client/ui/profile-editor.js'
import { resolveImageSource } from '../../client/ui/image-source.js'
import { fetchPeerMedia } from './peer-media'
import { resolvePeerImage } from './peer-sync'
import { previewMediaStore } from './social'
import './profile-editor.css'

const mediaOptions = { store: previewMediaStore, fetchImpl: fetchPeerMedia }

export function EditAuthorProfile({ initial, onSave, onCancel, onDraft, disabled, localOnly, children }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formId = useId()
  const mount = useRef(null)
  const editor = useRef(null)
  const photo = useRef(initial.draft?.photo || null)

  const captureDraft = useCallback(() => {
    const widget = editor.current
    onDraft(initial.id, {
      name: widget.nameInput.value,
      bio: widget.bioInput.value,
      links: widget.linksEditor.getDraftLinks(),
      photo: photo.current,
    })
  }, [initial.id, onDraft])

  useLayoutEffect(() => {
    const controller = new AbortController()
    const widget = createProfileEditor({
      ...initial, ...initial.draft, draftPhoto: photo.current, mediaOptions, helpOnDemand: true,
      onLinkRowsChange: captureDraft,
      onImageChange(data, file, { original, crop }) {
        photo.current = { data, file, original, crop }
        captureDraft()
      },
    })
    if (initial.draft) widget.linksEditor.setDraftLinks(initial.draft.links)
    editor.current = widget
    mount.current.replaceChildren(widget.photo, widget.fields)
    widget.nameInput.focus({ preventScroll: true })
    function keepNameVisible() {
      if (document.activeElement === widget.nameInput) widget.nameInput.scrollIntoView({ block: 'nearest' })
    }
    window.visualViewport?.addEventListener('resize', keepNameVisible)
    if (initial.image && !photo.current) {
      void resolveImageSource({ src: initial.image }, resolvePeerImage, controller.signal, false, mediaOptions)
        .then(src => {
          if (src && !controller.signal.aborted && !photo.current) widget.image.src = src
        }).catch(() => {})
    }
    return () => {
      controller.abort()
      window.visualViewport?.removeEventListener('resize', keepNameVisible)
    }
  }, [initial, captureDraft])

  async function save(event) {
    event.preventDefault()
    if (busy || disabled) return
    const widget = editor.current
    const name = widget.nameInput.value.trim()
    setError('')
    let links
    try {
      if (!name) {
        widget.nameInput.focus()
        throw Error('Enter a display name.')
      }
      links = widget.linksEditor.getLinks()
    } catch (error) {
      if (!widget.linksEditor.showLinkError(error)) setError(error.message)
      return
    }
    try {
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
    <>
      <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-4">
        <form id={formId} className="preview-profile-editor space-y-4" noValidate onInput={captureDraft} onSubmit={save}>
          <div ref={mount} className="space-y-4" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
        {children}
      </div>
      <div className="flex shrink-0 gap-2 border-t px-4 py-3">
        <Button type="submit" form={formId} disabled={busy || disabled}>{busy ? 'Saving…' : localOnly ? 'Save locally' : 'Save profile'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </>
  )
}
