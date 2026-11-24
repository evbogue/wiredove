import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { requestPreviewReset } from './reset-preview'
import { socialHref } from './messages'
import { createPreviewIdentity, downloadPreviewIdentity, importPreviewIdentity } from './social'

export function Profile({ name, setName, theme, setTheme, identity, identityError, setIdentity, onNavigate, inSidebar = false }) {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const displayName = name.trim()
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
      <DialogTrigger asChild>
        {inSidebar
          ? <SidebarMenuButton size="lg" aria-label="Profile">{label}</SidebarMenuButton>
          : <Button variant="ghost" aria-label="Profile" className="min-w-0 max-w-full px-1 sm:px-2">{label}</Button>}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>
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
                <>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => run(downloadPreviewIdentity, 'Backup download started.')}>Download backup</Button>
                  <Button asChild variant="ghost" size="sm"><a href={socialHref(identity)} onClick={() => { changeOpen(false); onNavigate?.() }}>View posts</a></Button>
                </>
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
