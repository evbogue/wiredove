import { CircleHelp, Pencil, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EditAuthorProfile } from './EditAuthorProfile'
import { ProfileKeys } from './ProfileKeys'

export function ProfileEditorPopover({ open, saving, identity, initial, onOpen, onClose, onSave, onRestore, busy, canPublish, readOnly }) {
  return (
    <Popover.Root open={open} onOpenChange={next => {
      if (next) onOpen()
      else if (!saving) onClose()
    }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Edit profile"><Pencil aria-hidden="true" /></Button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent>Edit profile</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} aria-label="Edit profile"
          onInteractOutside={event => {
            if (event.target.closest?.('.photo-crop-dialog') || saving) event.preventDefault()
          }}
          onEscapeKeyDown={event => {
            const crop = document.querySelector('.photo-crop-dialog[open]')
            if (crop || saving) event.preventDefault()
            if (crop?.dispatchEvent(new Event('cancel', { cancelable: true }))) crop.close()
          }}
          className="z-50 grid w-[28rem] max-w-[var(--radix-popover-content-available-width)] max-h-[var(--radix-popover-content-available-height)] gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="flex items-center gap-1">
            <h2 className="font-heading text-base font-medium">Edit profile</h2>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="How does my identity work?">
                  <CircleHelp aria-hidden="true" />
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content sideOffset={6} collisionPadding={12} aria-label="How your identity works"
                  className="z-[60] w-72 max-w-[var(--radix-popover-content-available-width)] rounded-lg bg-popover p-3 shadow-md ring-1 ring-foreground/10">
                  Your public key identifies your profile and lets others verify your posts. The private key stays in this browser and signs what you publish.
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <Popover.Close asChild>
              <Button variant="ghost" size="icon-sm" className="ml-auto" disabled={saving} aria-label="Close profile editor"><X aria-hidden="true" /></Button>
            </Popover.Close>
          </div>
          {!readOnly && initial && <EditAuthorProfile key={identity} initial={initial} disabled={busy || !canPublish}
            onSave={onSave} onCancel={onClose} />}
          <ProfileKeys identity={identity} onRestore={onRestore} disabled={busy} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
