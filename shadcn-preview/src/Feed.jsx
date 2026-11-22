import { useEffect, useState } from 'react'
import { MessagesSquare, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { usePreference } from './hooks/use-preview-state'
import { pendingPost, publishPost, readFeed, retryPost } from './social'

const hosted = import.meta.env.VITE_WIREDOVE_HOSTED === '1'
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function PostCard({ post }) {
  const name = typeof post.parsed.name === 'string' ? post.parsed.name.trim() : ''
  const author = name || post.author.slice(0, 12)
  return (
    <Card className="min-w-0 gap-4">
      <CardHeader className="flex items-center gap-3">
        <Avatar><AvatarFallback>{Array.from(author).slice(0, 2).join('').toUpperCase()}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <CardTitle className="break-all">{author}</CardTitle>
          <CardDescription><time dateTime={new Date(post.timestamp).toISOString()}>{dateFormat.format(post.timestamp)}</time></CardDescription>
        </div>
      </CardHeader>
      <CardContent className="whitespace-pre-wrap [overflow-wrap:anywhere]">{post.parsed.body}</CardContent>
    </Card>
  )
}

export function Feed({ name }) {
  const [draft, setDraft] = usePreference('draft', '')
  const [posts, setPosts] = useState([])
  const [busy, setBusy] = useState(null)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const [feedError, setFeedError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(-1)

  useEffect(() => {
    let active = true
    pendingPost(hosted).then(value => { if (active) setPending(value) }).catch(error => {
      if (active) setNotice({ error: true, text: error.message })
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    readFeed(hosted, signal).then(value => {
      if (!controller.signal.aborted) {
        setPosts(value)
        setFeedError('')
      }
    }).catch(error => {
      if (!controller.signal.aborted) setFeedError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoaded(attempt)
    })
    return () => controller.abort()
  }, [attempt])

  async function submit(event, retry = false) {
    event?.preventDefault()
    if (busy || (!retry && (!draft.trim() || pending !== false))) return
    setBusy(retry ? 'retry' : 'publish')
    setNotice(null)
    try {
      const result = retry ? await retryPost(hosted) : await publishPost(hosted, draft.trim(), name.trim())
      if (!retry) setDraft('')
      const waiting = result?.relayed === false
      setPending(waiting)
      setNotice(waiting
        ? { error: true, text: 'Post saved locally. Retry delivery to publish the signed post. ' + result.error }
        : { error: false, text: 'Post published.' })
      setAttempt(n => n + 1)
    } catch (error) {
      setNotice({ error: true, text: error.message })
    } finally {
      setBusy(null)
    }
  }

  const loading = loaded !== attempt
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New post</CardTitle>
          <CardDescription>Posts use a separate preview identity.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="post-body">Message</FieldLabel>
              <Textarea id="post-body" value={draft} onChange={event => setDraft(event.target.value)}
                placeholder="Write a post…" rows={4} maxLength={16000} disabled={busy === 'publish'} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!draft.trim() || Boolean(busy) || pending !== false}>{busy === 'publish' ? 'Publishing…' : 'Publish'}</Button>
              {pending && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => submit(null, true)}>Retry delivery</Button>}
            </div>
            {notice && <Alert variant={notice.error ? 'destructive' : 'default'}><AlertDescription>{notice.text}</AlertDescription></Alert>}
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Feed</h2>
          <Badge variant="secondary">{hosted ? 'Hosted feed' : 'Node archive'}</Badge>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setAttempt(n => n + 1)}><RefreshCw /> Refresh</Button>
      </div>
      {loading && <p role="status" className="text-muted-foreground">Loading feed…</p>}
      {feedError && <Alert variant="destructive"><AlertDescription>{feedError}</AlertDescription></Alert>}
      {!loading && !feedError && posts.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
            <EmptyTitle>No posts yet</EmptyTitle>
            <EmptyDescription>Publish a post to start this feed.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {posts.map(post => <PostCard key={post.id} post={post} />)}
    </div>
  )
}
