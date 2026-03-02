import { apds } from 'apds'
import { h } from 'h'
import { send } from './send.js'
import { getOpenedFromQuery } from './utils.js'
import { parseOpenedTimestamp } from './feed_row_cache.js'

const editsCache = new Map()
const EDIT_CACHE_TTL_MS = 5000
const editState = new Map()

export const getEditState = (hash) => {
  if (!editState.has(hash)) {
    editState.set(hash, { currentIndex: null, userNavigated: false })
  }
  return editState.get(hash)
}

const summarizeBody = (body, maxLen = 50) => {
  if (!body) { return '' }
  const single = body.replace(/\n+/g, ' ').trim()
  if (single.length <= maxLen) { return single }
  return single.substring(0, maxLen) + '...'
}

export const fetchEditSnippet = async (editHash) => {
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

export const syncPrevious = (yaml) => {
  if (!yaml || !yaml.previous) { return }
  void (async () => {
    const check = await apds.query(yaml.previous)
    if (!check[0]) {
      await send(yaml.previous)
    }
  })()
}

export const updateEditSnippet = (editHash, summaryEl) => {
  if (!editHash || !summaryEl) { return }
  void (async () => {
    const snippet = await fetchEditSnippet(editHash)
    if (!snippet) { return }
    const link = summaryEl.querySelector('.edit-summary-link')
    if (link) { link.textContent = snippet }
  })()
}

export const buildEditSummaryLine = ({ name, editHash, author, nameId, snippet }) => {
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

export const buildEditSummaryRow = ({ avatarLink, summary }) => {
  const stack = h('div', {classList: 'message-stack'}, [summary])
  return h('div', {classList: 'message-main'}, [
    avatarLink || '',
    stack
  ])
}

export const buildEditMessageShell = ({ id, right, summaryRow, rawDiv, qrTarget }) => {
  return h('div', {id, classList: 'message edit-message'}, [
    right,
    summaryRow,
    rawDiv,
    qrTarget
  ])
}

export const extractMetaNodes = (msgDiv) => {
  const right = msgDiv.querySelector('.message-meta')
  const rawDiv = msgDiv.querySelector('.message-raw') || h('div', {classList: 'message-raw'})
  const qrTarget = msgDiv.querySelector('.qr-target')
  return { right, rawDiv, qrTarget }
}

export const fetchEditsForMessage = async (hash, author) => {
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

export const invalidateEdits = (hash) => {
  editsCache.delete(hash)
}

export const registerMessage = (hash, data) => {
  const state = getEditState(hash)
  Object.assign(state, data)
}

export const buildEditNav = (hash, stepEdit) => {
  const left = h('a', {
    classList: 'material-symbols-outlined edit-nav-btn',
    onclick: async (e) => {
      e.preventDefault()
      await stepEdit(hash, -1)
    }
  }, ['Chevron_Left'])

  const index = h('span', {classList: 'edit-nav-index'}, [''])

  const right = h('a', {
    classList: 'material-symbols-outlined edit-nav-btn',
    onclick: async (e) => {
      e.preventDefault()
      await stepEdit(hash, 1)
    }
  }, ['Chevron_Right'])

  const wrap = h('span', {classList: 'edit-nav', style: 'display: none;'}, [
    left,
    index,
    right
  ])

  return { wrap, left, right, index }
}

// refreshEdits and stepEdit need renderBody, highlightCodeIn, hydrateReplyPreviews, applyProfile
// from render.js. We accept them as a callbacks object to avoid circular deps.
export const createEditActions = ({ renderBody, highlightCodeIn, hydrateReplyPreviews, applyProfile }) => {
  const refreshEdits = async (hash, options = {}) => {
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

  const stepEdit = async (hash, delta) => {
    const state = getEditState(hash)
    if (!state.baseYaml) { return }
    const edits = (await fetchEditsForMessage(hash, state.author))
      .filter(edit => !state.author || edit.author === state.author)
    const total = edits.length + 1
    if (total <= 1) { return }
    const nextIndex = Math.max(0, Math.min((state.currentIndex ?? total - 1) + delta, total - 1))
    state.currentIndex = nextIndex
    state.userNavigated = true
    await refreshEdits(hash)
  }

  return { refreshEdits, stepEdit }
}

export const queueEditRefresh = (editHash, ensureOriginalMessage, invalidate, refresh) => {
  if (!editHash) { return }
  void (async () => {
    await ensureOriginalMessage(editHash)
    invalidate(editHash)
    await refresh(editHash, { forceLatest: true })
  })()
}
