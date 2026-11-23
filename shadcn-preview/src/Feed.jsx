import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { MessagesSquare, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { usePreference } from './hooks/use-preview-state'
import { hostedPreview as hosted, pendingPost, publishPost, readFeed, remotePreviewFeed, retryPost } from './social'

import { authorName, indexMessages, replyParentId, socialHref, socialRoute } from './messages'
import { PostCard } from './PostCard'

export function Feed({ hash, name, identity, onIdentityChange }) {
  const [draft, setDraft] = usePreference('draft', '')
  const [feed, setFeed] = useState(() => ({ posts: [], authors: new Set() }))
  const [busy, setBusy] = useState(null)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const [feedError, setFeedError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(-1)
  const [composition, setComposition] = useState(null)
  const [actionBody, setActionBody] = useState('')
  const [policy, setPolicy] = usePreference('message-moderation', '{}')
  const actionField = useRef(null)
  const replyTrigger = useRef(null)
  const selectedReply = useRef(null)
  const feedCheckpoint = useRef(null)
  const moderation = JSON.parse(policy)
  const messages = useMemo(() => indexMessages(feed.posts), [feed.posts])
  const route = socialRoute(hash, messages, feed.authors, identity)
  const target = route?.kind === 'message' ? messages.byId.get(route.id) : null
  const parentId = target && replyParentId(target)
  const selectedReplyId = loaded !== -1 && parentId ? target.id : null
  const parent = parentId && parentId !== target.id ? messages.byId.get(parentId) : null
  const threadReplies = target ? visibleReplies(target).filter(reply => reply.id !== parent?.id).reverse() : []
  const authorPosts = route?.kind === 'author' ? (messages.byAuthor.get(route.id) || []) : []
  const currentAuthor = authorPosts[0] && authorName(authorPosts[0])
  const feedPosts = route ? [] : messages.posts.filter(post => !blocked(post.author)).slice(0, 50)
  const visiblePosts = target ? [target, parent, ...threadReplies] : route?.kind === 'author'
    ? authorPosts.slice(0, 50) : feedPosts
  const statusTarget = pending?.postId || notice?.postId
  const inlineStatus = statusTarget && visiblePosts.some(post => post?.id === statusTarget && !blocked(post.author))

  useEffect(() => {
    if (!selectedReplyId) return
    const reply = selectedReply.current
    reply?.focus({ preventScroll: true })
    reply?.scrollIntoView({ block: 'start' })
  }, [selectedReplyId])

  function beginComposition(kind, post, value, event) {
    if (remotePreviewFeed || busy || pending !== false) return
    replyTrigger.current = event?.currentTarget || null
    if (composition?.kind !== kind || composition.post.id !== post.id) {
      // Mount the field during the tap so mobile browsers can open the keyboard.
      flushSync(() => {
        setActionBody(value)
        setComposition({ kind, post })
        setNotice(null)
      })
    }
    actionField.current?.focus({ preventScroll: true })
    actionField.current?.scrollIntoView({ block: 'nearest' })
  }

  function cancelComposition() {
    setComposition(null)
    setNotice(null)
    replyTrigger.current?.focus({ preventScroll: true })
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

  function visibleReplies(post) {
    return (messages.replies.get(post.id) || []).filter(reply => reply.id !== post.id && !blocked(reply.author))
  }

  function renderPost(post, { showParent = true, selected = false } = {}) {
    const id = showParent && replyParentId(post)
    const parentPost = messages.byId.get(id)
    const parentHidden = parentPost && (blocked(parentPost.author) || moderation.muted?.includes(parentPost.author)
      || moderation.hidden?.includes(id))
    const replyContext = id && { id, author: parentPost && !parentHidden ? authorName(parentPost) : null }
    return (
      <Fragment key={post.id}>
        <PostCard post={post} replyContext={replyContext} selected={selected} own={post.author === identity}
          versions={messages.edits.get(post.id) || []}
          replyCount={visibleReplies(post).length}
          hidden={moderation.hidden?.includes(post.id)} muted={moderation.muted?.includes(post.author)}
          blocked={blocked(post.author)} onCompose={beginComposition} onModerate={toggleModeration}
          composeDisabled={Boolean(busy) || pending !== false} readOnly={remotePreviewFeed} />
        {!remotePreviewFeed && composition?.post.id === post.id && renderComposer(composition)}
        {inlineStatus && post.id === statusTarget && <div className="mt-2 space-y-2">{renderDeliveryStatus()}</div>}
      </Fragment>
    )
  }

  useEffect(() => {
    if (remotePreviewFeed) return
    let active = true
    pendingPost(hosted).then(value => { if (active) setPending(value) }).catch(error => {
      if (active) setNotice({ message: error.message })
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    readFeed(hosted, signal, feedCheckpoint.current).then(value => {
      if (!controller.signal.aborted) {
        feedCheckpoint.current = value
        setFeed(value)
        setFeedError('')
      }
    }).catch(error => {
      if (!controller.signal.aborted) setFeedError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoaded(attempt)
    })
    return () => controller.abort()
  }, [attempt])

  async function submit(event, context = null, retry = false) {
    event?.preventDefault()
    const body = context ? actionBody : draft
    if (remotePreviewFeed || busy || (!retry && (!body.trim() || pending !== false))) return
    setBusy(retry ? 'retry' : context ? 'inline' : 'post')
    setNotice(null)
    try {
      const post = context?.post
      const editing = context?.kind === 'edit'
      const metadata = editing ? { edit: post.id } : post ? { reply: post.id, replyto: post.author } : {}
      const result = retry
        ? await retryPost(hosted)
        : await publishPost(hosted, body.trim(), name.trim(), metadata, editing ? post.author : undefined)
      if (!retry) {
        if (context) setComposition(null)
        else setDraft('')
        onIdentityChange(result.signature.slice(0, 44))
      }
      const waiting = result?.relayed === false
      setPending(waiting ? { postId: post?.id || null } : false)
      setAttempt(n => n + 1)
      if (result && !waiting) {
        const target = result.target || (editing ? post.id : result.id)
        toast.success('Published', {
          action: { label: 'View post', onClick: () => { location.hash = socialHref(target) } },
        })
      }
    } catch (error) {
      setNotice({ message: error.message, postId: context?.post.id || pending?.postId })
      const waiting = await pendingPost(hosted).catch(() => null)
      if (waiting !== null) setPending(waiting)
    } finally {
      setBusy(null)
    }
  }

  function renderComposer(context = null) {
    const body = context ? actionBody : draft
    const fieldId = context ? 'action-body' : 'post-body'
    const editing = context?.kind === 'edit'
    const sending = busy === (context ? 'inline' : 'post')
    const action = editing ? 'Save edit' : context ? 'Send reply' : 'Publish'
    return (
      <Card className={context ? 'mt-2 py-3' : 'py-4'}>
        <CardContent>
          <form className="space-y-3" onSubmit={event => submit(event, context)}>
            <Field>
              <FieldLabel htmlFor={fieldId} className={context ? undefined : 'sr-only'}>
                {editing ? 'Edit message' : context ? 'Replying to ' + authorName(context.post) : 'Message'}
              </FieldLabel>
              <Textarea id={fieldId} className="bg-muted dark:bg-muted" ref={context ? actionField : null} value={body}
                onChange={event => (context ? setActionBody : setDraft)(event.target.value)}
                placeholder={context ? (editing ? 'Edit your message…' : 'Write a reply…') : 'Write a post…'} rows={3} maxLength={16000} disabled={sending} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!body.trim() || Boolean(busy) || pending !== false}>
                {sending ? 'Publishing…' : action}
              </Button>
              {context && <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={cancelComposition}>Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  function renderDeliveryStatus() {
    return (
      <>
        {pending && (
          <Alert role="status">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Saved on this device. Delivery pending.</span>
              <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => submit(null, null, true)}>
                {busy === 'retry' ? 'Retrying…' : 'Retry delivery'}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {notice && <Alert variant="destructive"><AlertDescription>{notice.message}</AlertDescription></Alert>}
      </>
    )
  }

  const loading = loaded !== attempt
  return (
    <div className="space-y-5">
      {!remotePreviewFeed && !route && renderComposer()}
      {!remotePreviewFeed && !inlineStatus && renderDeliveryStatus()}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {route && <Button asChild variant="outline" size="sm"><a href="#feed">Back to feed</a></Button>}
          <h2 className="break-all font-semibold">{route?.kind === 'message' ? 'Thread' : route?.kind === 'author' ? currentAuthor || 'Author' : route ? 'Lookup' : 'Feed'}</h2>
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
                <a href={socialHref(key)}>{authorName(messages.byAuthor.get(key)?.[0] || { author: key, parsed: {} })}</a>
              </Button></li>
            ))}
          </ul>
        </details>
      )}
      {route?.kind === 'message' && target && (
        <>
          {parentId && (
            <section aria-label="Parent message" className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Parent message</h3>
              {parent && !blocked(parent.author)
                ? renderPost(parent, { showParent: false })
                : <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                    <a href={socialHref(parentId)}>{parent ? 'Parent author blocked' : 'Parent message unavailable'}</a>
                  </Button>}
            </section>
          )}
          {parentId ? (
            <section ref={selectedReply} aria-label="Selected reply" tabIndex={-1} className="scroll-mt-14 focus:outline-none">
              {renderPost(target, { showParent: false, selected: true })}
            </section>
          ) : renderPost(target, { showParent: false })}
          {threadReplies.length > 0 && (
            <ol aria-label="Direct replies" className="ms-1 space-y-3 border-s border-input ps-2 sm:ms-2 sm:ps-3">
              {threadReplies.map(post => <li key={post.id}>{renderPost(post, { showParent: false })}</li>)}
            </ol>
          )}
        </>
      )}
      {route?.kind === 'author' && route.id && (
        <>
          <p className="break-all text-sm text-muted-foreground">{route.id}</p>
          {blocked(route.id)
            ? <Button variant="outline" onClick={() => toggleModeration('blocked', route.id)}>Unblock author</Button>
            : authorPosts.slice(0, 50).map(post => renderPost(post))}
        </>
      )}
      {!route && feedPosts.map(post => renderPost(post))}
      {!loading && !feedError && (route ? (route.kind === 'message' ? !target : !authorPosts.length) : !messages.posts.length) && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
            <EmptyTitle>{route?.kind === 'author' ? 'No posts by this author yet' : route ? 'Nothing found' : 'No posts yet'}</EmptyTitle>
            {route?.kind !== 'author' && <EmptyDescription>{route ? 'This ID was not found in the current feed source.' : remotePreviewFeed ? 'This feed has no posts yet.' : 'Publish a post to start this feed.'}</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
