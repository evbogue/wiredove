import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { downloadPreviewIdentity, importPreviewIdentity } from './social'

export function ProfileKeys({ identity, onRestore, disabled }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

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

  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer font-medium">Public key and backups</summary>
      <div className="mt-3 grid gap-3">
        <code className="block select-all break-all rounded-md bg-muted px-3 py-2">{identity}</code>
        <p className="text-muted-foreground">Keep your backup private. It contains the key that lets you publish as this identity.</p>
        <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={busy || disabled}
          onClick={() => run(() => downloadPreviewIdentity(identity), 'Backup download started.')}>Download backup</Button>
        <form className="space-y-2" onSubmit={event => {
          event.preventDefault()
          if (!file || busy || disabled) return
          const form = event.currentTarget
          void run(async () => {
            const key = await importPreviewIdentity(file, identity)
            form.reset()
            setFile(null)
            onRestore(key)
          }, 'Backup restored.')
        }}>
          <Field>
            <FieldLabel htmlFor="profile-backup-file">Restore a Wiredove backup</FieldLabel>
            <Input id="profile-backup-file" type="file" accept=".txt,.json,text/plain,application/json"
              disabled={busy || disabled} onChange={event => setFile(event.target.files[0] || null)} />
          </Field>
          {file && <>
            <p className="text-muted-foreground">Restoring replaces this browser’s current identity. Download its backup first if you want to keep it.</p>
            <Button type="submit" size="sm" variant="outline" disabled={busy || disabled}>Replace identity</Button>
          </>}
        </form>
        {notice && <Alert role={notice.error ? 'alert' : 'status'} variant={notice.error ? 'destructive' : 'default'}>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>}
      </div>
    </details>
  )
}
