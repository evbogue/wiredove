import { useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { an } from '../../vendor/anproto/an.js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createPreviewIdentity, readPublicIdentity } from './social'

export function ChoosePublicKey({ open, setOpen, unavailable, onReady, onChoose }) {
  const [candidate, setCandidate] = useState('')
  const [prefix, setPrefix] = useState('')
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const worker = useRef(null)
  const validPrefix = /^[A-Za-z0-9+/]{2}$/.test(prefix)

  function stopSearch() {
    worker.current?.terminate()
    worker.current = null
    setSearching(false)
  }

  useEffect(() => () => worker.current?.terminate(), [])

  function changeOpen(value) {
    if (busy) return
    if (!value) {
      stopSearch()
      setCandidate('')
      setPrefix('')
      setError('')
    }
    setOpen(value)
  }

  async function run(action) {
    setError('')
    setBusy(true)
    try { await action() }
    catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  function search(event) {
    event.preventDefault()
    if (!validPrefix || searching || busy) return
    setError('')
    try {
      const vanity = new Worker(new URL('./vanity-key-worker.js', import.meta.url), { type: 'module' })
      worker.current = vanity
      setSearching(true)
      vanity.onmessage = ({ data }) => {
        stopSearch()
        if (data.error) setError(data.error)
        else setCandidate(data.keypair)
      }
      vanity.onerror = () => {
        stopSearch()
        setError('Could not start the key search. Try again.')
      }
      vanity.postMessage(prefix)
    } catch {
      stopSearch()
      setError('Could not start the key search. Try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0 sm:size-10" aria-label="Choose a public key">
              <KeyRound aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Choose a public key</TooltipContent>
      </Tooltip>
      <DialogContent aria-describedby={undefined} showCloseButton={!busy} className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Choose your public key</DialogTitle>
        </DialogHeader>
        {unavailable ? (
          <div className="space-y-3">
            <p role="status">Wiredove couldn’t load the identity stored in this browser.</p>
            <Button disabled={busy} onClick={() => run(async () => onReady(await readPublicIdentity() || null))}>Retry loading identity</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {candidate && <code className="block select-all break-all rounded-md bg-muted px-3 py-2" aria-live="polite">{candidate.slice(0, 44)}</code>}
              <div className="flex flex-wrap gap-2">
                {candidate && <Button disabled={busy || searching} onClick={() => run(async () => onChoose(await createPreviewIdentity(candidate)))}>Use this key</Button>}
                <Button variant={candidate ? 'outline' : 'default'} disabled={busy || searching}
                  onClick={() => run(async () => setCandidate(await an.gen()))}>{candidate ? 'Regenerate' : 'Generate key'}</Button>
              </div>
            </div>
            <form className="space-y-2 border-t pt-4" onSubmit={search}>
              <Field>
                <FieldLabel htmlFor="vanity-prefix">Two-character prefix</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id="vanity-prefix" className="w-20 font-mono" value={prefix} maxLength={2} autoCapitalize="none"
                    spellCheck={false} autoComplete="off" placeholder="Ab" aria-describedby="vanity-characters" disabled={searching || busy}
                    onChange={event => setPrefix(event.target.value)} />
                  {searching
                    ? <Button type="button" variant="outline" onClick={stopSearch}>Cancel search</Button>
                    : <Button type="submit" variant="outline" disabled={!validPrefix || busy}>Find a matching key</Button>}
                </div>
                <p id="vanity-characters" className="text-xs text-muted-foreground">Case-sensitive. Use letters, digits, + or /.</p>
              </Field>
              {searching && <p role="status" className="text-sm text-muted-foreground">Searching for a matching key…</p>}
            </form>
          </>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
