import { useState } from 'react'
import { ArrowUpRight, KeyRound, UserRound } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { requestPreviewReset } from './reset-preview'
import { AuthorAvatar } from './AuthorAvatar'
import { shortPublicKey, socialHref } from './messages'
import { createPreviewIdentity, downloadPreviewIdentity, importPreviewIdentity } from './social'

export function Profile({ name, setName, theme, setTheme, identity, identityError, setIdentity, onNavigate, inSidebar = false, publicProfile }) {
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
      setNotice({ message })
    } catch (error) {
      setNotice({ error: true, message: error.message })
    } finally {
      setBusy(false)
    }
  }

  const label = (
    <>
      <Avatar size="sm">
        <AvatarFallback>{displayName ? Array.from(displayName).slice(0, 2).join('').toUpperCase() : <UserRound className="size-3.5" />}</AvatarFallback>
      </Avatar>
      <span className={inSidebar ? 'truncate' : 'hidden truncate sm:inline'}>{displayName || 'Profile'}</span>
    </>
  )

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {inSidebar ? (
        <DialogTrigger asChild>
          <SidebarMenuButton size="lg" aria-label="Profile">{label}</SidebarMenuButton>
        </DialogTrigger>
      ) : (
        <div className="flex min-w-0 items-center">
          {identity && (
            <Button asChild variant="ghost" className="h-9 min-w-0 gap-1 px-1 sm:gap-2 sm:px-2">
              <a href={socialHref(identity)} aria-label="View my profile" title="View my profile">
                <AuthorAvatar name={profileName} image={publicProfile?.photo} className="size-5 sm:size-7" />
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="hidden max-w-28 truncate sm:block">{profileName}</span>
                  <code className="text-[10px] text-muted-foreground">{shortPublicKey(identity)}</code>
                </span>
              </a>
            </Button>
          )}
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Identity settings" title="Identity settings">
              <KeyRound aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </div>
      )}
      <DialogContent aria-describedby={undefined} showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Identity settings</DialogTitle>
        </DialogHeader>
        {identity && (
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <a href={socialHref(identity)} onClick={() => { changeOpen(false); onNavigate?.() }}>
              <ArrowUpRight /> View my profile
            </a>
          </Button>
        )}
        <Field>
          <FieldLabel htmlFor="display-name">Display name for new posts</FieldLabel>
          <Input id="display-name" autoComplete="nickname" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
        </Field>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Public identity key</p>
          <div role="status">
            {identity
              ? <code className="select-all break-all">{identity}</code>
              : <p className="text-muted-foreground">{identityError ? 'Identity is unavailable.' : ready ? 'No identity in this browser yet.' : 'Loading identity…'}</p>}
          </div>
          {ready && (
            <div className="flex flex-wrap gap-2">
              {identity ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(downloadPreviewIdentity, 'Backup download started.')}>Download backup</Button>
              ) : (
                <Button size="sm" disabled={busy || importing} onClick={() => run(async () => {
                  setIdentity(await createPreviewIdentity())
                }, 'Identity created.')}>Create identity</Button>
              )}
              {!importing && <Button variant="outline" size="sm" disabled={busy} onClick={() => { setImporting(true); setNotice(null) }}>Import backup</Button>}
            </div>
          )}
        </div>
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
        {confirmReset ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>This clears the preview’s identity, drafts, pending posts, preferences, and cached posts and media on this browser. Download your identity backup first if you want to keep it. Posts already shared stay available on the server and peers.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" onClick={() => run(requestPreviewReset, 'Resetting local data…')}>Delete local data</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>Cancel</Button>
            </div>
          </div>
        ) : <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmReset(true)}>Reset local data</Button>}
        {notice && <Alert role={notice.error ? 'alert' : 'status'} variant={notice.error ? 'destructive' : 'default'}><AlertDescription>{notice.message}</AlertDescription></Alert>}
        <Field orientation="horizontal">
          <Switch id="dark-mode" checked={theme === 'dark'} onCheckedChange={value => setTheme(value ? 'dark' : 'light')} />
          <FieldLabel htmlFor="dark-mode">Dark mode</FieldLabel>
        </Field>
      </DialogContent>
    </Dialog>
  )
}
