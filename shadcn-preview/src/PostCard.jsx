import { human } from '../../client/ui/format.js'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Ellipsis, MessageSquare } from 'lucide-react'
import { AuthorAvatar } from './AuthorAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { authorName, socialHref } from './messages'
import { PostBody } from './PostBody'
import { ShareLink } from './ShareLink'

const actionClass = 'max-sm:px-1.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent dark:hover:bg-accent'
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function PostCard({ post, profile, replyContext, selected, versions, replyCount, branchExpanded, onToggleBranch, own, hidden, muted, blocked, onCompose, onModerate, composeDisabled, readOnly }) {
  const [dialog, setDialog] = useState(null)
  const author = profile?.name?.value || authorName(post)
  const latest = versions[0] || post
  const concealed = blocked || muted || hidden
  return (
    <Card size="sm" className={selected ? "min-w-0 gap-2 ring-muted-foreground/40" : "min-w-0 gap-2"}>
      <CardHeader className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={`Profile for ${author}`}>
          <a href={socialHref(post.author)}><AuthorAvatar name={author} image={concealed ? undefined : profile?.image?.value ?? post.parsed.image} /></a>
        </Button>
        <div className="min-w-0 flex-1">
          <CardTitle className="break-all"><a className="hover:underline focus-visible:underline" href={socialHref(post.author)}>{author}</a></CardTitle>
          <CardDescription className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 whitespace-nowrap">
              <a href={socialHref(post.id)} className="hover:underline focus-visible:underline">
                <time dateTime={new Date(post.timestamp).toISOString()} title={dateFormat.format(post.timestamp)}>{human(post.timestamp)}</time>
              </a>
              {versions.length > 0 && ' · Edited'}
            </span>
            {!concealed && replyContext && (
              <a className="min-w-0 truncate underline-offset-2 hover:underline focus-visible:underline"
                href={socialHref(replyContext.id)}>
                {replyContext.author ? 'Replying to ' + replyContext.author : 'Replying to a message'}
              </a>
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {concealed
          ? (blocked ? 'Author blocked.' : muted ? 'Author muted.' : 'Message hidden.')
          : <PostBody body={latest.parsed.body} attachment={post.parsed} />}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-0.5 bg-transparent px-2 py-0.5">
        {!concealed && (
          <>
            {!readOnly && <Button variant="ghost" size="sm" className={actionClass} disabled={composeDisabled} onClick={event => onCompose('reply', post, '', event)}><MessageSquare /> Reply</Button>}
            {replyCount > 0 && onToggleBranch ? (
              <Button variant="ghost" size="sm" className={actionClass} aria-expanded={branchExpanded} onClick={onToggleBranch}>
                {branchExpanded ? <ChevronDown /> : <ChevronRight />}
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm" className={actionClass}>
                <a href={socialHref(post.id)}>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</a>
              </Button>
            )}
            <ShareLink id={post.id} className={actionClass} />
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className={actionClass + ' ml-auto'} aria-label="More message actions"><Ellipsis /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {own && !concealed && !readOnly && <DropdownMenuItem disabled={composeDisabled} onSelect={() => onCompose('edit', post, latest.parsed.body)}>Edit</DropdownMenuItem>}
            {!concealed && versions.length > 0 && <DropdownMenuItem onSelect={() => setDialog('history')}>Edit history</DropdownMenuItem>}
            {!concealed && <DropdownMenuItem onSelect={() => setDialog('raw')}>View signed data</DropdownMenuItem>}
            {!concealed && <DropdownMenuSeparator />}
            {!blocked && !muted && <DropdownMenuItem onSelect={() => onModerate('hidden', post.id)}>{hidden ? 'Unhide message' : 'Hide message'}</DropdownMenuItem>}
            {!own && !blocked && <DropdownMenuItem onSelect={() => onModerate('muted', post.author)}>{muted ? 'Unmute author' : 'Mute author'}</DropdownMenuItem>}
            {!own && <DropdownMenuItem onSelect={() => onModerate('blocked', post.author)}>{blocked ? 'Unblock author' : 'Block author'}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent className="min-w-0">
          <DialogHeader>
            <DialogTitle>{{ history: 'Edit history', raw: 'Signed message data' }[dialog]}</DialogTitle>
            <DialogDescription>{{ history: 'Signed versions from the original author.', raw: 'The original signed record.' }[dialog]}</DialogDescription>
          </DialogHeader>
          {dialog === 'history' && (
            <ol className="max-h-[60vh] space-y-4 overflow-auto">
              {[...versions, post].map(version => (
                <li key={version.id} className="border-b pb-3">
                  <p className="text-sm text-muted-foreground"><time dateTime={new Date(version.timestamp).toISOString()} title={dateFormat.format(version.timestamp)}>{human(version.timestamp)}</time>{version === post && ' · Original'}</p>
                  <PostBody body={version.parsed.body} />
                </li>
              ))}
            </ol>
          )}
          {dialog === 'raw' && <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">{post.signature}{'\n\n'}{post.content}</pre>}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
