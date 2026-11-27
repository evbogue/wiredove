import { useState } from 'react'
import { ArrowUpRight, CircleHelp, KeyRound } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { requestPreviewReset } from './reset-preview'
import { AuthorAvatar } from './AuthorAvatar'
import { shortPublicKey, socialHref } from './messages'
import { createPreviewIdentity, downloadPreviewIdentity, importPreviewIdentity, readPublicIdentity } from './social'

export function Profile({ name, setName, theme, setTheme, identity, identityError, setIdentity, onNavigate, publicProfile }) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const displayName = name.trim()
  const profileName = publicProfile?.name || displayName || 'Profile'
  const ready = identity !== undefined

  function cancelImport() {
    setImporting(false)
    setFile(null)
  }

  function changeOpen(value) {
    if (busy) return
    cancelImport()
    setConfirmReset(false)
    setNotice(null)
    setOpen(value)
  }

  async function run(operation, message) {
    setBusy(true)
    setNotice(null)
    try {
      await operation()
      if (message) setNotice({ message })
    } catch (error) {
      setNotice({ error: true, message: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <div className="flex min-w-0 items-center">
        {identity && (
          <Button asChild variant="ghost" className="h-9 min-w-0 gap-1 px-1 sm:gap-2 sm:px-2">
            <a href={socialHref(identity)} aria-label="View my profile" title="View my profile" onClick={onNavigate}>
              <AuthorAvatar name={profileName} image={publicProfile?.photo} className="size-5 sm:size-7" />
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="hidden max-w-28 truncate sm:block">{profileName}</span>
                <code className="text-[10px] text-muted-foreground">{shortPublicKey(identity)}</code>
              </span>
            </a>
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={identity ? 'Identity settings' : 'Set up identity'}>
                <KeyRound aria-hidden="true" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{identity ? 'Identity settings' : 'Set up identity'}</TooltipContent>
        </Tooltip>
      </div>
      <DialogContent {...(ready && { 'aria-describedby': undefined })} showCloseButton={!busy} className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-1 pr-8">
            <DialogTitle className="text-lg">{identity || !ready ? 'Identity settings' : 'Set up your identity'}</DialogTitle>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="How does my identity work?">
                  <CircleHelp aria-hidden="true" />
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="center" sideOffset={6} collisionPadding={16} aria-label="How your identity works"
                  className="z-[60] w-72 max-w-[var(--radix-popover-content-available-width)] rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
                  Your public key identifies your profile and lets others verify your posts. Wiredove keeps the private key in this browser and uses it to sign posts and profile updates.
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          {!ready && (
            <DialogDescription>
              {identityError ? 'Wiredove couldn’t load the identity stored in this browser.' : 'Loading identity…'}
            </DialogDescription>
          )}
        </DialogHeader>
        {!ready && identityError && (
          <Button size="sm" className="justify-self-start" disabled={busy} onClick={() => run(async () => {
            setIdentity(await readPublicIdentity() || null)
          }, null)}>Retry loading identity</Button>
        )}
        {ready && (
          <div className="space-y-3">
            {identity && (
              <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">Public key</p>
                <code className="block select-all break-all">{identity}</code>
                <Button asChild variant="ghost" size="sm" className="-ml-2">
                  <a href={socialHref(identity)} onClick={() => { changeOpen(false); onNavigate?.() }}>
                    <ArrowUpRight /> View my profile
                  </a>
                </Button>
              </div>
            )}
            {identity && <p id="identity-backup-warning" className="text-sm text-muted-foreground">Keep your backup private. It contains the key that lets you publish as this identity.</p>}
            <div className="flex flex-wrap gap-2">
              {identity ? (
                <Button variant="outline" size="sm" aria-describedby="identity-backup-warning" disabled={busy}
                  onClick={() => run(downloadPreviewIdentity, 'Backup download started.')}>Download backup</Button>
              ) : (
                <Button size="sm" disabled={busy || importing} onClick={() => run(async () => {
                  setIdentity(await createPreviewIdentity())
                }, 'Identity created.')}>Create identity</Button>
              )}
              {!importing && <Button variant={identity ? 'outline' : 'ghost'} size="sm" disabled={busy}
                onClick={() => { setImporting(true); setNotice(null) }}>Import backup</Button>}
            </div>
          </div>
        )}
        {importing && (
          <form className="space-y-3" onSubmit={event => {
            event.preventDefault()
            if (!file || busy) return
            void run(async () => {
              setIdentity(await importPreviewIdentity(file, identity))
              cancelImport()
            }, 'Identity imported.')
          }}>
            <Field>
              <FieldLabel htmlFor="identity-backup">Wiredove backup file</FieldLabel>
              <Input id="identity-backup" type="file" accept=".txt,.json,text/plain,application/json" disabled={busy}
                onChange={event => setFile(event.target.files[0] || null)} />
            </Field>
            {identity && <p className="text-sm text-muted-foreground">Importing replaces this preview’s current identity. Download its backup first if you want to keep it.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!file || busy}>{identity ? 'Replace identity' : 'Import identity'}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancelImport}>Cancel</Button>
            </div>
          </form>
        )}
        {notice && <Alert role={notice.error ? 'alert' : 'status'} variant={notice.error ? 'destructive' : 'default'}><AlertDescription>{notice.message}</AlertDescription></Alert>}
        <div className="grid gap-3 border-t pt-4">
          <Field>
            <FieldLabel htmlFor="display-name">Display name for new posts</FieldLabel>
            <Input id="display-name" autoComplete="nickname" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="dark-mode" checked={theme === 'dark'} onCheckedChange={value => setTheme(value ? 'dark' : 'light')} />
            <FieldLabel htmlFor="dark-mode">Dark mode</FieldLabel>
          </Field>
          {confirmReset ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p>This clears the preview’s identity, drafts, pending posts, preferences, and cached posts and media on this browser. Download your identity backup first if you want to keep it. Posts already shared stay available on the server and peers.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" size="sm" disabled={busy} onClick={() => run(requestPreviewReset, 'Resetting local data…')}>Delete local data</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            </div>
          ) : <Button variant="ghost" size="sm" className="-ml-2 justify-self-start text-muted-foreground" disabled={busy} onClick={() => setConfirmReset(true)}>Reset local data</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
