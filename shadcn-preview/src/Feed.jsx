import { useEffect, useMemo, useRef, useState } from 'react'
import { MessagesSquare, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { usePreference } from './hooks/use-preview-state'
import { hostedPreview as hosted, pendingPost, publishPost, readFeed, retryPost } from './social'

import { authorHref, authorName, indexMessages, messageHref, socialRoute } from './messages'
import { PostCard } from './PostCard'

export function Feed({ hash, name, identity, onIdentityChange }) {
  const [draft, setDraft] = usePreference('draft', '')
  const [posts, setPosts] = useState([])
  const [busy, setBusy] = useState(null)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const [feedError, setFeedError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(-1)
  const [composition, setComposition] = useState(null)
  const [actionBody, setActionBody] = useState('')
  const [policy, setPolicy] = usePreference('message-moderation', '{}')
  const textarea = useRef(null)
  const moderation = JSON.parse(policy)
  const messages = useMemo(() => indexMessages(posts), [posts])
  const route = socialRoute(hash)
  const target = route?.kind === 'message' ? messages.byId.get(route.id) : null
  const authorPosts = route?.kind === 'author' ? messages.posts.filter(post => post.author === route.id) : []
  const currentAuthor = authorPosts[0] && authorName(authorPosts[0])
  const body = composition ? actionBody : draft

  useEffect(() => {
    if (composition) textarea.current?.focus()
  }, [composition])

  function beginComposition(kind, post, value) {
    if (busy || pending !== false) return
    setActionBody(value)
    setComposition({ kind, post })
    setNotice(null)
  }

  function toggleModeration(kind, key) {
    const values = new Set(moderation[kind])
    if (values.has(key)) values.delete(key)
    else values.add(key)
    setPolicy(JSON.stringify({ ...moderation, [kind]: [...values] }))
  }

  function blocked(author) {
    return moderation.blocked?.includes(author)
  }

  function renderPost(post) {
    return <PostCard key={post.id} post={post} own={post.author === identity}
      versions={messages.edits.get(post.id) || []}
      replyCount={(messages.replies.get(post.id) || []).filter(reply => !blocked(reply.author)).length}
      hidden={moderation.hidden?.includes(post.id)} muted={moderation.muted?.includes(post.author)}
      blocked={blocked(post.author)} onCompose={beginComposition} onModerate={toggleModeration}
      composeDisabled={Boolean(busy) || pending !== false} />
  }

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
    if (busy || (!retry && (!body.trim() || pending !== false))) return
    setBusy(retry ? 'retry' : 'publish')
    setNotice(null)
    try {
      const post = composition?.post
      const editing = composition?.kind === 'edit'
      const metadata = editing ? { edit: post.id } : post ? { reply: post.id, replyto: post.author } : {}
      const result = retry
        ? await retryPost(hosted)
        : await publishPost(hosted, body.trim(), name.trim(), metadata, editing ? post.author : undefined)
      if (!retry) {
        if (composition) setComposition(null)
        else setDraft('')
        onIdentityChange(result.signature.slice(0, 44))
      }
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
      <Card className="py-4">
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="post-body" className={composition ? undefined : 'sr-only'}>
                {composition?.kind === 'edit' ? 'Edit message' : composition ? 'Reply to ' + authorName(composition.post) : 'Message'}
              </FieldLabel>
              <Textarea id="post-body" className="bg-muted dark:bg-muted" ref={textarea} value={body}
                onChange={event => (composition ? setActionBody : setDraft)(event.target.value)}
                placeholder="Write a post…" rows={3} maxLength={16000} disabled={busy === 'publish'} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!body.trim() || Boolean(busy) || pending !== false}>
                {busy === 'publish' ? 'Publishing…' : composition?.kind === 'edit' ? 'Save edit' : composition ? 'Send reply' : 'Publish'}
              </Button>
              {composition && <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => setComposition(null)}>Cancel</Button>}
              {pending && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => submit(null, true)}>Retry delivery</Button>}
            </div>
            {notice && <Alert variant={notice.error ? 'destructive' : 'default'}><AlertDescription>{notice.text}</AlertDescription></Alert>}
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {route && <Button asChild variant="outline" size="sm"><a href="#feed">Back to feed</a></Button>}
          <h2 className="break-all font-semibold">{route?.kind === 'message' ? 'Thread' : route ? currentAuthor || 'Author' : 'Feed'}</h2>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setAttempt(n => n + 1)}><RefreshCw /> Refresh</Button>
      </div>
      {loading && <p role="status" className="text-muted-foreground">Loading feed…</p>}
      {feedError && <Alert variant="destructive"><AlertDescription>{feedError}</AlertDescription></Alert>}
      {!route && moderation.blocked?.length > 0 && (
        <details className="text-sm">
          <summary>Blocked authors</summary>
          <ul className="mt-2 space-y-1">
            {moderation.blocked.map(key => (
              <li key={key}><Button asChild variant="link" size="sm">
                <a href={authorHref(key)}>{authorName(messages.posts.find(post => post.author === key) || { author: key, parsed: {} })}</a>
              </Button></li>
            ))}
          </ul>
        </details>
      )}
      {route?.kind === 'message' && target && (
        <>
          {renderPost(target)}
          {(target.parsed.replyHash || target.parsed.reply) && (
            <Button asChild variant="outline" size="sm">
              <a href={messageHref(target.parsed.replyHash || target.parsed.reply)}>Parent message</a>
            </Button>
          )}
          {(messages.replies.get(target.id) || []).filter(post => !blocked(post.author)).slice().reverse().map(renderPost)}
        </>
      )}
      {route?.kind === 'author' && route.id && (
        <>
          <p className="break-all text-sm text-muted-foreground">{route.id}</p>
          {blocked(route.id)
            ? <Button variant="outline" onClick={() => toggleModeration('blocked', route.id)}>Unblock author</Button>
            : authorPosts.slice(0, 50).map(renderPost)}
        </>
      )}
      {!route && messages.posts.filter(post => !blocked(post.author)).slice(0, 50).map(renderPost)}
      {!loading && !feedError && (route ? (route.kind === 'message' ? !target : !authorPosts.length) : !messages.posts.length) && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
            <EmptyTitle>{route ? 'Nothing found' : 'No posts yet'}</EmptyTitle>
            <EmptyDescription>{route ? 'This record is unavailable from the current feed source.' : 'Publish a post to start this feed.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
