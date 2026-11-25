import { toast } from 'sonner'
import { ArrowUpRight, Copy, MessageSquare, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AuthorAvatar } from './AuthorAvatar'
import { PostBody } from './PostBody'
import { shortPublicKey } from './messages'
import { ShareLink } from './ShareLink'

export function AuthorProfile({ id, name, profile, blocked, onUnblock, onMessage, onEdit, editor, messageDisabled }) {
  const links = profile?.links?.value || []
  async function copyKey() {
    try {
      await navigator.clipboard.writeText(id)
      toast.success('Public key copied')
    } catch {
      toast.error('Could not copy the public key')
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        {editor || <>
          <div className="flex flex-wrap items-start gap-4">
            <AuthorAvatar name={name} image={blocked ? undefined : profile?.image?.value}
              className="size-16 sm:size-20" fallbackClassName="text-xl" />
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="break-words text-2xl font-semibold leading-tight">{name}</h1>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <code title={id}>{shortPublicKey(id)}</code>
                <Button variant="ghost" size="icon-xs" aria-label="Copy public key" title="Copy public key" onClick={copyKey}><Copy /></Button>
              </div>
            </div>
            {blocked
              ? <Button variant="outline" size="sm" onClick={onUnblock}>Unblock author</Button>
              : <div className="flex gap-2">
                  {onEdit && <Button variant="outline" size="icon-sm" aria-label="Edit profile" title="Edit profile"
                    disabled={messageDisabled} onClick={onEdit}><Pencil /></Button>}
                  {onMessage && <Button variant="outline" size="icon-sm" aria-label="Write public message" title="Write public message"
                    disabled={messageDisabled} onClick={onMessage}><MessageSquare /></Button>}
                  <ShareLink key={id} id={id} label="Share profile" variant="outline" iconOnly />
                </div>}
          </div>
          {!blocked && profile?.bio?.value && <div className="text-sm"><PostBody body={profile.bio.value} /></div>}
          {!blocked && links.length > 0 && (
            <ul aria-label="Profile links" className="flex flex-wrap gap-2">
              {links.map(({ label, url }, index) => (
                <li key={index} className="max-w-full">
                  <Button asChild variant="outline" size="sm" className="max-w-full">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <span className="truncate">{label}</span><ArrowUpRight />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>}
      </CardContent>
    </Card>
  )
}
