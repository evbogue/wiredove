import { useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpPopover } from './HelpPopover'
import { requestPreviewReset } from './reset-preview'

export function Settings({ theme, setTheme }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  function cancelDelete() {
    setConfirming(false)
    setError(null)
  }

  function deleteLocalData() {
    try {
      requestPreviewReset()
    } catch (error) {
      setError(error.message)
    }
  }

  return (
    <Dialog onOpenChange={cancelDelete}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0 sm:size-10" aria-label="Settings">
              <SettingsIcon aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <DialogContent aria-describedby={undefined} className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Settings</DialogTitle>
        </DialogHeader>
        <Field orientation="horizontal">
          <Switch id="dark-mode" checked={theme === 'dark'} onCheckedChange={value => setTheme(value ? 'dark' : 'light')} />
          <FieldLabel htmlFor="dark-mode">Dark mode</FieldLabel>
        </Field>
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={confirming} onClick={() => setConfirming(true)}>Delete local data</Button>
            <HelpPopover label="About deleting local data">
              <p>Deleting local data clears your identity, drafts, pending posts, preferences, and cached posts and media from this browser. Published posts stay on the servers and peers that have them.</p>
            </HelpPopover>
          </div>
          {confirming && (
            <div className="space-y-2 rounded-md border p-3">
              <p id="local-data-warning">This permanently removes your local identity, drafts, and pending posts. Download an identity backup from your profile editor before continuing.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" size="sm" aria-describedby="local-data-warning" onClick={deleteLocalData}>Confirm deletion</Button>
                <Button variant="outline" size="sm" onClick={cancelDelete}>Cancel</Button>
              </div>
              {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
