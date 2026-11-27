import { Pencil, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EditAuthorProfile } from './EditAuthorProfile'
import { HelpPopover } from './HelpPopover'
import { ProfileKeys } from './ProfileKeys'

export function ProfileEditorPopover({ open, saving, identity, initial, onOpen, onClose, onSave, onRestore, busy, canSave, localOnly }) {
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
          className="z-50 flex w-[28rem] flex-col max-w-[var(--radix-popover-content-available-width)] max-h-[var(--radix-popover-content-available-height)] overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="flex shrink-0 items-center gap-1 px-4 pt-4 pb-3">
            <h2 className="font-heading text-base font-medium">Edit profile</h2>
            <HelpPopover label="About your profile and identity">
              <p>Your public key identifies your profile and lets others verify your posts. The private key stays in this browser and signs what you publish.</p>
              {localOnly && <p>This preview saves profile changes in this browser.</p>}
            </HelpPopover>
            <Popover.Close asChild>
              <Button variant="ghost" size="icon-sm" className="ml-auto" disabled={saving} aria-label="Close profile editor"><X aria-hidden="true" /></Button>
            </Popover.Close>
          </div>
          {initial && <EditAuthorProfile key={identity} initial={initial} disabled={busy || !canSave} localOnly={localOnly}
            onSave={onSave} onCancel={onClose}>
            <ProfileKeys identity={identity} onRestore={onRestore} disabled={busy} />
          </EditAuthorProfile>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
