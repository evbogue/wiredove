import { useEffect, useState } from 'react'
import { Folder, File, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { parseWorkspaceGitRoute, readWorkspaceGit, readWorkspaceSelection, workspaceGitHref } from '../../client/runtime/workspace-git.js'

export function Repository({ hash }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    async function load() {
      try {
        let request = parseWorkspaceGitRoute(hash)
        if (hash !== 'workspace/' && !['overview', 'tree', 'blob'].includes(request?.kind)) {
          setResult({ hash, attempt, error: 'This preview supports repository folders and files.' })
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
        if (!controller.signal.aborted) setResult({
          hash, attempt,
          error: error.status ? `Repository request failed (${error.status}).` : 'Git status is unavailable. Check the Wiredove Git gateway.',
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [hash, attempt])

  const current = result?.hash === hash && result.attempt === attempt ? result : null
  const { data, request } = current || {}
  const revision = data?.revision.commit
  const href = (kind, path, rev = revision) => workspaceGitHref({ repo: request.repo, kind, path, rev })
  const parent = data?.path.split('/').slice(0, -1).join('/')
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="break-all text-lg">{data?.repository.name || 'Repository'}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAttempt(n => n + 1)} disabled={!current}>
            <RefreshCw /> Refresh
          </Button>
        </div>
        {data && <CardDescription className="break-all">{data.path || 'Files'}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {!current && <p role="status" className="text-muted-foreground">Loading repository…</p>}
        {current?.error && <Alert variant="destructive"><AlertDescription>{current.error}</AlertDescription></Alert>}
        {current?.empty && <p className="text-muted-foreground">This node has no selected repository.</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {revision && <Badge variant="secondary">{data.revision.ref || revision.slice(0, 12)}</Badge>}
              {data.path && <Button asChild variant="outline" size="sm"><a href={href(parent ? 'tree' : 'overview', parent)}>Parent folder</a></Button>}
              {(data.path || request.rev) && <Button asChild variant="outline" size="sm"><a href={href('overview', '', null)}>Latest files</a></Button>}
            </div>
            {data.file && (
              <pre className="max-h-[65vh] overflow-auto rounded-md bg-muted p-4 text-sm"><code>{data.file.text ?? 'No text preview available for this file.'}</code></pre>
            )}
            {data.file?.state === 'truncated' && <p className="text-sm text-muted-foreground">Showing the beginning of this file.</p>}
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
                            ? <Button asChild variant="ghost" size="sm"><a href={href(entry.type, path)}><Icon />{entry.name}</a></Button>
                            : entry.name}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{entry.size ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            {data.entries?.length === 0 && <p className="text-muted-foreground">{revision ? 'This folder is empty.' : 'This repository has no commits yet.'}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
