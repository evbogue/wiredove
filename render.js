import { apds } from 'apds'
import { h } from 'h'
import { send } from './send.js'
import { queueSend } from './network_queue.js'
import { composer } from './composer.js'
import { markdown } from './markdown.js'
import { noteSeen } from './sync.js'
import { promptKeypair } from './identify.js'
import { addBlockedAuthor, addHiddenHash, addMutedAuthor, isBlockedAuthor, removeHiddenHash, removeMutedAuthor, shouldHideMessage } from './moderation.js'
import { ensureHighlight, ensureQRious } from './lazy_vendor.js'
import { addReplyToIndex, ensureReplyIndex, getReplyCount, getRepliesForParent } from './reply_index.js'
import { makeFeedRow, upsertFeedRow, parseOpenedTimestamp } from './feed_row_cache.js'
import { perfStart, perfEnd } from './perf.js'

export const render = {}
const cache = new Map()
const editsCache = new Map()
const EDIT_CACHE_TTL_MS = 5000
const replyCountTargets = new Map()
let replyObserver = null
const replyPreviewCache = new Map()
let cachedPubkeyPromise = null
const timestampInsertState = new WeakMap()

const editState = new Map()
const timestampRefreshMs = 60000
const visibleTimestamps = new Map()
let timestampObserver = null

const getEditState = (hash) => {
  if (!editState.has(hash)) {
    editState.set(hash, { currentIndex: null, userNavigated: false })
  }
  return editState.get(hash)
}

const getCachedPubkey = async () => {
  if (!cachedPubkeyPromise) {
    cachedPubkeyPromise = apds.pubkey().catch((err) => {
      cachedPubkeyPromise = null
      throw err
    })
  }
  return cachedPubkeyPromise
}

const refreshTimestamp = async (element, timestamp) => {
  if (!document.body.contains(element)) {
    const stored = visibleTimestamps.get(element)
    if (stored) { clearInterval(stored.intervalId) }
    visibleTimestamps.delete(element)
    return
  }
  element.textContent = await apds.human(timestamp)
}

const observeTimestamp = (element, timestamp) => {
  if (!element) { return }
  element.dataset.timestamp = timestamp
  if (!timestampObserver) {
    timestampObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const target = entry.target
        const ts = target.dataset.timestamp
        if (!ts) { return }
        if (entry.isIntersecting) {
          refreshTimestamp(target, ts)
          if (!visibleTimestamps.has(target)) {
            const intervalId = setInterval(() => {
              refreshTimestamp(target, ts)
            }, timestampRefreshMs)
            visibleTimestamps.set(target, { intervalId })
          }
        } else {
          const stored = visibleTimestamps.get(target)
          if (stored) { clearInterval(stored.intervalId) }
          visibleTimestamps.delete(target)
        }
      })
    })
  }
  timestampObserver.observe(element)
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

const updateReplyCount = (parentHash) => {
  const target = replyCountTargets.get(parentHash)
  if (!target) { return }
  const count = getReplyCount(parentHash)
  target.textContent = count ? count.toString() : ''
}

const observeReplies = (wrapper, parentHash) => {
  if (!wrapper) { return }
  if (!replyObserver) {
    replyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const target = entry.target
        if (!entry.isIntersecting) { return }
        const hash = target.dataset.replyParent
        if (!hash) { return }
        if (target.dataset.repliesLoaded === 'true') { return }
        const list = getRepliesForParent(hash)
        if (!list.length) {
          target.dataset.repliesLoaded = 'true'
          return
        }
        void (async () => {
          for (const item of list) {
            await appendReply(hash, item.hash, item.ts, null, item.opened)
          }
          target.dataset.repliesLoaded = 'true'
        })()
      })
    })
  }
  wrapper.dataset.replyParent = parentHash
  replyObserver.observe(wrapper)
}

render.buildReplyIndex = async (log = null) => {
  replyCountTargets.clear()
  await ensureReplyIndex(log)
}

render.refreshVisibleReplies = () => {
  replyCountTargets.forEach((_, parentHash) => {
    updateReplyCount(parentHash)
  })
  const wrappers = Array.from(document.querySelectorAll('.message-wrapper'))
  wrappers.forEach((wrapper) => {
    const parentHash = wrapper.id
    if (!parentHash) { return }
    if (wrapper.dataset.repliesLoaded === 'true') { return }
    if (!getReplyCount(parentHash)) { return }
    observeReplies(wrapper, parentHash)
  })
}

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

const queueEditRefresh = (editHash) => {
  if (!editHash) { return }
  void (async () => {
    await ensureOriginalMessage(editHash)
    render.invalidateEdits(editHash)
    await render.refreshEdits(editHash, { forceLatest: true })
  })()
}

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

const isHash = (value) => typeof value === 'string' && value.length === 44

const getOpenedFromQuery = async (hash) => {
  if (!hash) { return null }
  const query = await apds.query(hash)
  if (Array.isArray(query) && query[0] && query[0].opened) {
    return query[0].opened
  }
  if (query && query.opened) {
    return query.opened
  }
  return null
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

const summarizeBody = (body, maxLen = 50) => {
  if (!body) { return '' }
  const single = body.replace(/\s+/g, ' ').trim()
  if (single.length <= maxLen) { return single }
  return single.substring(0, maxLen) + '...'
}

const fetchReplyPreview = async (replyHash) => {
  if (!replyHash) { return null }
  if (replyPreviewCache.has(replyHash)) { return replyPreviewCache.get(replyHash) }
  const signed = await apds.get(replyHash)
  if (!signed) {
    queueSend(replyHash, { priority: 'low' })
    replyPreviewCache.set(replyHash, null)
    return null
  }
  const opened = await getOpenedFromQuery(replyHash)
  if (!opened || opened.length < 14) {
    replyPreviewCache.set(replyHash, null)
    return null
  }
  const contentHash = opened.substring(13)
  const content = await apds.get(contentHash)
  if (!content) {
    queueSend(contentHash, { priority: 'low' })
    replyPreviewCache.set(replyHash, null)
    return null
  }
  const yaml = await apds.parseYaml(content)
  const author = signed.substring(0, 44)
  const name = yaml && yaml.name ? yaml.name.trim() : author.substring(0, 10)
  const body = yaml && yaml.body ? summarizeBody(yaml.body, 20) : ''
  let avatarSrc = null
  try {
    const img = await apds.visual(author)
    avatarSrc = img && img.src ? img.src : null
  } catch {
    avatarSrc = null
  }
  const preview = { author, name, body, avatarSrc }
  replyPreviewCache.set(replyHash, preview)
  return preview
}

const hydrateReplyPreviews = (container) => {
  if (!container) { return }
  const targets = container.querySelectorAll('[data-reply-preview]')
  targets.forEach(target => {
    if (target.dataset.replyPreviewHydrated === 'true') { return }
    target.dataset.replyPreviewHydrated = 'true'
    const replyHash = target.dataset.replyPreview
    if (!replyHash) { return }
    void (async () => {
      const preview = await fetchReplyPreview(replyHash)
      if (!preview) { return }
      while (target.firstChild) { target.firstChild.remove() }
      if (preview.name && preview.author) {
        target.appendChild(h('a', {
          href: '#' + preview.author,
          classList: 'reply-preview-author'
        }, [preview.name]))
      }
      target.appendChild(h('span', {
        classList: 'material-symbols-outlined reply-preview-icon'
      }, ['Subdirectory_Arrow_left']))
      const linkText = preview.body || (replyHash.substring(0, 10) + '...')
      const link = h('a', {
        href: '#' + replyHash,
        classList: 'reply-preview-link',
        title: preview.name || ''
      }, [linkText])
      target.appendChild(link)
    })()
  })
}

const fetchEditSnippet = async (editHash) => {
  if (!editHash) { return '' }
  const signed = await apds.get(editHash)
  if (!signed) { return '' }
  const opened = await getOpenedFromQuery(editHash)
  if (!opened || opened.length < 14) { return '' }
  const content = await apds.get(opened.substring(13))
  if (!content) { return '' }
  const yaml = await apds.parseYaml(content)
  return yaml && yaml.body ? summarizeBody(yaml.body) : ''
}

const syncPrevious = (yaml) => {
  if (!yaml || !yaml.previous) { return }
  void (async () => {
    const check = await apds.query(yaml.previous)
    if (!check[0]) {
      await send(yaml.previous)
    }
  })()
}

const updateEditSnippet = (editHash, summaryEl) => {
  if (!editHash || !summaryEl) { return }
  void (async () => {
    const snippet = await fetchEditSnippet(editHash)
    if (!snippet) { return }
    const link = summaryEl.querySelector('.edit-summary-link')
    if (link) { link.textContent = snippet }
  })()
}

const buildEditSummaryLine = ({ name, editHash, author, nameId, snippet }) => {
  const safeName = name || (author ? author.substring(0, 10) : 'Someone')
  const safeSnippet = snippet || 'message'
  const nameEl = author
    ? h('a', {href: '#' + author, id: nameId, classList: 'avatarlink'}, [safeName])
    : h('span', {id: nameId, classList: 'avatarlink'}, [safeName])
  return h('span', {classList: 'edit-summary'}, [
    nameEl,
    h('span', {classList: 'edit-summary-verb'}, ['edited']),
    h('a', {href: '#' + editHash, classList: 'edit-summary-link'}, [safeSnippet])
  ])
}

const buildEditSummaryRow = ({ avatarLink, summary }) => {
  const stack = h('div', {classList: 'message-stack'}, [summary])
  return h('div', {classList: 'message-main'}, [
    avatarLink || '',
    stack
  ])
}

const buildEditMessageShell = ({ id, right, summaryRow, rawDiv, qrTarget }) => {
  return h('div', {id, classList: 'message edit-message'}, [
    right,
    summaryRow,
    rawDiv,
    qrTarget
  ])
}

const extractMetaNodes = (msgDiv) => {
  const right = msgDiv.querySelector('.message-meta')
  const rawDiv = msgDiv.querySelector('.message-raw') || h('div', {classList: 'message-raw'})
  const qrTarget = msgDiv.querySelector('.qr-target')
  return { right, rawDiv, qrTarget }
}

const ensureOriginalMessage = async (targetHash) => {
  if (!targetHash) { return }
  const existing = document.getElementById(targetHash)
  const scroller = document.getElementById('scroller')
  if (!existing && scroller) {
    const signed = await apds.get(targetHash)
    if (signed) {
      const opened = await getOpenedFromQuery(targetHash)
      const ts = parseOpenedTimestamp(opened)
      insertByTimestamp(scroller, targetHash, ts)
    }
  }
  const have = await apds.get(targetHash)
  if (!have) {
    await send(targetHash)
  }
}

const normalizeTimestamp = (ts) => {
  const value = Number.parseInt(ts, 10)
  return Number.isNaN(value) ? 0 : value
}

const buildTimestampState = (container) => {
  const entries = []
  const children = Array.from(container.children)
  for (const child of children) {
    if (!child || !child.dataset) { continue }
    const childTs = normalizeTimestamp(child.dataset.ts)
    if (!childTs) { continue }
    entries.push({ ts: childTs, node: child })
  }
  entries.sort((a, b) => b.ts - a.ts)
  return {
    entries,
    childCount: children.length
  }
}

const getTimestampState = (container) => {
  const existing = timestampInsertState.get(container)
  const currentChildCount = container.children.length
  if (existing && existing.childCount === currentChildCount) {
    return existing
  }
  const next = buildTimestampState(container)
  timestampInsertState.set(container, next)
  return next
}

const findInsertIndex = (entries, stamp) => {
  let lo = 0
  let hi = entries.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (entries[mid].ts >= stamp) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

const removeEntryForNode = (entries, node) => {
  const idx = entries.findIndex((entry) => entry.node === node)
  if (idx >= 0) {
    entries.splice(idx, 1)
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

const insertByTimestamp = (container, hash, ts) => {
  if (!container || !hash) { return null }
  const stamp = normalizeTimestamp(ts)
  if (!stamp) { return null }
  const state = getTimestampState(container)
  const entries = state.entries
  let div = document.getElementById(hash)
  if (!div) {
    div = render.hash(hash)
  }
  if (!div) { return null }
  div.dataset.ts = stamp.toString()
  if (div.parentNode === container) {
    removeEntryForNode(entries, div)
    container.removeChild(div)
  }
  const insertIdx = findInsertIndex(entries, stamp)
  const beforeNode = insertIdx < entries.length ? entries[insertIdx].node : null
  if (beforeNode && beforeNode.parentNode === container) {
    container.insertBefore(div, beforeNode)
  } else {
    const sentinel = container.querySelector('#scroll-sentinel')
    if (sentinel && sentinel.parentNode === container) {
      container.insertBefore(div, sentinel)
    } else {
      container.appendChild(div)
    }
  }
  entries.splice(insertIdx, 0, { ts: stamp, node: div })
  state.childCount = container.children.length
  return div
}

const getReplyParent = (yaml) => {
  if (!yaml) { return null }
  return yaml.replyHash || yaml.reply || null
}

const appendReply = async (parentHash, replyHash, ts, replyBlob = null, replyOpened = null) => {
  const wrapper = document.getElementById(parentHash)
  const repliesContainer = wrapper ? wrapper.querySelector('.message-replies') : null
  if (!repliesContainer) { return false }
  const blob = replyBlob || await apds.get(replyHash)
  if (!blob) { return false }
  let replyWrapper = document.getElementById(replyHash)
  if (!replyWrapper) {
    replyWrapper = render.hash(replyHash)
  }
  if (!replyWrapper) { return true }
  if (replyOpened) {
    replyWrapper.dataset.opened = replyOpened
  }
  const scroller = document.getElementById('scroller')
  if (scroller && scroller.contains(replyWrapper)) {
    await render.blob(blob, { hash: replyHash, opened: replyOpened })
    return true
  }
  const replyParent = replyWrapper.parentNode
  const alreadyNested = replyParent && replyParent.classList && replyParent.classList.contains('reply')
  if (!alreadyNested || replyParent.parentNode !== repliesContainer) {
    const replyContain = h('div', {classList: 'reply'})
    if (ts) { replyContain.dataset.ts = ts.toString() }
    replyContain.appendChild(replyWrapper)
    repliesContainer.appendChild(replyContain)
  }
  await render.blob(blob, { hash: replyHash, opened: replyOpened })
  return true
}

const flushPendingReplies = async (parentHash) => {
  const wrapper = document.getElementById(parentHash)
  if (!wrapper) { return }
  const list = getRepliesForParent(parentHash)
  if (!list.length) { return }
  observeReplies(wrapper, parentHash)
}


const fetchEditsForMessage = async (hash, author) => {
  if (!author) { return [] }
  const cached = editsCache.get(hash)
  const now = Date.now()
  if (cached && now - cached.at < EDIT_CACHE_TTL_MS) {
    return cached.edits
  }
  const log = await apds.query(author)
  if (!log) { return [] }
  const edits = []
  for (const msg of log) {
    let text = msg.text
    if (!text && msg.opened) {
      text = await apds.get(msg.opened.substring(13))
    }
    if (!text) { continue }
    const yaml = await apds.parseYaml(text)
    if (yaml && yaml.edit === hash) {
      const ts = msg.ts || parseOpenedTimestamp(msg.opened)
      edits.push({ hash: msg.hash, author: msg.author || author, ts, yaml })
    }
  }
  edits.sort((a, b) => a.ts - b.ts)
  editsCache.set(hash, { at: now, edits })
  return edits
}

render.registerMessage = (hash, data) => {
  const state = getEditState(hash)
  Object.assign(state, data)
}

render.invalidateEdits = (hash) => {
  editsCache.delete(hash)
}

render.stepEdit = async (hash, delta) => {
  const state = getEditState(hash)
  if (!state.baseYaml) { return }
  const edits = (await fetchEditsForMessage(hash, state.author))
    .filter(edit => !state.author || edit.author === state.author)
  const total = edits.length + 1
  if (total <= 1) { return }
  const nextIndex = Math.max(0, Math.min((state.currentIndex ?? total - 1) + delta, total - 1))
  state.currentIndex = nextIndex
  state.userNavigated = true
  await render.refreshEdits(hash)
}

render.refreshEdits = async (hash, options = {}) => {
  const state = getEditState(hash)
  if (!state.baseYaml || !state.contentDiv) { return }
  const edits = (await fetchEditsForMessage(hash, state.author))
    .filter(edit => !state.author || edit.author === state.author)
  if (!edits.length) {
    if (state.editNav) { state.editNav.wrap.style.display = 'none' }
    if (state.editedHint) { state.editedHint.style.display = 'none' }
    return
  }

  const total = edits.length + 1
  const latestIndex = total - 1
  if (options.forceLatest || (!state.userNavigated && state.currentIndex === null)) {
    state.currentIndex = latestIndex
  }
  if (state.currentIndex === null) { state.currentIndex = latestIndex }
  state.currentIndex = Math.max(0, Math.min(state.currentIndex, latestIndex))

  if (state.editNav) {
    state.editNav.wrap.style.display = 'inline'
    state.editNav.index.textContent = (state.currentIndex + 1) + '/' + total
    state.editNav.left.classList.toggle('disabled', state.currentIndex === 0)
    state.editNav.right.classList.toggle('disabled', state.currentIndex === latestIndex)
  }

  const currentEdit = state.currentIndex > 0 ? edits[state.currentIndex - 1] : null
  const hintEdit = currentEdit || edits[edits.length - 1]
  if (state.editedHint) {
    const hintTs = hintEdit.ts ? hintEdit.ts.toString() : state.baseTimestamp
    state.editedHint.textContent = hintTs ? 'edit: ' + await apds.human(hintTs) : 'edit'
    state.editedHint.style.display = 'inline'
  }

  const baseReply = state.baseYaml.reply || state.baseYaml.replyHash
  const bodySource = currentEdit && currentEdit.yaml && currentEdit.yaml.body
    ? currentEdit.yaml.body
    : state.baseYaml.body
  state.currentBody = bodySource
  state.contentDiv.innerHTML = await renderBody(bodySource, baseReply)
  await highlightCodeIn(state.contentDiv)
  hydrateReplyPreviews(state.contentDiv)
  if (!currentEdit) {
    await applyProfile(state.contentHash, state.baseYaml)
  }
}

render.qr = (hash, blob, target) => {
  const link = h('a', {
    onclick: async () => {
      const qrTarget = target || document.getElementById('qr-target' + hash)
      if (!qrTarget) { return }
      if (!qrTarget.firstChild) {
        const canvas = document.createElement('canvas')
        qrTarget.appendChild(canvas)
        const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        const background = darkMode ? '#222' : '#f8f8f8'
        const foreground = darkMode ? '#ccc' : '#444'
        const maxSize = Math.min(
          400,
          Math.floor(window.innerWidth * 0.9),
          Math.floor(window.innerHeight * 0.6)
        )
        const size = Math.max(160, maxSize)
        try {
          const QRious = await ensureQRious()
          new QRious({
            element: canvas,
            value: location.href + blob,
            size,
            background,
            foreground,
          })
        } catch (err) {
          console.warn('QRious load failed', err)
          while (qrTarget.firstChild) {
            qrTarget.firstChild.remove()
          }
        }
      } else {
        while (qrTarget.firstChild) {
          qrTarget.firstChild.remove()
        }
      }
    },
    classList: 'material-symbols-outlined'
  }, ['Qr_Code'])

  return link
}

const buildEditNav = (hash) => {
  const left = h('a', {
    classList: 'material-symbols-outlined edit-nav-btn',
    onclick: async (e) => {
      e.preventDefault()
      await render.stepEdit(hash, -1)
    }
  }, ['Chevron_Left'])

  const index = h('span', {classList: 'edit-nav-index'}, [''])

  const right = h('a', {
    classList: 'material-symbols-outlined edit-nav-btn',
    onclick: async (e) => {
      e.preventDefault()
      await render.stepEdit(hash, 1)
    }
  }, ['Chevron_Right'])

  const wrap = h('span', {classList: 'edit-nav', style: 'display: none;'}, [
    left,
    index,
    right
  ])

  return { wrap, left, right, index }
}

const findMessageTarget = (hash) => {
  if (!hash) { return null }
  const wrapper = document.getElementById(hash)
  if (!wrapper) { return null }
  return wrapper.querySelector('.message') || wrapper.querySelector('.message-shell')
}

const applyModerationStub = async ({ target, hash, author, moderation, blob, opened }) => {
  if (!target || !moderation || !moderation.hidden) { return }
  const stub = h('div', {classList: 'message moderation-hidden'})
  const title = h('span', {classList: 'moderation-hidden-title'}, ['Hidden by local moderation'])
  const actions = h('span', {classList: 'moderation-hidden-actions'})
  const showOnce = h('button', {
    onclick: async () => {
      await render.meta(blob, opened, hash, stub, { forceShow: true })
    }
  }, ['Show once'])
  actions.appendChild(showOnce)

  if (moderation.code === 'muted-author') {
    const unmute = h('button', {
      onclick: async () => {
        await removeMutedAuthor(author)
        await render.meta(blob, opened, hash, stub)
      }
    }, ['Unmute'])
    actions.appendChild(unmute)
  } else if (moderation.code === 'hidden-hash') {
    const unhide = h('button', {
      onclick: async () => {
        await removeHiddenHash(hash)
        await render.meta(blob, opened, hash, stub)
      }
    }, ['Unhide'])
    actions.appendChild(unhide)
  } else if (moderation.code === 'muted-word') {
    actions.appendChild(h('a', {href: '#settings'}, ['Edit filters']))
  }

  stub.appendChild(title)
  stub.appendChild(actions)
  target.replaceWith(stub)
}

const buildModerationControls = ({ author, hash, blob, opened }) => {
  const hide = h('a', {
    classList: 'material-symbols-outlined',
    title: 'Hide message',
    onclick: async (e) => {
      e.preventDefault()
      await addHiddenHash(hash)
      const target = findMessageTarget(hash)
      if (target) {
        await applyModerationStub({
          target,
          hash,
          author,
          moderation: { hidden: true, reason: 'Hidden message', code: 'hidden-hash' },
          blob,
          opened
        })
      } else {
        location.reload()
      }
    }
  }, ['Visibility_Off'])

  const block = h('a', {
    classList: 'material-symbols-outlined',
    title: 'Block author',
    onclick: async (e) => {
      e.preventDefault()
      if (!confirm('Block this author and purge their local data?')) { return }
      window.__feedStatus?.('Blocking author…', { sticky: true })
      const result = await addBlockedAuthor(author)
      const removed = result?.purge?.removed ?? 0
      const blobs = result?.purge?.blobs ?? 0
      if (result?.purge) {
        window.__feedStatus?.(`Blocked author. Removed ${removed} post${removed === 1 ? '' : 's'}, ${blobs} blob${blobs === 1 ? '' : 's'}.`)
      } else {
        window.__feedStatus?.('Blocked author.')
      }
      const wrappers = Array.from(document.querySelectorAll('.message-wrapper'))
        .filter(node => node.dataset?.author === author)
      if (wrappers.length) {
        wrappers.forEach(node => node.remove())
      } else {
        const wrapper = document.getElementById(hash)
        if (wrapper) {
          wrapper.remove()
        } else {
          location.reload()
        }
      }
    }
  }, ['Block'])

  const mute = h('a', {
    classList: 'material-symbols-outlined',
    title: 'Mute author',
    onclick: async (e) => {
      e.preventDefault()
      await addMutedAuthor(author)
      const target = findMessageTarget(hash)
      if (target) {
        await applyModerationStub({
          target,
          hash,
          author,
          moderation: { hidden: true, reason: 'Muted author', code: 'muted-author' },
          blob,
          opened
        })
      } else {
        location.reload()
      }
    }
  }, ['Person_Off'])

  return h('span', {classList: 'message-actions-mod'}, [hide, mute, block])
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

  if (yaml && yaml.edit) {
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
    return
  }

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
  const editNav = buildEditNav(hash)
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
  const actionsRow = h('div', {classList: 'message-actions'}, [
    replySlot,
    editControls
  ])

  const meta = h('div', {classList: 'message'}, [
    right,
    h('div', {classList: 'message-main'}, [
      h('a', {href: '#' + author}, [img]),
      h('div', {classList: 'message-stack'}, [
        h('a', {href: '#' + author}, [name]),
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
  render.registerMessage(hash, {
    author,
    baseTimestamp: timestamp,
    contentHash,
    contentDiv: content,
    editedHint,
    editNav
  })
  const comments = render.comments(hash, blob, meta, actionsRow)
  await Promise.all([
    comments,
    contentBlob ? render.content(contentHash, contentBlob, content, hash, yaml) : send(contentHash)
  ])
} 

render.comments = async (hash, blob, div, actionsRow) => {
  const num = h('span')
  replyCountTargets.set(hash, num)
  updateReplyCount(hash)
  const list = getRepliesForParent(hash)
  if (list.length) {
    const wrapper = document.getElementById(hash)
    observeReplies(wrapper, hash)
  }

  const reply = h('a', {
    classList: 'material-symbols-outlined',
    onclick: async () => {
      if (document.getElementById('reply-composer-' + hash)) { return }
      if (await apds.pubkey()) {
        div.after(await composer(blob))
        return
      }
      promptKeypair()
    }
  }, ['Chat_Bubble'])

  if (actionsRow) {
    const slot = actionsRow.querySelector('.message-actions-reply')
    if (slot) {
      slot.appendChild(reply)
      slot.appendChild(h('span', [' ']))
      slot.appendChild(num)
    }
  } else {
    const target = h('div', {style: 'margin-left: 43px;'})
    target.appendChild(reply)
    target.appendChild(h('span', [' ']))
    target.appendChild(num)
    div.appendChild(target)
  }
}

render.content = async (hash, blob, div, messageHash, preParsedYaml = null) => {
  const contentHashPromise = hash ? Promise.resolve(hash) : apds.hash(blob)
  const [contentHash, yaml] = await Promise.all([
    contentHashPromise,
    preParsedYaml ? Promise.resolve(preParsedYaml) : apds.parseYaml(blob)
  ])

  if (yaml && yaml.edit) {
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
    return
  }

  if (yaml && yaml.bio && (!yaml.body || !yaml.body.trim())) {
    div.classList.remove('material-symbols-outlined')
    const bioHtml = await markdown(yaml.bio)
    div.innerHTML = `<p><strong>New bio:</strong></p>${bioHtml}`
    await highlightCodeIn(div)
    await applyProfile(contentHash, yaml)
    await queueLinkedHashes(yaml)
    return
  }

  if (yaml && yaml.body) {
    div.className = 'content'
    if (yaml.replyHash) { yaml.reply = yaml.replyHash }
    if (messageHash && yaml.reply) {
      const messageWrapper = document.getElementById(messageHash)
      const messageOpened = messageWrapper?.dataset?.opened || null
      const messageTs = messageOpened ? parseOpenedTimestamp(messageOpened) : 0
      addReplyToIndex(yaml.reply, messageHash, messageTs, messageOpened)
      updateReplyCount(yaml.reply)
    }
    div.innerHTML = await renderBody(yaml.body, yaml.reply)
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

    //if (yaml.reply || yaml.replyHash) {
    //  if (yaml.replyHash) { yaml.reply = yaml.replyHash}
    //  try {
    //    const get = await document.getElementById('reply' + contentHash)
    //    const query = await apds.query(yaml.reply)
    //    if (get && query && query[0]) {
    //      const replyYaml = await apds.parseYaml(query[0].text)
    //      const replyDiv = h('div', {classList: 'breadcrumbs'}, [
    //        h('span', {classList: 'material-symbols-outlined'}, ['Subdirectory_Arrow_left']),
    //        ' ',
    //        h('a', {href: '#' + query[0].author}, [replyYaml.name || query[0].author.substring(0, 10)]), 
    //        ' | ',
    //        h('a', {href: '#' + query[0].hash}, [replyYaml.body.substring(0, 24) || query[0].hash.substring(0, 10)])
    //      ])
    //      get.appendChild(replyDiv)
    //    }
    //  } catch (err) {
    //    //console.log(err)
    //  }
    //}
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
    //await render.comments(hash, blob, div)
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
    const src = window.location.hash.substring(1)
    const al = []
    const aliases = localStorage.getItem(src)
    if (aliases) {
      const parse = JSON.parse(aliases)
      al.push(...parse)
      console.log(al)
    }
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
    // this should detect whether the syncing message is newer or older and place the msg in the right spot
    const replyTo = getReplyParent(yaml)
    if (replyTo) {
      addReplyToIndex(replyTo, hash, ts, opened)
      updateReplyCount(replyTo)
      const wrapper = document.getElementById(replyTo)
      if (wrapper && wrapper.dataset.repliesLoaded === 'true') {
        await appendReply(replyTo, hash, ts, blob, opened)
      } else if (wrapper) {
        observeReplies(wrapper, replyTo)
      }
      return
    }
    if (scroller && (authorKey === src || hash === src || al.includes(authorKey))) {
      if (window.__feedEnqueue) {
        const queued = await window.__feedEnqueue(src, { hash, ts, blob, opened })
        if (queued) { return }
      }
      return
    }
    if (scroller && src === '') {
      if (window.__feedEnqueue) {
        const queued = await window.__feedEnqueue(src, { hash, ts, blob, opened })
        if (queued) { return }
      }
      return
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

render.insertByTimestamp = (container, hash, ts) => insertByTimestamp(container, hash, ts)
