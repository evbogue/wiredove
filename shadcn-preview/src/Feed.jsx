import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeft, KeyRound, MessagesSquare, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePostPages } from './hooks/use-post-pages'
import { usePreference } from './hooks/use-preview-state'
import { clearComposerDraft, hostedPreview as hosted, isFeedPost, pendingPost, publishPost, publishProfile, readComposerDraft, readFeed, readGitFeed, readLocalPost, readLocalProfile, readPendingPublication, readStoredFeed, retryPost, saveComposerDraft } from './social'

import { authorName, collectThreadRows, indexMessages, replyParentId, socialHref, socialRoute } from './messages'
import { DraftAttachmentsPreview, MediaAttachments, MediaPicker } from './MediaAttachments'
import { HelpPopover } from './HelpPopover'
import { MessageAuthorHeader } from './MessageAuthorHeader'
import { PostBody } from './PostBody'
import { PostCard } from './PostCard'
import { gitCardType, gitRepositoryId } from './git-records'
import { ProfileEditorPopover } from './ProfileEditorPopover'
import { AuthorProfile } from './AuthorProfile'
import { isProfileUpdate } from '../../client/ui/profile-update.js'
import { isMessageHash } from '../../client/protocol.js'
import { mergeAuthorProfile } from './author-profiles'
import { getQueueStatusSnapshot, subscribeQueueStatus } from '../../network_queue.js'
import { announcePeerPost, mirrorArchive, peerPostsSnapshot, recentPeerFeedReady, requestHash, startPeerSync, subscribePeerPosts, subscribePeerRequest } from './peer-sync'

const feedPollInterval = 10000

function ComposerAction({ label, icon: Icon, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} {...props}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function Feed({ readOnly, waitingForIdentity, active, hash, name, onNameChange, identity, onIdentityChange, onOwnProfileChange, draft, setDraft, composer, profileSetup, onChooseKey, composerOpen, setComposerOpen, composeTrigger }) {
  const [draftAttachments, setDraftAttachments] = useState([])
  const draftMediaInput = useRef(null)
  const actionMediaInput = useRef(null)
  const [feed, setFeed] = useState(() => ({ posts: [], authors: new Set() }))
  const [gitPosts, setGitPosts] = useState([])
  const [busy, setBusy] = useState(null)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const [expandedBranches, setExpandedBranches] = useState(() => new Set())
  const [localPost, setLocalPost] = useState(null)
  const [localProfile, setLocalProfile] = useState(null)
  const [sentReplies, setSentReplies] = useState([])
  const [feedError, setFeedError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [profileEdit, setProfileEdit] = useState(null)
  const profileDrafts = useRef(new Map())
  const [profileSaveStatus, setProfileSaveStatus] = useState(null)
  const storeProfileDraft = useCallback((author, draft) => {
    profileDrafts.current.set(author, draft)
  }, [])
  useEffect(() => {
    if (!profileSaveStatus) return
    const timer = setTimeout(() => setProfileSaveStatus(null), 6000)
    return () => clearTimeout(timer)
  }, [profileSaveStatus])
  const [openedProfileSetup, setOpenedProfileSetup] = useState(null)
  const [review, setReview] = useState(null)
  const reviewHeading = useRef(null)
  const [openComposition, setComposition] = useState(null)
  const composition = openComposition?.identity === identity ? openComposition : null
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
    const local = localPost && isFeedPost(localPost.parsed) && !archived.has(localPost.id) && !confirmed.some(post => post.id === localPost.id)
      ? [localPost] : []
    return indexMessages([...local, ...confirmed, ...synchronized])
  }, [feed.posts, gitPosts, localPost, peerPosts, sentReplies])
  const authors = useMemo(() => new Set([...feed.authors, ...gitPosts.map(post => post.author), ...peerPosts.map(post => post.author)]), [feed.authors, gitPosts, peerPosts])
  const profiles = useMemo(() => {
    const merged = new Map(feed.profiles)
    if (!feed.profiles) for (const post of feed.posts) mergeAuthorProfile(merged, post)
    for (const post of peerPosts) mergeAuthorProfile(merged, post)
    if (localPost) mergeAuthorProfile(merged, localPost)
    if (identity && localProfile?.author === identity) mergeAuthorProfile(merged, localProfile)
    return merged
  }, [feed.profiles, feed.posts, peerPosts, localPost, localProfile, identity])
  const ownProfile = profiles.get(identity)
  const ownPhoto = ownProfile?.image?.value
  const ownName = ownProfile?.name?.value
  useEffect(() => {
    onOwnProfileChange({ identity, photo: ownPhoto, name: ownName })
  }, [identity, ownPhoto, ownName, onOwnProfileChange])
  const route = socialRoute(hash, messages, authors, identity)
  const target = route?.kind === 'message' ? messages.byId.get(route.id) : null
  const parentId = target && replyParentId(target)
  const selectedReplyId = loaded && parentId ? target.id : null
  const parent = parentId && parentId !== target.id ? messages.byId.get(parentId) : null
  const threadRows = target ? collectThreadRows(target, parent, expandedBranches, visibleReplies) : []
  const threadIds = new Set(threadRows.map(row => row.post.id))
  const authorPosts = route?.kind === 'author' ? (messages.byAuthor.get(route.id) || []) : []
  const profile = route?.kind === 'author' ? profiles.get(route.id) : null
  const profileName = profile?.name?.value || (route?.id === identity && name.trim()) ||
    (authorPosts[0] ? authorName(authorPosts[0]) : route?.id?.slice(0, 12))
  const ownProfilePage = route?.kind === 'author' && route.id === identity && !blocked(route.id)
  const editingProfile = ownProfilePage && profileEdit?.id === identity
  const profileMessage = route?.kind === 'author' && composition?.recipient === route.id && !blocked(route.id)
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

  function beginComposition(kind, post, value, event, recipient) {
    if (readOnly || busy || pending !== false || identity === undefined) return
    replyTrigger.current = event?.currentTarget || null
    const key = `composer-draft:${identity || 'anonymous'}:${kind}:${post?.id || recipient}`
    if (composition?.key !== key) {
      const token = Symbol()
      // Mount the field during the tap so mobile browsers can open the keyboard.
      flushSync(() => {
        setComposition({ key, token, identity, kind, post, recipient, body: value, attachments: [], loading: true })
        setNotice(null)
      })
      readComposerDraft(key).then(saved => {
        setComposition(current => current?.token === token ? { ...current, ...saved, loading: false } : current)
      }).catch(() => {
        setComposition(current => current?.token === token
          ? { ...current, loading: false, draftError: 'Could not restore this draft.' } : current)
      })
    }
    actionField.current?.focus({ preventScroll: true })
    actionField.current?.scrollIntoView({ block: 'nearest' })
  }

  function updateComposition(context, changes) {
    const { body, attachments } = { ...context, ...changes }
    const revision = crypto.randomUUID()
    setComposition({ ...context, body, attachments, revision, draftError: null })
    saveComposerDraft(context.key, { body, attachments, revision }).catch(() => {
      setComposition(current => current?.revision === revision
        ? { ...current, draftError: 'Could not save this draft on this device.' } : current)
    })
  }

  function cancelComposition() {
    setComposition(null)
    setNotice(null)
    replyTrigger.current?.focus({ preventScroll: true })
  }

  async function discardComposition(context) {
    try {
      await clearComposerDraft(context.key, context.revision)
      setComposition(current => current?.revision === context.revision &&
        current?.token === context.token ? null : current)
      replyTrigger.current?.focus({ preventScroll: true })
    } catch {
      setComposition(current => current?.token === context.token
        ? { ...current, draftError: 'Could not discard this draft.' } : current)
    }
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
    const repository = messages.byId.get(gitRepositoryId(post))
    const repoName = gitCardType(repository?.parsed) === 'Repository' ? repository.parsed.name.trim() : undefined
    const id = showParent && replyParentId(post)
    const parentPost = messages.byId.get(id)
    const parentHidden = parentPost && (blocked(parentPost.author) || moderation.muted?.includes(parentPost.author)
      || moderation.hidden?.includes(id))
    const replyContext = id && { id, author: parentPost && !parentHidden ? authorName(parentPost) : null }
    const recipient = !replyParentId(post) && post.parsed.replyto
    const recipientContext = isMessageHash(recipient) && !blocked(recipient) && {
      id: recipient,
      name: profiles.get(recipient)?.name?.value || recipient.slice(0, 12),
    }
    return (
      <Fragment key={post.id}>
        <PostCard post={post} repoName={repoName} profile={profiles.get(post.author)} replyContext={replyContext} recipientContext={recipientContext} selected={selected} own={post.author === identity}
          versions={messages.edits.get(post.id) || []}
          replyCount={visibleReplies(post).length}
          branchExpanded={expandedBranches.has(post.id)}
          onToggleBranch={threadIds.has(post.id) ? () => toggleBranch(post.id) : undefined}
          hidden={moderation.hidden?.includes(post.id)} muted={moderation.muted?.includes(post.author)}
          blocked={blocked(post.author)} onCompose={beginComposition} onModerate={toggleModeration}
          composeDisabled={Boolean(busy) || pending !== false || identity === undefined} readOnly={readOnly} />
        {!readOnly && composition?.post?.id === post.id && renderInlineComposer(composition)}
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
    if (!identity) return
    let active = true
    readLocalProfile(identity).then(record => {
      if (!active) return
      setLocalProfile(current => current?.author === identity && (!record || current.timestamp >= record.timestamp)
        ? current : record)
    }).catch(() => {})
    return () => { active = false }
  }, [identity])

  useEffect(() => {
    if (readOnly) return
    let active = true
    readPendingPublication(hosted).then(post => { if (active) setLocalPost(post) }).catch(() => {})
    pendingPost(hosted).then(value => { if (active) setPending(value) }).catch(error => {
      if (active) setNotice({ message: error.message })
    })
    return () => { active = false }
  }, [readOnly])

  useEffect(() => {
    if (waitingForIdentity) return
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
          const cached = await readStoredFeed(readOnly).catch(() => null)
          if (cached && !controller.signal.aborted) {
            feedCheckpoint.current = cached
            setFeed(cached)
            void mirrorArchive(cached.posts)
            setLoaded(true)
          }
        }
        const value = await readFeed(hosted, signal, feedCheckpoint.current, readOnly)
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
  }, [attempt, readOnly, waitingForIdentity])

  function openProfileEditor(draft) {
    setProfileEdit({
      id: identity,
      name: profile?.name?.value || name.trim(),
      bio: profile?.bio?.value || '',
      links: profile?.links?.value || [],
      image: profile?.image?.value,
      photoState: profile?.photoState,
      draft,
    })
  }

  if (profileEdit && !ownProfilePage) setProfileEdit(null)

  if (ownProfilePage && profileSetup === identity && openedProfileSetup !== profileSetup) {
    setOpenedProfileSetup(profileSetup)
    openProfileEditor()
  }

  function discardProfileDraft(author) {
    profileDrafts.current.delete(author)
    setProfileEdit(null)
  }

  function restoreProfileIdentity(key) {
    if (key === identity) return
    onIdentityChange(key)
    onNameChange('')
    setProfileEdit(null)
    location.hash = socialHref(key)
  }

  async function saveProfile(metadata, photo) {
    if (readOnly || !editingProfile || busy || pending !== false) {
      throw Error('Profile editing is unavailable.')
    }
    setBusy('profile')
    setNotice(null)
    try {
      const { image, photoState } = profileEdit
      if (!photo && image) {
        metadata = { ...metadata, image, image_original: photoState?.original || '', image_crop: photoState?.crop || null }
      }
      const result = await publishProfile(hosted, profileEdit.id, metadata, photo)
      const waiting = result.relayed === false
      setPending(waiting ? { postId: null } : false)
      onNameChange(metadata.name)
      setLocalPost(await readLocalPost(result))
      discardProfileDraft(profileEdit.id)
      setProfileSaveStatus(waiting ? null : { id: profileEdit.id, message: 'Profile published' })
      setAttempt(n => n + 1)
      if (!waiting) {
        if (online) announcePeerPost(result)
      }
    } finally {
      setBusy(null)
    }
  }

  function isReviewing(context, body, attachments) {
    return review?.hash === hash && review.identity === identity && review.token === context?.token
      && review.body === body && review.attachments === attachments
  }

  async function submit(context = null, retry = false) {
    const body = context ? context.body : draft
    const attachments = context ? context.attachments : draftAttachments
    if (readOnly || busy || (!retry && (!identity || !isReviewing(context, body, attachments) || pending !== false))) return
    setBusy(retry ? 'retry' : context ? 'inline' : 'post')
    setNotice(null)
    try {
      const post = context?.post
      const editing = context?.kind === 'edit'
      const metadata = editing ? { edit: post.id } : post ? { reply: post.id, replyto: post.author }
        : context?.recipient ? { replyto: context.recipient } : {}
      const result = retry
        ? await retryPost(hosted)
        : await publishPost(hosted, identity, body.trim(), name.trim(), metadata, editing ? post.author : undefined, attachments)
      if (!retry) {
        setReview(null)
        if (context) {
          setComposition(null)
          if (context.revision) {
            await clearComposerDraft(context.key, context.revision)
              .catch(() => toast.error('Published draft could not be cleared from this device.'))
          }
        } else {
          setDraft('')
          setDraftAttachments([])
        }
        onIdentityChange(result.signature.slice(0, 44))
      }
      const waiting = result?.relayed === false
      setPending(waiting ? { postId: post?.id || null } : false)
      if (!context && !waiting) setComposerOpen(false)
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
          if (isProfileUpdate(local?.parsed)) setProfileSaveStatus({ id: local.author, message: 'Profile published' })
          else toast.success('Published', {
            action: { label: 'View post', onClick: () => { location.hash = socialHref(target) } },
          })
        }
      }
    } catch (error) {
      setNotice({ message: error.message, postId: context?.post?.id || pending?.postId })
      const waiting = await pendingPost(hosted).catch(() => null)
      if (waiting !== null) setPending(waiting)
    } finally {
      setBusy(null)
    }
  }

  function renderComposer(context = null) {
    const popup = !context && composerOpen
    const body = context ? context.body : draft
    const editing = context?.kind === 'edit'
    const attachments = context ? context.attachments : draftAttachments
    const setAttachments = context ? attachments => updateComposition(context, { attachments }) : setDraftAttachments
    const mediaInput = context ? actionMediaInput : draftMediaInput
    const sending = busy === (context ? 'inline' : 'post')
    const attachmentsDisabled = Boolean(busy) || context?.loading
    const reviewing = isReviewing(context, body, attachments)
    const publicationDisabled = !identity || (!body.trim() && !attachments.length) || attachmentsDisabled || pending !== false
    const label = editing ? 'Edit message' : context?.recipient ? 'Public message to ' + profileName
      : context ? 'Replying to ' + authorName(context.post) : 'Message'
    const placeholder = editing ? 'Edit your message…' : context?.recipient ? label + '…'
      : context ? 'Reply to ' + authorName(context.post) + '…' : 'Write a post…'
    return (
      <div className="space-y-3">
        <MessageAuthorHeader name={ownName || name.trim() || identity?.slice(0, 12) || 'You'} image={ownPhoto} className="px-0">
          <span>Now</span>
        </MessageAuthorHeader>
        {reviewing ? (
          <section className="space-y-3" aria-label={`Preview · ${label}`}>
            <h2 ref={reviewHeading} tabIndex={-1} className="sr-only">
              {context ? `Preview · ${label}` : 'Preview'}
            </h2>
            <PostBody body={body.trim()} attachment={editing ? context.post.parsed : undefined} />
            {attachments.length > 0 && <DraftAttachmentsPreview attachments={attachments} />}
            <div className="flex flex-wrap items-center gap-2">
              <ComposerAction label="Back to editing" icon={ArrowLeft} disabled={Boolean(busy)} onClick={() => {
                flushSync(() => setReview(null))
                const field = context ? actionField : composer
                field.current?.focus({ preventScroll: true })
              }} />
              <HelpPopover label="About publishing">
                Signed posts can be copied by other peers, so they can’t be recalled after publishing.
              </HelpPopover>
              <Button type="button" className="ml-auto" disabled={publicationDisabled} onClick={() => submit(context)}>
                {sending ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          </section>
        ) : <form className="space-y-3" onSubmit={event => {
          event.preventDefault()
          if (publicationDisabled) return
          flushSync(() => setReview({ hash, identity, token: context?.token, body, attachments }))
          reviewHeading.current?.focus({ preventScroll: true })
        }}>
          <Textarea aria-label={label} className="bg-muted dark:bg-muted" ref={context ? actionField : composer} value={body}
            onChange={event => context ? updateComposition(context, { body: event.target.value }) : setDraft(event.target.value)}
            readOnly={context?.loading} placeholder={placeholder} rows={3} maxLength={16000} disabled={sending} />
          {context?.draftError && <p role="alert" className="text-sm text-destructive">{context.draftError}</p>}
          {!editing && <MediaAttachments key={context?.key || 'draft'} attachments={attachments} onChange={setAttachments} input={mediaInput} disabled={attachmentsDisabled} />}
          <div className="flex flex-wrap items-center gap-2">
            {!editing && <MediaPicker input={mediaInput} disabled={attachmentsDisabled} />}
            {!identity && onChooseKey
              ? <ComposerAction label="Choose a public key" icon={KeyRound} variant="default" onClick={() => {
                  if (popup) {
                    composeTrigger.current = null
                    setComposerOpen(false)
                  }
                  onChooseKey()
                }} />
              : <Button type="submit" disabled={publicationDisabled}>Preview</Button>}
            {context && <ComposerAction label="Close" icon={X} disabled={Boolean(busy)} onClick={cancelComposition} />}
            {context?.revision && <ComposerAction label="Discard draft" icon={Trash2}
              disabled={Boolean(busy)} onClick={() => discardComposition(context)} />}
          </div>
        </form>}
      </div>
    )
  }

  function renderInlineComposer(context = null) {
    return <Card className={context ? 'mt-2 py-3' : 'py-4'}>
      <CardContent>{renderComposer(context)}</CardContent>
    </Card>
  }

  function renderDeliveryStatus() {
    return (
      <>
        {pending && (
          <Alert role="status">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Saved on this device. Delivery pending.</span>
              <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => submit(null, true)}>
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
      {!readOnly && !route && !composerOpen && renderInlineComposer()}
      {!readOnly && !inlineStatus && !composerOpen && renderDeliveryStatus()}
      {!readOnly && (
        <Dialog open={composerOpen} onOpenChange={open => { if (!busy) setComposerOpen(open) }}>
          <DialogContent aria-describedby={undefined} showCloseButton={!busy}
            className="flex min-h-0 flex-col overflow-hidden pt-10 sm:max-w-xl"
            onOpenAutoFocus={event => {
              const field = composer.current || reviewHeading.current
              if (field) {
                event.preventDefault()
                field.focus({ preventScroll: true })
              }
            }}
            onCloseAutoFocus={event => {
              event.preventDefault()
              composeTrigger.current?.focus({ preventScroll: true })
            }}>
            <DialogTitle className="sr-only">New post</DialogTitle>
            <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-1 pb-1">
              {composerOpen && renderComposer()}
              {renderDeliveryStatus()}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {route?.kind === 'author'
        ? <AuthorProfile id={route.id} profile={profile} blocked={blocked(route.id)} name={profileName}
            onMessage={!readOnly && route.id !== identity
              ? event => beginComposition('message', null, '', event, route.id) : undefined}
            saveStatus={profileSaveStatus?.id === route.id && ownProfilePage ? profileSaveStatus.message : ''}
            profileEditControl={ownProfilePage && (
              <ProfileEditorPopover open={editingProfile} saving={busy === 'profile'} identity={identity} initial={profileEdit}
                onOpen={() => openProfileEditor(profileDrafts.current.get(identity))} onClose={() => setProfileEdit(null)}
                onCancel={() => discardProfileDraft(identity)} onDraft={storeProfileDraft} onSave={saveProfile}
                onRestore={restoreProfileIdentity} busy={Boolean(busy)} canSave={!readOnly && pending === false} />
            )}
            messageDisabled={Boolean(busy) || pending !== false}
            onUnblock={() => toggleModeration('blocked', route.id)} />
        : <h2 className={route ? 'font-semibold' : 'sr-only'}>{route?.kind === 'message' ? 'Thread' : route ? 'Lookup' : 'Feed'}</h2>}
      {!readOnly && profileMessage && renderInlineComposer(composition)}
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
