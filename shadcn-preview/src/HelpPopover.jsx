import { CircleHelp } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'

export function HelpPopover({ label, children }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
          <CircleHelp aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="center" sideOffset={6} collisionPadding={16} aria-label={label}
          className="z-[60] w-72 max-w-[var(--radix-popover-content-available-width)] space-y-2 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
