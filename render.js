import { apds } from 'apds'
import { h } from 'h'
import { send } from './send.js'
import { queueSend } from './network_queue.js'
import { composer } from './composer.js'
import { markdown } from './markdown.js'
import { noteSeen } from './sync.js'
import { isBlockedAuthor, shouldHideMessage } from './moderation.js'
import { ensureHighlight } from './lazy_vendor.js'
import { addReplyToIndex, getReplyCount, getReplyDepth } from './reply_index.js'
import { makeFeedRow, upsertFeedRow, parseOpenedTimestamp } from './feed_row_cache.js'
import { perfStart, perfEnd } from './perf.js'
import { isHash, getOpenedFromQuery } from './utils.js'
import {
  getEditState, syncPrevious, updateEditSnippet,
  buildEditSummaryLine, buildEditSummaryRow, buildEditMessageShell,
  extractMetaNodes, invalidateEdits,
  registerMessage, buildEditNav, createEditActions,
  queueEditRefresh as _queueEditRefresh
} from './edit_renderer.js'
import { observeTimestamp } from './timestamp_observer.js'
import { insertByTimestamp } from './timestamp_insert.js'
import { buildQR } from './qr_widget.js'
import {
  initReplyRenderer, updateReplyCount, observeReplies,
  buildReplyIndex, refreshVisibleReplies,
  getReplyParent, appendReply, flushPendingReplies,
  hydrateReplyPreviews, comments
} from './reply_renderer.js'
import {
  initModerationUI, applyModerationStub, buildModerationControls
} from './moderation_ui.js'

export const render = {}
const cache = new Map()
let cachedPubkeyPromise = null

// Wire up modules that need late-bound render reference
initReplyRenderer(render)
initModerationUI(render)

const getCachedPubkey = async () => {
  if (!cachedPubkeyPromise) {
    cachedPubkeyPromise = apds.pubkey().catch((err) => {
      cachedPubkeyPromise = null
      throw err
    })
  }
  return cachedPubkeyPromise
}

const highlightCodeIn = async (container) => {
  if (!container) { return }
  const nodes = Array.from(container.querySelectorAll('pre code, pre'))
  if (!nodes.length) { return }
  let hljs
  try {
    hljs = await ensureHighlight()
  } catch (err) {
    console.warn('highlight load failed', err)
    return
  }
  if (!hljs || typeof hljs.highlightElement !== 'function') { return }
  nodes.forEach((node) => {
    const target = node.matches('pre') && node.querySelector('code')
      ? node.querySelector('code')
      : node
    if (!target || target.dataset.hljsDone === 'true') { return }
    hljs.highlightElement(target)
    target.dataset.hljsDone = 'true'
  })
}

render.buildReplyIndex = buildReplyIndex
render.refreshVisibleReplies = refreshVisibleReplies

const renderBody = async (body, replyHash) => {
  let html = body ? await markdown(body) : ''
  if (replyHash) {
    const preview = "<span class='reply-preview' data-reply-preview='" + replyHash + "'>" +
      "<span class='material-symbols-outlined reply-preview-icon'>Subdirectory_Arrow_left</span>" +
      "<a href='#" + replyHash + "' class='reply-preview-link'>" +
      replyHash.substring(0, 10) + "...</a></span>"
    html = preview + html
  }
  return html
}

const getRouteSrc = () => window.location.hash.substring(1)

const isThreadRoute = (src = getRouteSrc()) => src.length > 44

const getMessageKind = (yaml) => (getReplyParent(yaml) ? 'reply' : 'post')

const getRenderMode = (yaml) => {
  if (getMessageKind(yaml) !== 'reply') { return 'full' }
  return isThreadRoute() ? 'thread' : 'replyCompact'
}

const buildReplyContext = (replyHash, className = 'message-reply-context') => {
  if (!replyHash) { return null }
  const preview = h('span', { classList: 'reply-preview' }, [
    h('a', { href: '#' + replyHash, classList: 'reply-preview-link' }, [replyHash.substring(0, 10) + '...'])
  ])
  preview.dataset.replyPreview = replyHash
  return h('div', { classList: className }, [
    h('span', { classList: 'material-symbols-outlined message-reply-context-icon' }, ['Subdirectory_Arrow_left']),
    h('span', { classList: 'message-reply-context-label' }, ['Replying to']),
    preview
  ])
}

const applyRenderModeToWrapper = (hash, yaml) => {
  const wrapper = document.getElementById(hash)
  if (!wrapper) { return null }
  const mode = getRenderMode(yaml)
  wrapper.dataset.messageKind = getMessageKind(yaml)
  wrapper.dataset.renderMode = mode
  wrapper.dataset.replyDisplay = mode === 'thread' ? 'thread' : 'feed'
  wrapper.dataset.replyDepth = String(getReplyDepth(hash))
  return { wrapper, mode }
}

const canNestRepliesUnderWrapper = (wrapper) => (
  !!(wrapper && wrapper.dataset && wrapper.dataset.replyDisplay === 'thread')
)

const buildRawControls = (blob, opened, contentBlob) => {
  const rawDiv = h('div', {classList: 'message-raw'})
  let rawshow = true
  let rawContent

  const raw = h('a', {classList: 'material-symbols-outlined', onclick: async () => {
    if (rawshow) {
      if (!rawContent) {
        rawContent = h('pre', {classList: 'hljs'}, [blob + '\n\n' + opened + '\n\n' + (contentBlob || '')])
      }
      rawDiv.appendChild(rawContent)
      rawshow = false
    } else {
      rawContent.parentNode.removeChild(rawContent)
      rawshow = true
    }
  }}, ['Code'])

  return { raw, rawDiv }
}

const _insertByTimestamp = (container, hash, ts) => insertByTimestamp(container, hash, ts, render.hash)

const ensureOriginalMessage = async (targetHash) => {
  if (!targetHash) { return }
  const existing = document.getElementById(targetHash)
  const scroller = document.getElementById('scroller')
  if (!existing && scroller) {
    const signed = await apds.get(targetHash)
    if (signed) {
      const opened = await getOpenedFromQuery(targetHash)
      const ts = parseOpenedTimestamp(opened)
      _insertByTimestamp(scroller, targetHash, ts)
    }
  }
  const have = await apds.get(targetHash)
  if (!have) {
    await send(targetHash)
  }
}

const queueEditRefresh = (editHash) => _queueEditRefresh(editHash, ensureOriginalMessage, render.invalidateEdits, render.refreshEdits)

const buildRightMeta = ({ author, hash, blob, qrTarget, raw, ts }) => {
  const permalink = h('a', {href: '#' + blob, classList: 'material-symbols-outlined'}, ['Share'])
  return h('span', {classList: 'message-meta'}, [
    h('span', {classList: 'pubkey'}, [author.substring(0, 6)]),
    ' ',
    render.qr(hash, blob, qrTarget),
    ' ',
    permalink,
    ' ',
    raw,
    ' ',
    ts,
  ])
}

const applyProfile = async (contentHash, yaml) => {
  if (yaml.image) {
    const get = document.getElementById('image' + contentHash)
    if (get) {
      if (cache.get(yaml.image)) {
        get.src = cache.get(yaml.image)
      } else {
        const image = await apds.get(yaml.image)
        cache.set(yaml.image, image)
        if (image) {
          get.src = image
        } else { send(yaml.image) }
      }
    }
  }

  if (yaml.name) {
    const get = document.getElementById('name' + contentHash)
    if (get) { get.textContent = yaml.name }
  }
}

const queueLinkedHashes = async (yaml) => {
  if (!yaml) { return }
  const candidates = new Set()
  if (isHash(yaml.replyHash)) { candidates.add(yaml.replyHash) }
  if (isHash(yaml.reply)) { candidates.add(yaml.reply) }
  if (isHash(yaml.previous)) {
    candidates.add(yaml.previous)
  }
  if (isHash(yaml.edit)) { candidates.add(yaml.edit) }
  if (isHash(yaml.image)) { candidates.add(yaml.image) }
  const replyAuthor = isHash(yaml.replyto) ? yaml.replyto : (isHash(yaml.replyTo) ? yaml.replyTo : null)
  for (const hash of candidates) {
    if (hash === yaml.image) {
      const have = await apds.get(hash)
      if (!have) { queueSend(hash, { priority: 'low' }) }
      continue
    }
    const query = await apds.query(hash)
    if (!query || !query[0]) { queueSend(hash, { priority: 'low' }) }
  }
  if (replyAuthor) {
    const query = await apds.query(replyAuthor)
    if (!query || !query[0]) { queueSend(replyAuthor, { priority: 'low' }) }
  }
}

const buildPreviewNode = (row) => {
  const author = row?.author || ''
  const name = row?.name || (author ? author.substring(0, 10) : 'unknown')
  const preview = row?.preview || 'Loading message...'
  const replyCount = Number.isFinite(row?.replyCount) ? row.replyCount : 0
  const authorHref = author ? ('#' + author) : '#'
  return h('div', {classList: 'message message-preview'}, [
    h('div', {classList: 'message-main'}, [
      h('span', {classList: 'avatarlink'}, [name]),
      h('div', {classList: 'message-stack'}, [
        h('a', {href: authorHref, classList: 'avatarlink'}, [name]),
        h('div', {classList: 'message-body'}, [preview]),
        replyCount > 0
          ? h('div', {classList: 'message-meta'}, [`${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}`])
          : ''
      ])
    ])
  ])
}

render.applyRowPreview = (wrapper, row) => {
  if (!wrapper || !row) { return false }
  const shell = wrapper.classList && wrapper.classList.contains('message-wrapper')
    ? wrapper.querySelector('.message-shell')
    : wrapper
  if (!shell || !shell.classList || !shell.classList.contains('premessage')) { return false }
  if (shell.dataset.previewReady === 'true') { return false }
  while (shell.firstChild) {
    shell.firstChild.remove()
  }
  shell.appendChild(buildPreviewNode(row))
  shell.dataset.previewReady = 'true'
  if (row.ts && !wrapper.dataset.ts) {
    wrapper.dataset.ts = String(row.ts)
  }
  if (row.opened && !wrapper.dataset.opened) {
    wrapper.dataset.opened = row.opened
  }
  if (row.author && !wrapper.dataset.author) {
    wrapper.dataset.author = row.author
  }
  return true
}

render.registerMessage = (hash, data) => registerMessage(hash, data)
render.invalidateEdits = (hash) => invalidateEdits(hash)

// Wire up edit actions with render-local dependencies
const { refreshEdits, stepEdit } = createEditActions({
  renderBody, highlightCodeIn, hydrateReplyPreviews, applyProfile
})
render.refreshEdits = refreshEdits
render.stepEdit = stepEdit

render.qr = (hash, blob, target) => buildQR(hash, blob, target)

const renderEditMeta = async ({ blob, opened, hash, div, timestamp, contentHash, author, humanTime, img, contentBlob, yaml }) => {
  queueEditRefresh(yaml.edit)
  syncPrevious(yaml)

  const ts = h('a', {href: '#' + hash}, [humanTime])
  observeTimestamp(ts, timestamp)

  const qrTarget = h('div', {id: 'qr-target' + hash, classList: 'qr-target', style: 'margin: 8px auto 0 auto; text-align: center; width: min(90vw, 400px); max-width: 400px;'})
  const { raw, rawDiv } = buildRawControls(blob, opened, contentBlob)
  const right = buildRightMeta({ author, hash, blob, qrTarget, raw, ts })

  img.className = 'avatar'
  img.id = 'image' + contentHash
  img.style = 'float: left;'

  const summary = buildEditSummaryLine({
    name: yaml.name,
    editHash: yaml.edit,
    author,
    nameId: 'name' + contentHash,
  })
  updateEditSnippet(yaml.edit, summary)
  const summaryRow = buildEditSummaryRow({
    avatarLink: h('a', {href: '#' + author}, [img]),
    summary
  })
  const meta = buildEditMessageShell({
    id: div.id,
    right,
    summaryRow,
    rawDiv,
    qrTarget
  })
  meta.dataset.author = author
  if (div.dataset.ts) {
    meta.dataset.ts = div.dataset.ts
  }

  div.replaceWith(meta)
  await applyProfile(contentHash, yaml)
}

const buildActionRow = ({ author, hash, blob, opened, editButton, editedHint, editNav }) => {
  const replySlot = h('span', {classList: 'message-actions-reply'})
  const moderationControls = buildModerationControls({ author, hash, blob, opened })
  const editControls = h('span', {classList: 'message-actions-edit'}, [
    editButton || '',
    editButton ? ' ' : '',
    editedHint,
    ' ',
    editNav.wrap
  ])
  editControls.appendChild(moderationControls)
  return h('div', {classList: 'message-actions'}, [
    replySlot,
    editControls
  ])
}

const buildMessageDOM = async ({ blob, opened, hash, div, timestamp, contentHash, author, humanTime, img, contentBlob, yaml, renderMode }) => {
  const ts = h('a', {href: '#' + hash}, [humanTime])
  observeTimestamp(ts, timestamp)

  const pubkey = await getCachedPubkey()
  const canEdit = pubkey && pubkey === author
  const editButton = canEdit ? h('a', {
    classList: 'material-symbols-outlined',
    onclick: async (e) => {
      e.preventDefault()
      const state = getEditState(hash)
      const body = state.currentBody || state.baseYaml?.body || ''
      const overlay = await composer(null, { editHash: hash, editBody: body })
      document.body.appendChild(overlay)
    }
  }, ['Edit']) : null

  const { raw, rawDiv } = buildRawControls(blob, opened, contentBlob)

  const qrTarget = h('div', {id: 'qr-target' + hash, classList: 'qr-target', style: 'margin: 8px auto 0 auto; text-align: center; width: min(90vw, 400px); max-width: 400px;'})
  const editedHint = h('span', {classList: 'edit-hint', style: 'display: none;'}, [''])
  const editNav = buildEditNav(hash, render.stepEdit)
  const right = buildRightMeta({ author, hash, blob, qrTarget, raw, ts })

  img.className = 'avatar'
  img.id = 'image' + contentHash
  img.style = 'float: left;'

  const name = h('span', {id: 'name' + contentHash, classList: 'avatarlink'}, [author.substring(0, 10)])

  const content = h('div', {
    id: contentHash,
    classList: 'material-symbols-outlined content',
    onclick: async () => {
      const blob = await apds.get(contentHash)
      if (blob) {
        send(blob)
      } else {
        send(contentHash)
      }
    }
  }, ['Notes'])

  const actionsRow = buildActionRow({ author, hash, blob, opened, editButton, editedHint, editNav })
  const replyContext = renderMode === 'replyCompact'
    ? buildReplyContext(getReplyParent(yaml), 'message-reply-context message-reply-context-compact')
    : null

  const meta = h('div', {classList: 'message'}, [
    right,
    h('div', {classList: 'message-main'}, [
      h('a', {href: '#' + author}, [img]),
      h('div', {classList: 'message-stack'}, [
        h('a', {href: '#' + author}, [name]),
        replyContext || '',
        h('div', {classList: 'message-body'}, [
          h('div', {id: 'reply' + contentHash}),
          content,
          rawDiv,
          actionsRow
        ])
      ])
    ]),
    qrTarget
  ])

  div.replaceWith(meta)
  meta.classList.toggle('message-reply-compact', renderMode === 'replyCompact')
  meta.classList.toggle('message-thread-reply', renderMode === 'thread')
  render.registerMessage(hash, {
    author,
    baseTimestamp: timestamp,
    contentHash,
    contentDiv: content,
    editedHint,
    editNav
  })
  const commentsPromise = render.comments(hash, blob, meta, actionsRow)
  await Promise.all([
    commentsPromise,
    contentBlob ? render.content(contentHash, contentBlob, content, hash, yaml) : send(contentHash)
  ])
}

render.meta = async (blob, opened, hash, div, options = {}) => {
  const timestamp = opened.substring(0, 13)
  const contentHash = opened.substring(13)
  const author = blob.substring(0, 44)
  const wrapper = document.getElementById(hash)
  if (wrapper) {
    wrapper.dataset.ts = timestamp
    wrapper.dataset.author = author
  }

  const contentPromise = options.contentBlob !== undefined
    ? Promise.resolve(options.contentBlob)
    : apds.get(contentHash)
  const [humanTime, fallbackContentBlob, img] = await Promise.all([
    apds.human(timestamp),
    contentPromise,
    apds.visual(author)
  ])

  const contentBlob = options.contentBlob || fallbackContentBlob
  let yaml = options.yaml || null
  if (!yaml && contentBlob) {
    yaml = await apds.parseYaml(contentBlob)
  }
  const row = makeFeedRow({
    hash,
    opened,
    author,
    contentHash,
    yaml,
    ts: parseOpenedTimestamp(opened)
  })
  if (row) {
    row.replyCount = getReplyCount(hash)
    upsertFeedRow(row)
  }

  if (!options.forceShow) {
    const moderation = await shouldHideMessage({
      author,
      hash,
      body: yaml?.body || ''
    })
    if (moderation.hidden) {
      if (moderation.code === 'blocked-author') {
        const wrapper = document.getElementById(hash)
        if (wrapper) { wrapper.remove() }
        return
      }
      await applyModerationStub({
        target: div,
        hash,
        author,
        moderation,
        blob,
        opened
      })
      return
    }
  }

  const ctx = { blob, opened, hash, div, timestamp, contentHash, author, humanTime, img, contentBlob, yaml }
  const renderMode = getRenderMode(yaml)
  applyRenderModeToWrapper(hash, yaml)

  if (yaml && yaml.edit) {
    return renderEditMeta(ctx)
  }

  return buildMessageDOM({ ...ctx, renderMode })
}

render.comments = comments

const contentEditBranch = async (contentHash, yaml, div, messageHash) => {
  queueEditRefresh(yaml.edit)
  syncPrevious(yaml)
  const msgDiv = messageHash ? document.getElementById(messageHash) : null
  if (msgDiv && div && div.parentNode) {
    const state = getEditState(messageHash)
    const author = state && state.author ? state.author : null
    const summary = buildEditSummaryLine({
      name: yaml.name,
      editHash: yaml.edit,
      author,
      nameId: 'name' + contentHash,
    })
    updateEditSnippet(yaml.edit, summary)
    const avatarImg = msgDiv.querySelector('img.avatar')
    const avatarLink = avatarImg ? avatarImg.parentNode : null
    if (avatarLink && avatarImg) {
      while (avatarLink.firstChild) { avatarLink.removeChild(avatarLink.firstChild) }
      avatarLink.appendChild(avatarImg)
    }

    const summaryRow = buildEditSummaryRow({ avatarLink, summary })
    const { right, rawDiv, qrTarget } = extractMetaNodes(msgDiv)
    msgDiv.classList.add('edit-message')
    while (msgDiv.firstChild) { msgDiv.removeChild(msgDiv.firstChild) }
    if (right) { msgDiv.appendChild(right) }
    msgDiv.appendChild(summaryRow)
    msgDiv.appendChild(rawDiv)
    if (qrTarget) { msgDiv.appendChild(qrTarget) }

    await applyProfile(contentHash, yaml)
    await queueLinkedHashes(yaml)
    return
  }
  div.className = 'content'
  while (div.firstChild) { div.firstChild.remove() }
  const summaryRow = buildEditSummaryRow({
    summary: buildEditSummaryLine({ name: yaml.name, editHash: yaml.edit })
  })
  updateEditSnippet(yaml.edit, summaryRow)
  div.appendChild(summaryRow)
  await queueLinkedHashes(yaml)
}

const contentBioBranch = async (contentHash, yaml, div) => {
  div.classList.remove('material-symbols-outlined')
  const bioHtml = await markdown(yaml.bio)
  div.innerHTML = `<p><strong>New bio:</strong></p>${bioHtml}`
  await highlightCodeIn(div)
  await applyProfile(contentHash, yaml)
  await queueLinkedHashes(yaml)
}

const contentBodyBranch = async (contentHash, yaml, div, messageHash) => {
  div.className = 'content'
  if (yaml.replyHash) { yaml.reply = yaml.replyHash }
  if (messageHash && yaml.reply) {
    const messageWrapper = document.getElementById(messageHash)
    const messageOpened = messageWrapper?.dataset?.opened || null
    const messageTs = messageOpened ? parseOpenedTimestamp(messageOpened) : 0
    addReplyToIndex(yaml.reply, messageHash, messageTs, messageOpened)
    updateReplyCount(yaml.reply)
  }
  const wrapper = messageHash ? document.getElementById(messageHash) : null
  const renderMode = wrapper?.dataset?.renderMode || getRenderMode(yaml)
  if (renderMode === 'replyCompact') {
    div.innerHTML = await markdown(yaml.body)
  } else if (renderMode === 'thread') {
    div.innerHTML = await markdown(yaml.body)
    const threadContext = buildReplyContext(yaml.reply, 'message-reply-context message-reply-context-thread')
    if (threadContext) {
      div.prepend(threadContext)
    }
  } else {
    div.innerHTML = await renderBody(yaml.body, yaml.reply)
  }
  if (renderMode === 'thread') {
    div.classList.add('content-thread')
  }
  await highlightCodeIn(div)
  hydrateReplyPreviews(div)
  await applyProfile(contentHash, yaml)
  await queueLinkedHashes(yaml)

  if (messageHash) {
    render.registerMessage(messageHash, {
      baseYaml: yaml,
      contentHash,
      contentDiv: div,
      currentBody: yaml.body
    })
    await render.refreshEdits(messageHash)
  }
}

render.content = async (hash, blob, div, messageHash, preParsedYaml = null) => {
  const contentHashPromise = hash ? Promise.resolve(hash) : apds.hash(blob)
  const [contentHash, yaml] = await Promise.all([
    contentHashPromise,
    preParsedYaml ? Promise.resolve(preParsedYaml) : apds.parseYaml(blob)
  ])

  if (yaml && yaml.edit) {
    return contentEditBranch(contentHash, yaml, div, messageHash)
  }
  if (yaml && yaml.bio && (!yaml.body || !yaml.body.trim())) {
    return contentBioBranch(contentHash, yaml, div)
  }
  if (yaml && yaml.body) {
    return contentBodyBranch(contentHash, yaml, div, messageHash)
  }
}

render.blob = async (blob, meta = {}) => {
  const token = perfStart('render.blob', meta.hash || 'unknown')
  const forceShow = Boolean(meta.forceShow)
  let hash = meta.hash || null
  let wrapper = hash ? document.getElementById(hash) : null
  if (!hash && wrapper) { hash = wrapper.id }
  if (!hash) { hash = await apds.hash(blob) }
  if (!wrapper && hash) { wrapper = document.getElementById(hash) }

  let opened = meta.opened || (wrapper && wrapper.dataset ? wrapper.dataset.opened : null)
  if (!opened && hash) {
    opened = await getOpenedFromQuery(hash)
  }
  if (opened && wrapper && wrapper.dataset && !wrapper.dataset.opened) {
    wrapper.dataset.opened = opened
  }

  const div = wrapper && wrapper.classList.contains('message-wrapper')
    ? wrapper.querySelector('.message-shell')
    : wrapper
  let contentBlob = null
  let parsedYaml = null
  if (opened) {
    contentBlob = await apds.get(opened.substring(13))
    if (contentBlob) {
      parsedYaml = await apds.parseYaml(contentBlob)
      if (parsedYaml && parsedYaml.edit) {
        queueEditRefresh(parsedYaml.edit)
      }
    }
  }

  const getimg = document.getElementById('inlineimage' + hash)
  if (opened && div && !div.childNodes[1]) {
    await render.meta(blob, opened, hash, div, { forceShow, contentBlob, yaml: parsedYaml })
  } else if (div && !div.childNodes[1]) {
    if (div.className.includes('content')) {
      await render.content(hash, blob, div, null, parsedYaml)
    } else {
      const content = h('div', {classList: 'content'})
      const message = h('div', {classList: 'message'}, [content])
      div.replaceWith(message)
      await render.content(hash, blob, content, null, parsedYaml)
    }
  } else if (getimg) {
    getimg.src = blob
  }
  await flushPendingReplies(hash)
  perfEnd(token)
}

render.shouldWe = async (blob) => {
  const authorKey = blob?.substring(0, 44)
  if (authorKey && await isBlockedAuthor(authorKey)) {
    return
  }
  const [opened, hash] = await Promise.all([
    apds.open(blob),
    apds.hash(blob)
  ])
  if (!opened) {
    const yaml = await apds.parseYaml(blob)
    if (yaml) {
      await queueLinkedHashes(yaml)
    }
    return
  }
  const contentHash = opened.substring(13)
  const msg = await apds.get(contentHash)
  if (msg) {
    const yaml = await apds.parseYaml(msg)
    await queueLinkedHashes(yaml)
  } else {
    queueSend(contentHash, { priority: 'high' })
  }
  const already = await apds.get(hash)
  if (!already) {
    await apds.make(blob)
  }
  const inDom = document.getElementById(hash)
  if (opened && !inDom) {
    await noteSeen(blob.substring(0, 44))
    let yaml = null
    const msg = await apds.get(opened.substring(13))
    if (msg) {
      yaml = await apds.parseYaml(msg)
      if (yaml && yaml.edit) {
        queueEditRefresh(yaml.edit)
      }
    }
    const ts = parseOpenedTimestamp(opened)
    const scroller = document.getElementById('scroller')
    const replyTo = getReplyParent(yaml)
    if (replyTo) {
      addReplyToIndex(replyTo, hash, ts, opened)
      updateReplyCount(replyTo)
      const wrapper = document.getElementById(replyTo)
      if (canNestRepliesUnderWrapper(wrapper) && wrapper.dataset.repliesLoaded === 'true') {
        await appendReply(replyTo, hash, ts, blob, opened)
        return
      } else if (canNestRepliesUnderWrapper(wrapper)) {
        observeReplies(wrapper, replyTo)
        return
      }
    }
    if (scroller && window.__feedEnqueueMatching) {
      const queued = await window.__feedEnqueueMatching({
        hash,
        ts,
        blob,
        opened,
        author: authorKey
      })
      if (queued) { return }
    }
  }
}

render.hash = (hash, row = null) => {
  if (!hash) { return null }
  if (!document.getElementById(hash)) {
    const messageShell = h('div', {classList: 'message-shell premessage'})
    const replies = h('div', {classList: 'message-replies'})
    const wrapper = h('div', {id: hash, classList: 'message-wrapper'}, [
      messageShell,
      replies
    ])
    if (row) {
      render.applyRowPreview(wrapper, row)
    }
    return wrapper
  }
  return null
}

render.insertByTimestamp = (container, hash, ts) => _insertByTimestamp(container, hash, ts)
