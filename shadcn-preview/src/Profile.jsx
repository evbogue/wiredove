import { Button } from '@/components/ui/button'
import { AuthorAvatar } from './AuthorAvatar'
import { shortPublicKey, socialHref } from './messages'

export function Profile({ name, identity, onNavigate, publicProfile }) {
  if (!identity) return null
  const profileName = publicProfile?.name || name.trim() || 'Profile'

  return (
    <Button asChild variant="ghost" className="h-9 min-w-0 gap-1 px-1 sm:gap-2 sm:px-2">
      <a href={socialHref(identity)} aria-label="View my profile" title="View my profile" onClick={onNavigate}>
        <AuthorAvatar name={profileName} image={publicProfile?.photo} className="size-5 sm:size-7" />
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="hidden max-w-28 truncate sm:block">{profileName}</span>
          <code className="text-[10px] text-muted-foreground">{shortPublicKey(identity)}</code>
        </span>
      </a>
    </Button>
  )
}
