import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AuthorAvatar } from './AuthorAvatar'
import { PostBody } from './PostBody'
import { ShareLink } from './ShareLink'

export function AuthorProfile({ id, name, profile, blocked, onUnblock }) {
  const links = profile?.links?.value || []
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <AuthorAvatar name={name} image={blocked ? undefined : profile?.image?.value}
            className="size-16 sm:size-20" fallbackClassName="text-xl" />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="break-words text-2xl font-semibold leading-tight">{name}</h1>
            <code className="block select-all break-all text-xs text-muted-foreground" aria-label="Public key">{id}</code>
          </div>
          {blocked
            ? <Button variant="outline" size="sm" onClick={onUnblock}>Unblock author</Button>
            : <ShareLink key={id} id={id} label="Share profile" variant="outline" />}
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
      </CardContent>
    </Card>
  )
}
