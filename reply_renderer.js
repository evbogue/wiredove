import { apds } from 'apds'
import { h } from 'h'
import { queueSend } from './network_queue.js'
import { composer } from './composer.js'
import { promptKeypair } from './identify.js'
import {
  ensureReplyIndex, getReplyCount, getRepliesForParent,
  getReplyDepth, getMaxReplyDepth
} from './reply_index.js'
import { getOpenedFromQuery } from './utils.js'

const replyCountTargets = new Map()
let replyObserver = null
const replyPreviewCache = new Map()

// Late-bound reference to the render object, set via initReplyRenderer()
let render = null

export const initReplyRenderer = (renderObj) => {
  render = renderObj
}

const shouldExpandRepliesForWrapper = (wrapper) => (
  !!(wrapper && wrapper.dataset && wrapper.dataset.replyDisplay === 'thread')
)

const summarizeBody = (body, maxLen = 50) => {
  if (!body) { return '' }
  const single = body.replace(/\s+/g, ' ').trim()
  if (single.length <= maxLen) { return single }
  return single.substring(0, maxLen) + '...'
}

export const updateReplyCount = (parentHash) => {
  const target = replyCountTargets.get(parentHash)
  if (!target) { return }
  const count = getReplyCount(parentHash)
  target.textContent = count ? count.toString() : ''
}

export const observeReplies = (wrapper, parentHash) => {
  if (!wrapper) { return }
  if (!shouldExpandRepliesForWrapper(wrapper)) { return }
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

export const buildReplyIndex = async (log = null) => {
  replyCountTargets.clear()
  await ensureReplyIndex(log)
}

export const refreshVisibleReplies = () => {
  replyCountTargets.forEach((_, parentHash) => {
    updateReplyCount(parentHash)
  })
  const wrappers = Array.from(document.querySelectorAll('.message-wrapper'))
  wrappers.forEach((wrapper) => {
    const parentHash = wrapper.id
    if (!parentHash) { return }
    if (!shouldExpandRepliesForWrapper(wrapper)) { return }
    if (wrapper.dataset.repliesLoaded === 'true') { return }
    if (!getReplyCount(parentHash)) { return }
    observeReplies(wrapper, parentHash)
  })
}

export const getReplyParent = (yaml) => {
  if (!yaml) { return null }
  return yaml.replyHash || yaml.reply || null
}

export const appendReply = async (parentHash, replyHash, ts, replyBlob = null, replyOpened = null) => {
  const wrapper = document.getElementById(parentHash)
  if (!shouldExpandRepliesForWrapper(wrapper)) { return false }
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
  const replyDepth = getReplyDepth(replyHash)
  replyWrapper.dataset.replyDepth = String(replyDepth)
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
    replyContain.dataset.replyDepth = String(replyDepth)
    replyContain.classList.add('reply-depth-' + Math.min(replyDepth, getMaxReplyDepth()))
    if (replyDepth >= getMaxReplyDepth()) {
      replyContain.classList.add('reply-depth-capped')
    }
    replyContain.appendChild(replyWrapper)
    repliesContainer.appendChild(replyContain)
  }
  await render.blob(blob, { hash: replyHash, opened: replyOpened })
  return true
}

export const flushPendingReplies = async (parentHash) => {
  const wrapper = document.getElementById(parentHash)
  if (!wrapper) { return }
  if (!shouldExpandRepliesForWrapper(wrapper)) { return }
  const list = getRepliesForParent(parentHash)
  if (!list.length) { return }
  observeReplies(wrapper, parentHash)
}

export const fetchReplyPreview = async (replyHash) => {
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

export const hydrateReplyPreviews = (container) => {
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

export const comments = async (hash, blob, div, actionsRow) => {
  const num = h('span')
  replyCountTargets.set(hash, num)
  updateReplyCount(hash)
  const list = getRepliesForParent(hash)
  const wrapper = document.getElementById(hash)
  if (list.length && shouldExpandRepliesForWrapper(wrapper)) {
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
