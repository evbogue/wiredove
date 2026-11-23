import { human } from '../../client/ui/format.js'
import { useState } from 'react'
import { Ellipsis, Link2, MessageSquare } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authorName, socialHref } from './messages'

const actionClass = 'text-muted-foreground hover:bg-accent focus-visible:bg-accent dark:hover:bg-accent'
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function PostCard({ post, versions, replyCount, own, hidden, muted, blocked, onCompose, onModerate, composeDisabled, readOnly }) {
  const [dialog, setDialog] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const author = authorName(post)
  const latest = versions[0] || post
  const concealed = blocked || muted || hidden
  const permalink = new URL(socialHref(post.id), location.href).href

  async function copy() {
    try {
      await navigator.clipboard.writeText(permalink)
      setCopyStatus('Link copied.')
    } catch {
      setCopyStatus('Select the link to copy it manually.')
    }
  }

  return (
    <Card size="sm" className="min-w-0 gap-2">
      <CardHeader className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={`Profile for ${author}`}>
          <a href={socialHref(post.author)}><Avatar><AvatarFallback>{Array.from(author).slice(0, 2).join('').toUpperCase()}</AvatarFallback></Avatar></a>
        </Button>
        <div className="min-w-0">
          <CardTitle className="break-all"><a className="hover:underline focus-visible:underline" href={socialHref(post.author)}>{author}</a></CardTitle>
          <CardDescription>
            <a href={socialHref(post.id)} className="hover:underline focus-visible:underline">
              <time dateTime={new Date(post.timestamp).toISOString()} title={dateFormat.format(post.timestamp)}>{human(post.timestamp)}</time>
            </a>
            {versions.length > 0 && ' · Edited'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        {blocked ? 'Author blocked.' : muted ? 'Author muted.' : hidden ? 'Message hidden.' : latest.parsed.body}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-0.5 bg-transparent px-2 py-0.5">
        {!concealed && (
          <>
            {!readOnly && <Button variant="ghost" size="sm" className={actionClass} disabled={composeDisabled} onClick={() => onCompose('reply', post, '')}><MessageSquare /> Reply</Button>}
            <Button asChild variant="ghost" size="sm" className={actionClass}>
              <a href={socialHref(post.id)}>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</a>
            </Button>
            <Button variant="ghost" size="sm" className={actionClass} onClick={() => { setCopyStatus(''); setDialog('share') }}><Link2 /> Share</Button>
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
            <DialogTitle>{{ share: 'Share message', history: 'Edit history', raw: 'Signed message data' }[dialog]}</DialogTitle>
            <DialogDescription>{{ share: 'Link to this message in the preview.', history: 'Signed versions from the original author.', raw: 'The original signed record.' }[dialog]}</DialogDescription>
          </DialogHeader>
          {dialog === 'share' && (
            <Field>
              <FieldLabel htmlFor={`link-${post.id}`}>Message link</FieldLabel>
              <Input id={`link-${post.id}`} readOnly value={permalink} onFocus={event => event.target.select()} />
              <Button onClick={copy}>Copy link</Button>
              <p role="status">{copyStatus}</p>
            </Field>
          )}
          {dialog === 'history' && (
            <ol className="max-h-[60vh] space-y-4 overflow-auto">
              {[...versions, post].map(version => (
                <li key={version.id} className="border-b pb-3">
                  <p className="text-sm text-muted-foreground"><time dateTime={new Date(version.timestamp).toISOString()} title={dateFormat.format(version.timestamp)}>{human(version.timestamp)}</time>{version === post && ' · Original'}</p>
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{version.parsed.body}</p>
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
