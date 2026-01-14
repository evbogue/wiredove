import { apds } from 'apds'
import { h } from 'h'
import { send } from './send.js'
import { composer } from './composer.js'
import { markdown } from './markdown.js'
import { noteSeen } from './sync.js'

export const render = {}
const cache = new Map()
const editsCache = new Map()
const EDIT_CACHE_TTL_MS = 5000
const pendingReplies = new Map()

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

const renderBody = async (body, replyHash) => {
  let html = body ? await markdown(body) : ''
  if (replyHash) {
    html = "<span class='material-symbols-outlined'>Subdirectory_Arrow_left</span><a href='#" +
      replyHash + "'> " + replyHash.substring(0, 10) + "...</a>" + html
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

const summarizeBody = (body, maxLen = 50) => {
  if (!body) { return '' }
  const single = body.replace(/\s+/g, ' ').trim()
  if (single.length <= maxLen) { return single }
  return single.substring(0, maxLen) + '...'
}

const fetchEditSnippet = async (editHash) => {
  if (!editHash) { return '' }
  const signed = await apds.get(editHash)
  if (!signed) { return '' }
  const opened = await apds.open(signed)
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
      const opened = await apds.open(signed)
      const ts = parseOpenedTimestamp(opened)
      insertByTimestamp(scroller, targetHash, ts)
    }
  }
  const have = await apds.get(targetHash)
  if (!have) {
    await send(targetHash)
  }
}

const parseOpenedTimestamp = (opened) => {
  if (!opened || opened.length < 13) { return 0 }
  const ts = Number.parseInt(opened.substring(0, 13), 10)
  return Number.isNaN(ts) ? 0 : ts
}

const normalizeTimestamp = (ts) => {
  const value = Number.parseInt(ts, 10)
  return Number.isNaN(value) ? 0 : value
}

const insertByTimestamp = (container, hash, ts) => {
  if (!container || !hash) { return null }
  const stamp = normalizeTimestamp(ts)
  if (!stamp) { return null }
  const safeHash = window.CSS && CSS.escape ? CSS.escape(hash) : hash
  const matches = document.querySelectorAll('#' + safeHash)
  if (matches.length > 1) {
    matches.forEach((node, idx) => {
      if (idx > 0) { node.remove() }
    })
  }
  let div = document.getElementById(hash)
  if (!div) {
    div = render.hash(hash)
  }
  if (!div) { return null }
  div.dataset.ts = stamp.toString()
  if (div.parentNode === container) {
    container.removeChild(div)
  }
  const children = Array.from(container.children)
  for (const child of children) {
    const childTs = normalizeTimestamp(child.dataset.ts)
    if (childTs < stamp) {
      container.insertBefore(div, child)
      return div
    }
  }
  container.appendChild(div)
  return div
}

const getReplyParent = (yaml) => {
  if (!yaml) { return null }
  return yaml.replyHash || yaml.reply || null
}

const appendReply = async (parentHash, replyHash, ts, replyBlob = null) => {
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
  const replyParent = replyWrapper.parentNode
  const alreadyNested = replyParent && replyParent.classList && replyParent.classList.contains('reply')
  if (!alreadyNested || replyParent.parentNode !== repliesContainer) {
    const replyContain = h('div', {classList: 'reply'})
    if (ts) { replyContain.dataset.ts = ts.toString() }
    replyContain.appendChild(replyWrapper)
    repliesContainer.appendChild(replyContain)
  }
  await render.blob(blob)
  return true
}

const enqueuePendingReply = (parentHash, replyHash, ts) => {
  if (!parentHash || !replyHash) { return }
  const list = pendingReplies.get(parentHash) || []
  if (list.some(item => item.hash === replyHash)) { return }
  list.push({ hash: replyHash, ts })
  pendingReplies.set(parentHash, list)
}

const flushPendingReplies = async (parentHash) => {
  const list = pendingReplies.get(parentHash)
  if (!list || !list.length) { return }
  pendingReplies.delete(parentHash)
  for (const item of list) {
    await appendReply(parentHash, item.hash, item.ts)
  }
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
  if (!currentEdit) {
    await applyProfile(state.contentHash, state.baseYaml)
  }
}

render.qr = (hash, blob, target) => {
  const link = h('a', {
    onclick: () => {
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
        new QRious({
          element: canvas,
          value: location.href + blob,
          size,
          background,
          foreground,
        })
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

render.meta = async (blob, opened, hash, div) => {
  const timestamp = opened.substring(0, 13)
  const contentHash = opened.substring(13)
  const author = blob.substring(0, 44)
  const wrapper = document.getElementById(hash)
  if (wrapper) {
    wrapper.dataset.ts = timestamp
  }

  const [humanTime, contentBlob, img] = await Promise.all([
    apds.human(timestamp),
    apds.get(contentHash),
    apds.visual(author)
  ])

  if (contentBlob) {
    const yaml = await apds.parseYaml(contentBlob)
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
      if (div.dataset.ts) {
        meta.dataset.ts = div.dataset.ts
      }

      div.replaceWith(meta)
      await applyProfile(contentHash, yaml)
      return
    }
  }

  const ts = h('a', {href: '#' + hash}, [humanTime])
  observeTimestamp(ts, timestamp)

  const pubkey = await apds.pubkey()
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
  const editControls = h('span', {classList: 'message-actions-edit'}, [
    editButton || '',
    editButton ? ' ' : '',
    editedHint,
    ' ',
    editNav.wrap
  ])
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
    contentBlob ? render.content(contentHash, contentBlob, content, hash) : send(contentHash)
  ])
} 

render.comments = async (hash, blob, div, actionsRow) => {
  const num = h('span')

  const log = await apds.getOpenedLog()

  let nume = 0
  log.forEach(async msg => {
    const yaml = await apds.parseYaml(msg.text)
    if (yaml.replyHash) { yaml.reply = yaml.replyHash}
    if (yaml.reply === hash) {
      const ts = msg.ts || parseOpenedTimestamp(msg.opened)
      if (!ts) { return }
      ++nume
      num.textContent = nume
      await appendReply(hash, msg.hash, ts)
    }
  })

  const reply = h('a', {
    classList: 'material-symbols-outlined',
    onclick: async () => {
      if (document.getElementById('reply-composer-' + hash)) { return }
      if (await apds.pubkey()) {
        div.after(await composer(blob))
      }
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

render.content = async (hash, blob, div, messageHash) => {
  const contentHashPromise = hash ? Promise.resolve(hash) : apds.hash(blob)
  const [contentHash, yaml] = await Promise.all([
    contentHashPromise,
    apds.parseYaml(blob)
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
      return
    }
    div.className = 'content'
    while (div.firstChild) { div.firstChild.remove() }
    const summaryRow = buildEditSummaryRow({
      summary: buildEditSummaryLine({ name: yaml.name, editHash: yaml.edit })
    })
    updateEditSnippet(yaml.edit, summaryRow)
    div.appendChild(summaryRow)
    return
  }

  if (yaml && yaml.body) {
    div.className = 'content'
    if (yaml.replyHash) { yaml.reply = yaml.replyHash }
    div.innerHTML = await renderBody(yaml.body, yaml.reply)
    await applyProfile(contentHash, yaml)

    if (yaml.previous) {
      const check = await apds.query(yaml.previous)
      if (!check[0]) {
        await send(yaml.previous)
      }
    }

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

render.blob = async (blob) => {
  const [hash, opened] = await Promise.all([
    apds.hash(blob),
    apds.open(blob)
  ])
  
  const wrapper = document.getElementById(hash)
  const div = wrapper && wrapper.classList.contains('message-wrapper')
    ? wrapper.querySelector('.message-shell')
    : wrapper
  if (opened) {
    const content = await apds.get(opened.substring(13))
    if (content) {
      const yaml = await apds.parseYaml(content)
      if (yaml && yaml.edit) {
        queueEditRefresh(yaml.edit)
      }
    }
  }

  const getimg = document.getElementById('inlineimage' + hash)
  if (opened && div && !div.childNodes[1]) {
    await render.meta(blob, opened, hash, div)
    //await render.comments(hash, blob, div)
  } else if (div && !div.childNodes[1]) {
    if (div.className.includes('content')) {
      await render.content(hash, blob, div, null)
    } else {
      const content = h('div', {classList: 'content'})
      const message = h('div', {classList: 'message'}, [content])
      div.replaceWith(message)
      await render.content(hash, blob, content, null)
    }
  } else if (getimg) {
    getimg.src = blob
  } 
  await flushPendingReplies(hash)
}

render.shouldWe = async (blob) => {
  const [opened, hash] = await Promise.all([
    apds.open(blob),
    apds.hash(blob)
  ])
  if (!opened) { return }
  const already = await apds.get(hash)
  if (!already) {
    await apds.make(blob)
  }
  const inDom = document.getElementById(hash)
  if (opened && !inDom) {
    noteSeen(blob.substring(0, 44))
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
    const authorKey = blob.substring(0, 44)
    const replyTo = getReplyParent(yaml)
    if (replyTo) {
      const appended = await appendReply(replyTo, hash, ts, blob)
      if (!appended) {
        enqueuePendingReply(replyTo, hash, ts)
      }
      return
    }
    if (scroller && (authorKey === src || hash === src || al.includes(authorKey))) {
      const div = insertByTimestamp(scroller, hash, ts)
      if (div) {
        await render.blob(blob)
      }
    }
    if (scroller && src === '') {
      const div = insertByTimestamp(scroller, hash, ts)
      if (div) {
        await render.blob(blob)
      }
    }
  }
}

render.hash = (hash) => {
  if (!hash) { return null }
  if (!document.getElementById(hash)) {
    const messageShell = h('div', {classList: 'message-shell premessage'})
    const replies = h('div', {classList: 'message-replies'})
    const wrapper = h('div', {id: hash, classList: 'message-wrapper'}, [
      messageShell,
      replies
    ])
    return wrapper
  }
  return null
}

render.insertByTimestamp = (container, hash, ts) => insertByTimestamp(container, hash, ts)
