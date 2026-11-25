import { human } from '../../client/ui/format.js'
import { useEffect, useState } from 'react'
import { readWorkspaceGit, workspaceGitHref } from '../../client/runtime/workspace-git.js'
import { ChevronDown, ChevronRight, Ellipsis, FolderGit2, GitCommitHorizontal, MessageSquare } from 'lucide-react'
import { AuthorAvatar } from './AuthorAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { authorName, socialHref } from './messages'
import { gitCardLinks, gitCardType } from './git-records'
import { PostBody } from './PostBody'
import { ShareLink } from './ShareLink'

const actionClass = 'max-sm:px-1.5 text-muted-foreground hover:bg-accent focus-visible:bg-accent dark:hover:bg-accent'
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function PostCard({ post, repoName, profile, replyContext, recipientContext, selected, versions, replyCount, branchExpanded, onToggleBranch, own, hidden, muted, blocked, onCompose, onModerate, composeDisabled, readOnly }) {
  const [dialog, setDialog] = useState(null)
  const author = profile?.name?.value || authorName(post)
  const latest = versions[0] || post
  const git = gitCardType(post.parsed)
  const concealed = blocked || muted || hidden
  const comparePush = post.gitSummary?.count > 1 && post.gitBase && gitCardLinks(post).comparison
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
            {!concealed && recipientContext && (
              <a className="min-w-0 truncate underline-offset-2 hover:underline focus-visible:underline"
                href={socialHref(recipientContext.id)}>To {recipientContext.name}</a>
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {concealed
          ? (blocked ? 'Author blocked.' : muted ? 'Author muted.' : 'Message hidden.')
          : git ? <GitCardBody post={post} repoName={repoName} />
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
            {own && !git && !concealed && !readOnly && <DropdownMenuItem disabled={composeDisabled} onSelect={() => onCompose('edit', post, latest.parsed.body)}>Edit</DropdownMenuItem>}
            {!concealed && versions.length > 0 && <DropdownMenuItem onSelect={() => setDialog('history')}>Edit history</DropdownMenuItem>}
            {!concealed && comparePush && <DropdownMenuItem asChild><a href={comparePush}>Compare push</a></DropdownMenuItem>}
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

function GitCardBody({ post, repoName }) {
  const { id, repo, repository, revision } = gitCardLinks(post)
  const { commit, description } = post.parsed
  const ref = revision ? post.parsed.ref : post.gitRef
  const repoDescription = typeof description === 'string' ? description.trim().split(/\r?\n/, 1)[0] : ''
  return <div className="space-y-2">
    <p className="flex flex-wrap items-baseline gap-x-2">
      {!revision && <FolderGit2 className="size-4 self-center" role="img" aria-label="Repository" />}
      <a className="min-w-0 break-words font-semibold underline-offset-4 hover:underline focus-visible:underline"
        href={repository} title={id}>{repoName || id.slice(0, 12)}</a>
      {ref && <span className="min-w-0 break-all text-sm text-muted-foreground">
        <span aria-hidden="true">· </span>{ref.slice('refs/heads/'.length)}
      </span>}
    </p>
    {!revision && repoDescription && <p className="line-clamp-1 break-words text-sm">{repoDescription}</p>}
    {revision && <GitCommitList key={post.id} repo={repo} commit={commit}
      summary={post.gitSummary} />}
  </div>
}

function GitCommitList({ repo, commit, summary }) {
  const [subject, setSubject] = useState('')
  const signedSubject = summary?.recent.find(item => item.hash === commit)?.subject
  useEffect(() => {
    if (signedSubject) return
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
    readWorkspaceGit({ repo, kind: 'commit', rev: commit }, { signal })
      .then(data => {
        if (signal.aborted || data.revision.commit !== commit) return
        if (typeof data.details.message === 'string') setSubject(data.details.message.trim().split(/\r?\n/, 1)[0])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [repo, commit, signedSubject])

  const commits = [
    { hash: commit, subject: signedSubject || subject },
    ...(summary?.recent.filter(item => item.hash !== commit) || []),
  ]
  const remaining = commits.slice(3)
  return <>
    <GitCommitRows repo={repo} commits={commits.slice(0, 3)} />
    {remaining.length > 0 && <details className="group text-sm">
      <summary className="cursor-pointer py-1 text-muted-foreground hover:text-foreground">
        <span className="group-open:hidden">Show {remaining.length} more {remaining.length === 1 ? 'commit' : 'commits'}</span>
        <span className="hidden group-open:inline">Show fewer commits</span>
      </summary>
      <div className="max-h-64 overflow-y-auto">
        <GitCommitRows repo={repo} commits={remaining} />
      </div>
    </details>}
  </>
}

function GitCommitRows({ repo, commits }) {
  return <ul className="divide-y">
    {commits.map(({ hash, subject }) => <li key={hash} className="flex items-center gap-2 py-1.5 text-sm">
      <GitCommitHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={subject || undefined}>{subject || '(No subject)'}</span>
      <a href={workspaceGitHref({ repo, kind: 'commit', rev: hash })} title={hash}
        aria-label={'Open commit ' + hash} className="shrink-0 font-mono text-xs underline underline-offset-4">
        {hash.slice(0, 7)}
      </a>
    </li>)}
  </ul>
}
