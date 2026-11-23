import { publicPathID, reservePublicShare } from '../../client/share-link.js'
import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { socialHref } from './messages'

const shareOrigin = import.meta.env.WIREDOVE_PREVIEW_SHARE_ORIGIN

export function ShareLink({ id, label = 'Share', className, variant = 'ghost' }) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('')
  const fallback = shareOrigin ? new URL('/' + publicPathID(id), shareOrigin).href
    : new URL(socialHref(id), location.href).href

  useEffect(() => {
    if (!open || !shareOrigin) return
    const controller = new AbortController()
    reservePublicShare(id, { signal: controller.signal }).then(url => {
      if (!controller.signal.aborted) {
        setResult({ id, url })
        if (!url) setStatus('This item is not on the public server.')
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setResult({ id, url: fallback })
        setStatus('Using the full public link.')
      }
    })
    return () => controller.abort()
  }, [fallback, id, open])

  const link = shareOrigin ? (result?.id === id ? result.url : null) : fallback

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setStatus('Link copied.')
    } catch {
      setStatus('Select the link to copy it manually.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { setOpen(value); setResult(null); setStatus('') }}>
      <DialogTrigger asChild><Button variant={variant} size="sm" className={className}><Link2 /> {label}</Button></DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{label === 'Share' ? 'Share message' : label}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel>{shareOrigin ? 'Share link' : 'Local link'}
            <Input readOnly value={link || ''} onFocus={event => event.target.select()} />
          </FieldLabel>
          <Button onClick={copy} disabled={!link}>Copy link</Button>
          <p role="status">{status || (shareOrigin && result?.id !== id ? 'Preparing link…' : '')}</p>
        </Field>
      </DialogContent>
    </Dialog>
  )
}
