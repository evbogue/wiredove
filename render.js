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
    const placeholder = render.hash(targetHash)
    if (placeholder) {
      scroller.appendChild(placeholder)
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
        new QRious({
          element: canvas,
          value: location.href + blob,
          size: 400,
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

      const qrTarget = h('div', {id: 'qr-target' + hash, classList: 'qr-target', style: 'margin: 8px auto 0 auto; text-align: center; max-width: 400px;'})
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

  const qrTarget = h('div', {id: 'qr-target' + hash, classList: 'qr-target', style: 'margin: 8px auto 0 auto; text-align: center; max-width: 400px;'})
  const editedHint = h('span', {classList: 'edit-hint', style: 'display: none;'}, [''])
  const editNav = buildEditNav(hash)
  const right = buildRightMeta({ author, hash, blob, qrTarget, raw, ts })

  img.className = 'avatar'
  img.id = 'image' + contentHash
  img.style = 'float: left;'

  const name = h('span', {id: 'name' + contentHash, classList: 'avatarlink'}, [author.substring(0, 10)])

  const content = h('div', {id: contentHash, classList: 'material-symbols-outlined content'}, ['Notes'])

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

  const meta = h('div', {id: div.id, classList: 'message'}, [
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
  const src = document.location.hash.substring(1)

  let nume = 0
  log.forEach(async msg => {
    const yaml = await apds.parseYaml(msg.text)
    if (yaml.replyHash) { yaml.reply = yaml.replyHash}
    if (yaml.reply === hash) {
      ++nume
      num.textContent = nume
      //if (src === yaml.reply) {
        const replyContain = h('div', {classList: 'reply'}, [
          render.hash(msg.hash)
        ])
        div.after(replyContain)
        await render.blob(await apds.get(msg.hash))
      //}
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
  
  const div = document.getElementById(hash)
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
      const wrapper = h('div', {id: div.id, classList: 'message'}, [content])
      div.replaceWith(wrapper)
      await render.content(hash, blob, content, null)
    }
  } else if (getimg) {
    getimg.src = blob
  } 
}

render.shouldWe = async (blob) => {
  const [opened, hash] = await Promise.all([
    apds.open(blob),
    apds.hash(blob)
  ])
  const already = await apds.get(hash)
  if (!already) {
    await apds.make(blob)
  }
  if (opened && !already) {
    noteSeen(blob.substring(0, 44))
    const src = window.location.hash.substring(1)
    const al = []
    const aliases = localStorage.getItem(src)
    if (aliases) {
      const parse = JSON.parse(aliases)
      al.push(...parse)
      console.log(al)
    }
    const msg = await apds.get(opened.substring(13))
    if (!msg) { return }
    const yaml = await apds.parseYaml(msg)
    if (yaml && yaml.edit) {
      queueEditRefresh(yaml.edit)
    }
    // this should detect whether the syncing message is newer or older and place the msg in the right spot
    if (blob.substring(0, 44) === src || hash === src || yaml.author === src || al.includes(blob.substring(0, 44))) {
      const scroller = document.getElementById('scroller')
      const div = render.hash(hash)
      if (div) {
        scroller.appendChild(div)
        //scroller.insertBefore(div, scroller.firstChild)
        await render.blob(blob)
      }
    }
    if (src === '') {
      const scroller = document.getElementById('scroller')
      const div = render.hash(hash)
      if (div) {
        //scroller.appendChild(div)
        scroller.insertBefore(div, scroller.firstChild)
        await render.blob(blob)
      }
    } 
  }
}

render.hash = (hash) => {
  if (!document.getElementById(hash)) {
    const div = h('div', {id: hash, className: 'premessage'}) 
    return div
  }
}
