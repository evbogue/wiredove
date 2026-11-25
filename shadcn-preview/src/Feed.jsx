import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { MessagesSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { usePostPages } from './hooks/use-post-pages'
import { usePreference } from './hooks/use-preview-state'
import { hostedPreview as hosted, isFeedPost, pendingPost, publishPost, readFeed, readGitFeed, readLocalPost, readPendingPublication, readStoredFeed, remotePreviewFeed, retryPost } from './social'

import { authorName, collectThreadRows, indexMessages, replyParentId, socialHref, socialRoute } from './messages'
import { MediaAttachments, MediaPicker } from './MediaAttachments'
import { PostCard } from './PostCard'
import { AuthorProfile } from './AuthorProfile'
import { mergeAuthorProfile } from './author-profiles'
import { getQueueStatusSnapshot, subscribeQueueStatus } from '../../network_queue.js'
import { announcePeerPost, mirrorArchive, peerPostsSnapshot, recentPeerFeedReady, requestHash, startPeerSync, subscribePeerPosts, subscribePeerRequest } from './peer-sync'

const feedPollInterval = 10000

export function Feed({ active, hash, name, identity, onIdentityChange, draft, setDraft, composer }) {
  const [draftAttachments, setDraftAttachments] = useState([])
  const [actionAttachments, setActionAttachments] = useState([])
  const draftMediaInput = useRef(null)
  const actionMediaInput = useRef(null)
  const [feed, setFeed] = useState(() => ({ posts: [], authors: new Set() }))
  const [gitPosts, setGitPosts] = useState([])
  const [busy, setBusy] = useState(null)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const [expandedBranches, setExpandedBranches] = useState(() => new Set())
  const [localPost, setLocalPost] = useState(null)
  const [sentReplies, setSentReplies] = useState([])
  const [feedError, setFeedError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [composition, setComposition] = useState(null)
  const [actionBody, setActionBody] = useState('')
  const [policy, setPolicy] = usePreference('message-moderation', '{}')
  const actionField = useRef(null)
  const replyTrigger = useRef(null)
  const selectedReply = useRef(null)
  const sentReply = useRef(null)
  const feedCheckpoint = useRef(null)
  const peerPosts = useSyncExternalStore(subscribePeerPosts, peerPostsSnapshot)
  const recentReady = useSyncExternalStore(subscribePeerPosts, recentPeerFeedReady)
  const [lookup, setLookup] = useState(null)
  const [online, setOnline] = useState(false)

  useEffect(() => {
    void startPeerSync().catch(() => {})
    const update = ({ wsReady, gossipReady }) => setOnline(wsReady || gossipReady)
    update(getQueueStatusSnapshot())
    return subscribeQueueStatus(update)
  }, [])
  const moderation = JSON.parse(policy)
  const messages = useMemo(() => {
    const byId = new Map(feed.posts.map(post => [post.id, post]))
    for (const post of gitPosts) byId.set(post.id, post)
    for (const post of peerPosts) {
      if (!byId.has(post.id) && isFeedPost(post.parsed)) byId.set(post.id, post)
    }
    const archived = new Set(byId.keys())
    const synchronized = [...byId.values()]
      .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id))
    const confirmed = sentReplies.filter(post => !archived.has(post.id)).reverse()
    const local = localPost && !archived.has(localPost.id) && !confirmed.some(post => post.id === localPost.id)
      ? [localPost] : []
    return indexMessages([...local, ...confirmed, ...synchronized])
  }, [feed.posts, gitPosts, localPost, peerPosts, sentReplies])
  const authors = useMemo(() => new Set([...feed.authors, ...gitPosts.map(post => post.author), ...peerPosts.map(post => post.author)]), [feed.authors, gitPosts, peerPosts])
  const profiles = useMemo(() => {
    const merged = new Map(feed.profiles)
    if (!feed.profiles) for (const post of feed.posts) mergeAuthorProfile(merged, post)
    for (const post of peerPosts) mergeAuthorProfile(merged, post)
    if (localPost) mergeAuthorProfile(merged, localPost)
    return merged
  }, [feed.profiles, feed.posts, peerPosts, localPost])
  const route = socialRoute(hash, messages, authors, identity)
  const target = route?.kind === 'message' ? messages.byId.get(route.id) : null
  const parentId = target && replyParentId(target)
  const selectedReplyId = loaded && parentId ? target.id : null
  const parent = parentId && parentId !== target.id ? messages.byId.get(parentId) : null
  const threadRows = target ? collectThreadRows(target, parent, expandedBranches, visibleReplies) : []
  const threadIds = new Set(threadRows.map(row => row.post.id))
  const authorPosts = route?.kind === 'author' ? (messages.byAuthor.get(route.id) || []) : []
  const profile = route?.kind === 'author' ? profiles.get(route.id) : null
  const missingId = route?.id && (route.kind === 'author'
    ? !blocked(route.id) && route.id !== identity && !authors.has(route.id) && !authorPosts.length
    : !target) ? route.id : null
  const missingParent = parentId && !parent && !moderation.hidden?.includes(parentId) ? parentId : null

  useEffect(() => {
    if (!missingId) return
    let sent = false
    const stop = subscribePeerRequest(missingId, ({ state }) => {
      if (state === 'requested' || state === 'queued') sent = true
      setLookup({ id: missingId, state: state === 'idle' && sent ? 'timeout' : state })
    })
    void requestHash(missingId).catch(() => setLookup({ id: missingId, state: 'error' }))
    return stop
  }, [missingId])

  useEffect(() => {
    if (missingParent) void requestHash(missingParent).catch(() => {})
  }, [missingParent])

  function retryLookup() {
    setLookup({ id: missingId, state: 'queued' })
    void requestHash(missingId, { retry: true }).catch(() => setLookup({ id: missingId, state: 'error' }))
  }

  const latestReply = sentReplies.at(-1)
  const pagedView = !route ? 'feed' : route.kind === 'author' ? 'author:' + route.id : null
  const pageablePosts = !route ? (recentReady ? messages.posts.filter(post => !blocked(post.author)) : [])
    : route.kind === 'author' && !blocked(route.id) ? authorPosts : []
  const localIds = new Set([...sentReplies.map(post => post.id), localPost?.id])
  const { posts: visiblePage, pendingCount, hasMore, sentinel, loadMore, showNewPosts } =
    usePostPages(pageablePosts, { view: pagedView, active, localIds })
  const visiblePosts = target ? [target, parent, ...threadRows.map(row => row.post)] : visiblePage
  const visibleIds = new Set(visiblePosts.filter(post => post && !blocked(post.author)).map(post => post.id))
  const placedInline = new Set()
  const repliesByParent = new Map()
  for (const reply of sentReplies) {
    const parentId = replyParentId(reply)
    if (!visibleIds.has(parentId) || blocked(reply.author)
        || (target && (visibleIds.has(reply.id) || threadIds.has(parentId)))) continue
    const replies = repliesByParent.get(parentId) || []
    replies.push(messages.byId.get(reply.id))
    repliesByParent.set(parentId, replies)
    placedInline.add(reply.id)
    visibleIds.add(reply.id)
  }
  const statusTarget = pending?.postId || notice?.postId
  const inlineStatus = statusTarget && visibleIds.has(statusTarget)

  useEffect(() => {
    if (!selectedReplyId) return
    const reply = selectedReply.current
    reply?.focus({ preventScroll: true })
    reply?.scrollIntoView({ block: 'start' })
  }, [selectedReplyId])

  useEffect(() => {
    if (latestReply) sentReply.current?.scrollIntoView({ block: 'nearest' })
  }, [latestReply])

  function beginComposition(kind, post, value, event) {
    if (remotePreviewFeed || busy || pending !== false) return
    replyTrigger.current = event?.currentTarget || null
    if (composition?.kind !== kind || composition.post.id !== post.id) {
      // Mount the field during the tap so mobile browsers can open the keyboard.
      flushSync(() => {
        setActionBody(value)
        setActionAttachments([])
        setComposition({ kind, post })
        setNotice(null)
      })
    }
    actionField.current?.focus({ preventScroll: true })
    actionField.current?.scrollIntoView({ block: 'nearest' })
  }

  function cancelComposition() {
    setActionAttachments([])
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

  function toggleBranch(id) {
    setExpandedBranches(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderPost(post, { showParent = true, selected = false } = {}) {
    const id = showParent && replyParentId(post)
    const parentPost = messages.byId.get(id)
    const parentHidden = parentPost && (blocked(parentPost.author) || moderation.muted?.includes(parentPost.author)
      || moderation.hidden?.includes(id))
    const replyContext = id && { id, author: parentPost && !parentHidden ? authorName(parentPost) : null }
    return (
      <Fragment key={post.id}>
        <PostCard post={post} profile={profiles.get(post.author)} replyContext={replyContext} selected={selected} own={post.author === identity}
          versions={messages.edits.get(post.id) || []}
          replyCount={visibleReplies(post).length}
          branchExpanded={expandedBranches.has(post.id)}
          onToggleBranch={threadIds.has(post.id) ? () => toggleBranch(post.id) : undefined}
          hidden={moderation.hidden?.includes(post.id)} muted={moderation.muted?.includes(post.author)}
          blocked={blocked(post.author)} onCompose={beginComposition} onModerate={toggleModeration}
          composeDisabled={Boolean(busy) || pending !== false} readOnly={remotePreviewFeed} />
        {!remotePreviewFeed && composition?.post.id === post.id && renderComposer(composition)}
        {inlineStatus && post.id === statusTarget && <div className="mt-2 space-y-2">{renderDeliveryStatus()}</div>}
        {repliesByParent.get(post.id)?.map(reply => (
          <div key={reply.id} ref={reply.id === latestReply?.id ? sentReply : null} className="mt-2 scroll-mt-14">
            {renderPost(reply)}
          </div>
        ))}
      </Fragment>
    )
  }

  useEffect(() => {
    if (remotePreviewFeed) return
    let active = true
    readPendingPublication(hosted).then(post => { if (active) setLocalPost(post) }).catch(() => {})
    pendingPost(hosted).then(value => { if (active) setPending(value) }).catch(error => {
      if (active) setNotice({ message: error.message })
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer
    let running = false
    let gitCheckpoint

    async function refreshGit(signal) {
      try {
        const value = await readGitFeed(signal, gitCheckpoint)
        if (controller.signal.aborted || value === gitCheckpoint) return
        gitCheckpoint = value
        setGitPosts(value.posts)
      } catch (error) {
        if (!signal.aborted) console.warn('Could not refresh Git activity', error)
      }
    }

    async function refresh() {
      if (controller.signal.aborted || document.hidden || running) return
      running = true
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
      const gitRefresh = refreshGit(signal)
      try {
        if (!feedCheckpoint.current) {
          const cached = await readStoredFeed().catch(() => null)
          if (cached && !controller.signal.aborted) {
            feedCheckpoint.current = cached
            setFeed(cached)
            void mirrorArchive(cached.posts)
            setLoaded(true)
          }
        }
        const value = await readFeed(hosted, signal, feedCheckpoint.current)
        if (!controller.signal.aborted) {
          feedCheckpoint.current = value
          setFeed(value)
          void mirrorArchive(value.posts)
          setFeedError('')
        }
      } catch (error) {
        if (!controller.signal.aborted) setFeedError(error.message)
      } finally {
        if (!controller.signal.aborted) setLoaded(true)
        await gitRefresh
        running = false
        if (!controller.signal.aborted) {
          if (!document.hidden) timer = setTimeout(refresh, feedPollInterval)
        }
      }
    }

    function handleVisibility() {
      clearTimeout(timer)
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [attempt])

  async function submit(event, context = null, retry = false) {
    event?.preventDefault()
    const body = context ? actionBody : draft
    const attachments = context ? actionAttachments : draftAttachments
    if (remotePreviewFeed || busy || (!retry && ((!body.trim() && !attachments.length) || pending !== false))) return
    setBusy(retry ? 'retry' : context ? 'inline' : 'post')
    setNotice(null)
    try {
      const post = context?.post
      const editing = context?.kind === 'edit'
      const metadata = editing ? { edit: post.id } : post ? { reply: post.id, replyto: post.author } : {}
      const result = retry
        ? await retryPost(hosted)
        : await publishPost(hosted, body.trim(), name.trim(), metadata, editing ? post.author : undefined, attachments)
      if (!retry) {
        if (context) {
          setComposition(null)
          setActionAttachments([])
        } else {
          setDraft('')
          setDraftAttachments([])
        }
        onIdentityChange(result.signature.slice(0, 44))
      }
      const waiting = result?.relayed === false
      setPending(waiting ? { postId: post?.id || null } : false)
      setAttempt(n => n + 1)
      if (result) {
        const local = await readLocalPost(result).catch(() => null)
        if (local) setLocalPost(local)
        if (local && !local.parsed.edit && replyParentId(local)) {
          const reply = local
          setSentReplies(previous => previous.some(post => post.id === reply.id) ? previous : [...previous, reply])
          setExpandedBranches(previous => new Set(previous).add(replyParentId(reply)))
        }
        const target = result.target || (editing ? post.id : result.id)
        if (!waiting) {
          if (online) announcePeerPost(result)
          toast.success('Published', {
            action: { label: 'View post', onClick: () => { location.hash = socialHref(target) } },
          })
        }
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
    const attachments = context ? actionAttachments : draftAttachments
    const setAttachments = context ? setActionAttachments : setDraftAttachments
    const mediaInput = context ? actionMediaInput : draftMediaInput
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
              <Textarea id={fieldId} className="bg-muted dark:bg-muted" ref={context ? actionField : composer} value={body}
                onChange={event => (context ? setActionBody : setDraft)(event.target.value)}
                placeholder={context ? (editing ? 'Edit your message…' : 'Write a reply…') : 'Write a post…'} rows={3} maxLength={16000} disabled={sending} />
            </Field>
            {!editing && <MediaAttachments key={context?.post.id || 'draft'} attachments={attachments} onChange={setAttachments} input={mediaInput} disabled={Boolean(busy)} />}
            <div className="flex flex-wrap items-center gap-2">
              {!editing && <MediaPicker input={mediaInput} disabled={Boolean(busy)} />}
              <Button type="submit" disabled={(!body.trim() && !attachments.length) || Boolean(busy) || pending !== false}>
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

  const loading = !loaded || (!route && !recentReady)
  return (
    <div className="space-y-5">
      {!route && pendingCount > 0 && (
        <div className="sticky top-12 z-10 flex justify-center py-2">
          <Button size="sm" onClick={showNewPosts}>
            Show {pendingCount} new {pendingCount === 1 ? 'post' : 'posts'}
          </Button>
        </div>
      )}
      {!remotePreviewFeed && !route && renderComposer()}
      {!remotePreviewFeed && !inlineStatus && renderDeliveryStatus()}
      {route?.kind === 'author'
        ? <AuthorProfile id={route.id} profile={profile} blocked={blocked(route.id)}
            name={profile?.name?.value || (route.id === identity && name.trim()) ||
              (authorPosts[0] ? authorName(authorPosts[0]) : route.id.slice(0, 12))}
            onUnblock={() => toggleModeration('blocked', route.id)} />
        : <h2 className={route ? 'font-semibold' : 'sr-only'}>{route?.kind === 'message' ? 'Thread' : route ? 'Lookup' : 'Feed'}</h2>}
      {loading && <p role="status" className="text-muted-foreground">Loading feed…</p>}
      {feedError && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {feedError}
            <Button variant="outline" size="sm" onClick={() => setAttempt(n => n + 1)}>Retry feed</Button>
          </AlertDescription>
        </Alert>
      )}
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
            <section aria-label="Parent message">
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
          {threadRows.length > 0 && (
            <ol aria-label="Thread replies" className="thread-replies ms-1 space-y-3 border-s border-input sm:ms-2">
              {threadRows.map(({ post, depth }) => (
                <li key={post.id} ref={post.id === latestReply?.id ? sentReply : null}
                  className={'scroll-mt-14 ' + (depth > 2 ? 'thread-branch thread-branch-deep' : depth === 2 ? 'thread-branch' : '')}>
                  {renderPost(post, { showParent: depth > 1 })}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {(!route || (route.kind === 'author' && !blocked(route.id))) &&
        visiblePage.filter(post => !placedInline.has(post.id)).map(post => renderPost(post))}
      {hasMore && (
        <div ref={sentinel} className="flex justify-center">
          <Button variant="outline" onClick={loadMore}>Load more posts</Button>
        </div>
      )}
      {missingId && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
            <EmptyTitle>Looking up {route.kind === 'author' ? 'profile' : 'record'}</EmptyTitle>
            <EmptyDescription role="status">
              {lookup?.id === missingId && lookup.state === 'timeout' ? 'No peer answered this request.' :
                lookup?.id === missingId && lookup.state === 'error' ? 'Peer lookup is unavailable.' :
                  !online ? 'Waiting for a peer connection.' : 'Requesting from peers…'}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={retryLookup}>Retry lookup</Button>
          {!online && <Button variant="link" asChild><a href="#peers">Open Peers</a></Button>}
        </Empty>
      )}
      {!missingId && !loading && !feedError && (route ? (route.kind === 'message' ? !target : !blocked(route.id) && !authorPosts.length) : !messages.posts.length) && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
            <EmptyTitle>{route?.kind === 'author' ? 'No posts by this author yet' : route ? 'Nothing found' : 'No posts yet'}</EmptyTitle>
            {route && route.kind !== 'author' && <EmptyDescription>This ID was not found in the current feed source.</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
