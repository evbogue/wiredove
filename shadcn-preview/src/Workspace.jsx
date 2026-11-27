import { useEffect, useState } from 'react'
import { Folder, File, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { parseWorkspaceGitRoute, readWorkspaceGit, readWorkspaceSelection, workspaceGitHref } from '../../client/runtime/workspace-git.js'

export function Repository({ hash, onDiscuss }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    async function load() {
      try {
        let request = parseWorkspaceGitRoute(hash)
        if (hash !== 'workspace/' && !request) {
          setResult({ hash, attempt, error: 'This repository link is invalid.' })
          return
        }
        if (!request) {
          const selection = await readWorkspaceSelection({ signal })
          if (!selection) {
            if (!controller.signal.aborted) setResult({ hash, attempt, empty: true })
            return
          }
          request = { repo: selection.repo, kind: 'overview' }
        }
        const data = await readWorkspaceGit(request, { signal })
        if (!controller.signal.aborted) setResult({ hash, attempt, data, request })
      } catch (error) {
        if (!controller.signal.aborted) setResult(previous => ({
          ...(previous?.hash === hash ? previous : null), hash, attempt,
          error: error.status === 404 ? 'Repository, revision, or path not found.'
            : error.status === 400 ? 'This repository link is invalid.'
            : 'Git status is unavailable. Check the Wiredove Git gateway.',
        }))
      }
    }
    void load()
    return () => controller.abort()
  }, [hash, attempt])

  const current = result?.hash === hash ? result : null
  const loading = current?.attempt !== attempt
  const { data, request } = current || {}
  const revision = data?.revision.commit
  const href = (kind, options = {}) => workspaceGitHref({ repo: request.repo, kind, ...options })
  const pinned = (kind, path = '') => href(kind, { rev: revision, path })
  const pinnedView = () => request.kind === 'compare'
    ? href('compare', { base: data.base.commit, head: revision, path: data.path })
    : href(request.kind, { rev: revision, path: data.path, offset: data.offset })
  const filesActive = ['overview', 'tree', 'blob'].includes(request?.kind)
  const cloneUrl = data && new URL('/git/' + request.repo + '.git', location.href).href
  const commitUrl = revision && new URL(pinned('commit'), location.href).href
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="break-all text-lg">{data?.repository.name || 'Repository'}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { if (!loading) setAttempt(n => n + 1) }} aria-disabled={loading}>
            <RefreshCw /> Refresh
          </Button>
        </div>
        {data && <CardDescription className="break-all">{data.path || 'Files'}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {loading && <p role="status" className="text-muted-foreground">{data ? 'Refreshing repository…' : 'Loading repository…'}</p>}
        {current?.error && <Alert variant="destructive"><AlertDescription>{current.error}</AlertDescription></Alert>}
        {current?.empty && <p className="text-muted-foreground">This node has no selected repository.</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {revision && <>
                <Badge variant="secondary">{data.revision.ref?.replace(/^refs\/(heads|tags)\//, '') || 'Commit'}</Badge>
                <a className="font-mono underline underline-offset-4" href={pinnedView()} title={revision}
                  aria-label={'Permalink at commit ' + revision}>{revision.slice(0, 12)}</a>
              </>}
              <CopyValue label="Copy clone URL" value={cloneUrl} />
              {(request.rev || !filesActive) && <RepoLink href={href('overview')}>Latest files</RepoLink>}
            </div>
            <nav aria-label="Repository views" className="flex flex-wrap gap-1 border-b pb-2">
              <RepoLink current={filesActive} href={pinned('overview')}>Files</RepoLink>
              <RepoLink current={['commits', 'commit', 'diff'].includes(request.kind)}
                href={pinned('commits')}>History</RepoLink>
              <RepoLink current={['refs', 'compare'].includes(request.kind)}
                href={href('refs', { rev: revision })}>Branches and tags</RepoLink>
            </nav>
            {filesActive && data.path && <Breadcrumbs path={data.path} pinned={pinned} />}
            {request.kind === 'blob' && <>
              <CopyValue label="Copy path" value={data.path} />
              <FilePreview file={data.file} path={data.path} />
            </>}
            {!filesActive && <RevisionView key={hash} data={data} request={request} href={href} pinned={pinned}
              commitUrl={commitUrl} onDiscuss={onDiscuss} />}
            {data.entries?.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Path</TableHead><TableHead className="text-right">Bytes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.entries.map(entry => {
                    const path = data.path ? data.path + '/' + entry.name : entry.name
                    const Icon = entry.type === 'tree' ? Folder : File
                    return (
                      <TableRow key={path}>
                        <TableCell>
                          {['tree', 'blob'].includes(entry.type)
                            ? <Button asChild variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal text-left"><a href={pinned(entry.type, path)}><Icon /><span className="break-all">{entry.name}</span></a></Button>
                            : entry.name}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{entry.size ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            {request.kind === 'overview' && revision && <RepoLink href={pinned('commit')}>View latest commit</RepoLink>}
            {filesActive && data.truncated && <p className="text-sm text-muted-foreground">Only the first entries are shown.</p>}
            {data.readme && <section className="space-y-2"><h2 className="font-semibold">{data.readme.path}</h2><FilePreview file={data.readme} path={data.readme.path} /></section>}
            {data.entries?.length === 0 && <p className="text-muted-foreground">{revision ? 'This folder is empty.' : 'This repository has no commits yet.'}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function RepoLink({ href, current, children }) {
  return <Button asChild variant={current ? 'secondary' : 'ghost'} size="sm">
    <a href={href} aria-current={current ? 'true' : undefined}>{children}</a>
  </Button>
}

function CopyValue({ label, value }) {
  const [fallback, setFallback] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setFallback(false)
      toast.success('Copied')
    } catch {
      setFallback(true)
    }
  }
  return <>
    <Button variant="outline" size="sm" onClick={copy}>{label}</Button>
    {fallback && <Input aria-label={label.replace(/^Copy /, '')} readOnly value={value}
      onFocus={event => event.target.select()} />}
  </>
}

function Breadcrumbs({ path, pinned }) {
  const parts = path.split('/')
  return <nav aria-label="Repository path" className="flex flex-wrap gap-x-2 text-sm break-all">
    <a className="underline" href={pinned('overview')}>Repository root</a>
    {parts.map((part, index) => {
      const prefix = parts.slice(0, index + 1).join('/')
      return <span key={prefix}>
        <span aria-hidden="true" className="mr-2 text-muted-foreground">/</span>
        {index === parts.length - 1 ? <span aria-current="location">{part}</span>
          : <a className="underline" href={pinned('tree', prefix)}>{part}</a>}
      </span>
    })}
  </nav>
}

function Source({ label, children }) {
  return <pre tabIndex={0} aria-label={label}
    className="max-h-[65vh] overflow-auto rounded-md bg-muted p-4 text-sm focus-visible:ring-2">
    <code>{children}</code>
  </pre>
}

function FilePreview({ file, path }) {
  const stateMessage = {
    empty: 'This file is empty.',
    binary: 'Binary file. Download the raw file to view it.',
    oversized: 'This file exceeds the preview limit.',
    truncated: 'Showing the beginning of this file.',
  }[file.state]
  return <div className="space-y-2">
    {/^\/git\/[A-Za-z0-9_-]+\/raw\//.test(file.rawUrl || '') &&
      <Button asChild variant="outline" size="sm"><a href={file.rawUrl} download>Raw</a></Button>}
    {stateMessage && <p className="text-sm text-muted-foreground">{stateMessage}</p>}
    {['text', 'truncated'].includes(file.state) && typeof file.text === 'string' &&
      <Source label={path}>{file.text}</Source>}
  </div>
}

function CommitList({ commits, href }) {
  if (!commits.length) return <p className="text-sm text-muted-foreground">No commits.</p>
  return <ul className="divide-y">
    {commits.map(commit => <li key={commit.hash} className="py-2">
      <a className="block break-words font-medium hover:underline" href={href('commit', { rev: commit.hash })}>
        {commit.subject || '(No subject)'}</a>
      <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
        <code>{commit.hash.slice(0, 12)}</code>
        <span className="break-all">{commit.author}</span>
        {commit.date && <time dateTime={commit.date}>{commit.date.slice(0, 10)}</time>}
      </p>
    </li>)}
  </ul>
}

function ChangedFiles({ files, fileHref }) {
  if (!files.length) return <p className="text-sm text-muted-foreground">No changed files.</p>
  return <ul className="divide-y">
    {files.map(file => <li key={file.path} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm">
      <a className="break-all underline underline-offset-4" href={fileHref(file.path)}>
        {file.oldPath ? file.oldPath + ' → ' : ''}{file.path}
      </a>
      <span className="text-muted-foreground">{file.status} · {file.binary ? 'Binary' : '+' + file.added + ' −' + file.removed}</span>
    </li>)}
  </ul>
}

function CompareForm({ base = '', head = '', href }) {
  function compare(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const base = fields.get('base').trim()
    const head = fields.get('head').trim()
    if (base && head) location.hash = href('compare', { base, head })
  }
  return <form className="flex flex-wrap items-end gap-2" onSubmit={compare}>
    <label className="min-w-0 flex-1 basis-40 space-y-1 text-sm">Base revision
      <Input name="base" defaultValue={base} required />
    </label>
    <label className="min-w-0 flex-1 basis-40 space-y-1 text-sm">Head revision
      <Input name="head" defaultValue={head} required />
    </label>
    <Button type="submit" variant="outline">Compare</Button>
  </form>
}

function Patch({ data, showHeading = true }) {
  return <section className="space-y-2">
    {showHeading && <h2 className="break-all font-semibold">{data.path}</h2>}
    {data.patch?.truncated && <p className="text-sm text-muted-foreground">Showing the beginning of this diff.</p>}
    {data.patch?.text ? <Source label={'Diff for ' + data.path}>{data.patch.text}</Source>
      : <p>{data.file.binary ? 'Binary file changed.' : 'No text changes.'}</p>}
  </section>
}

function InlineCommitDiff({ repo, commit, file, href }) {
  const [patch, setPatch] = useState(null)
  useEffect(() => {
    if (file.binary) return
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
    readWorkspaceGit({ repo, kind: 'diff', path: file.path, rev: commit }, { signal })
      .then(data => {
        if (signal.aborted) return
        setPatch(data.revision.commit === commit && data.path === file.path ? { data } : { error: true })
      })
      .catch(() => {
        if (!controller.signal.aborted) setPatch({ error: true })
      })
    return () => controller.abort()
  }, [repo, commit, file.path, file.binary])

  return <div className="space-y-2 border-t p-3">
    {file.binary ? <p>Binary file changed.</p>
      : patch?.data ? <Patch data={patch.data} showHeading={false} />
        : <p role="status" className="text-sm text-muted-foreground">{patch?.error ? 'Diff unavailable.' : 'Loading diff…'}</p>}
    <RepoLink href={href}>Open file diff</RepoLink>
  </div>
}

function CommitFile({ file, repo, commit, href, initiallyOpen }) {
  const [open, setOpen] = useState(initiallyOpen)
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}
    className="min-w-0 rounded-md border">
    <summary className="cursor-pointer break-all px-3 py-2 text-sm font-medium">
      {file.oldPath ? file.oldPath + ' → ' : ''}{file.path}
      <span className="ml-2 whitespace-nowrap font-normal text-muted-foreground">
        {file.status} · {file.binary ? 'Binary' : '+' + file.added + ' −' + file.removed}
      </span>
    </summary>
    {open && <InlineCommitDiff repo={repo} commit={commit} file={file} href={href} />}
  </details>
}

function RevisionView({ data, request, href, pinned, commitUrl, onDiscuss }) {
  const { revision, details, files } = data
  const commit = revision.commit
  switch (request.kind) {
    case 'refs':
      return <>
        <div className="grid gap-4 sm:grid-cols-2">
          {[['Branches', data.branches], ['Tags', data.tags]].map(([label, refs]) => <section key={label}>
            <h2 className="font-semibold">{label}</h2>
            {refs.length ? <ul className="divide-y">{refs.map(ref => <li key={ref.ref} className="py-2">
              <a className="break-all underline" href={href('overview', { rev: ref.ref })}>{ref.name}</a>
            </li>)}</ul> : <p className="text-sm text-muted-foreground">None published.</p>}
          </section>)}
        </div>
        <CompareForm head={commit || ''} href={href} />
      </>
    case 'commits':
      return <>
        <h2 className="font-semibold">Commit history</h2>
        <CommitList commits={data.commits} href={href} />
        <div className="flex flex-wrap gap-2">
          {data.offset > 0 && <RepoLink href={href('commits', { rev: commit, offset: Math.max(0, data.offset - 50) })}>Newer commits</RepoLink>}
          {data.hasMore && <RepoLink href={href('commits', { rev: commit, offset: data.offset + 50 })}>Older commits</RepoLink>}
        </div>
      </>
    case 'commit':
      return <>
        <section className="space-y-2">
          <h2 className="font-semibold">Commit message</h2>
          <p className="break-words text-sm text-muted-foreground">{[details.author, details.date].filter(Boolean).join(' · ')}</p>
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-4">{details.message || '(No commit message)'}</p>
          <div className="flex flex-wrap gap-2">
            {onDiscuss && <Button onClick={event => onDiscuss(commitUrl, event.currentTarget)}>Discuss this commit</Button>}
            <CopyValue label="Copy commit link" value={commitUrl} />
            <RepoLink href={pinned('overview')}>Browse at this commit</RepoLink>
            {details.parents.map(parent => <RepoLink key={parent} href={href('commit', { rev: parent })}>Parent {parent.slice(0, 12)}</RepoLink>)}
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">Changed files</h2>
          {files.length ? files.map((file, index) => <CommitFile key={commit + ':' + file.path}
            file={file} repo={request.repo} commit={commit} href={pinned('diff', file.path)} initiallyOpen={index === 0} />)
            : <p className="text-sm text-muted-foreground">No changed files.</p>}
        </section>
      </>
    case 'diff':
      return <>
        <div className="flex flex-wrap gap-1">
          <RepoLink href={pinned('commit')}>Back to commit</RepoLink>
          {!['000000', '160000'].includes(data.file.newMode) &&
            <RepoLink href={pinned('blob', data.path)}>Browse file at this commit</RepoLink>}
        </div>
        <Patch data={data} />
      </>
    case 'compare': {
      const base = data.base.commit
      const comparison = path => href('compare', { base, head: commit, path })
      return <>
        <h2 className="font-semibold">Compare revisions</h2>
        <CompareForm base={base} head={commit} href={href} />
        <div className="flex flex-wrap items-center gap-1 font-mono">
          <RepoLink href={href('commit', { rev: base })}>{base.slice(0, 12)}</RepoLink> →
          <RepoLink href={pinned('commit')}>{commit.slice(0, 12)}</RepoLink>
        </div>
        {data.path ? <>
          <RepoLink href={comparison('')}>Back to comparison</RepoLink>
          <Patch data={data} />
        </> : <>
          <section><h3 className="font-semibold">Commits ({data.totalCommits})</h3><CommitList commits={data.commits} href={href} /></section>
          <section><h3 className="font-semibold">Changed files ({data.totalFiles})</h3><ChangedFiles files={files} fileHref={comparison} /></section>
          {(data.truncated || data.commits.length < data.totalCommits) &&
            <p className="text-sm text-muted-foreground">Showing the first results.</p>}
        </>}
      </>
    }
  }
}
