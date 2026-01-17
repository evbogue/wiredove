import { render } from './render.js'
import { apds } from 'apds'

const getController = () => {
  if (!window.__feedController) {
    window.__feedController = {
      feeds: new Map(),
      getFeed(src) {
        const state = this.feeds.get(src)
        if (state && state.container && !document.body.contains(state.container)) {
          this.feeds.delete(src)
          return null
        }
        return state || null
      }
    }
  }
  return window.__feedController
}

const normalizeTimestamp = (ts) => {
  const value = Number.parseInt(ts, 10)
  return Number.isNaN(value) ? 0 : value
}

const addPosts = async (posts, div) => {
  for (const post of posts) {
    const ts = post.ts || (post.opened ? Number.parseInt(post.opened.substring(0, 13), 10) : 0)
    let placeholder = render.hash(post.hash)
    if (!placeholder) {
      placeholder = document.getElementById(post.hash)
    }
    if (!placeholder) { continue }
    if (ts) { placeholder.dataset.ts = ts.toString() }
    if (placeholder.parentNode !== div) {
      div.appendChild(placeholder)
    }
    setTimeout(async () => {
      const sig = await apds.get(post.hash)
      await render.blob(sig)
    }, 1)
  }
}

const getTimestamp = (post) => {
  if (!post) { return 0 }
  if (post.ts) { return Number.parseInt(post.ts, 10) }
  if (post.opened) { return Number.parseInt(post.opened.substring(0, 13), 10) }
  return 0
}

const sortDesc = (a, b) => b.ts - a.ts

const buildEntries = (log) => {
  if (!log) { return [] }
  const entries = []
  const seen = new Set()
  for (const post of log) {
    if (!post || !post.hash) { continue }
    if (seen.has(post.hash)) { continue }
    seen.add(post.hash)
    const ts = getTimestamp(post)
    entries.push({ hash: post.hash, ts })
  }
  entries.sort(sortDesc)
  return entries
}

const insertEntry = (state, entry) => {
  if (!entry || !entry.hash || !entry.ts) { return -1 }
  if (state.seen.has(entry.hash)) { return -1 }
  const list = state.entries
  const prevLen = list.length
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (list[mid].ts >= entry.ts) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  list.splice(lo, 0, entry)
  state.seen.add(entry.hash)
  if (lo <= state.cursor) {
    if (state.cursor === prevLen && lo === prevLen) { return lo }
    state.cursor += 1
  }
  return lo
}

const isAtTop = () => {
  const scrollEl = document.scrollingElement || document.documentElement || document.body
  const scrollTop = scrollEl.scrollTop || window.scrollY || 0
  return scrollTop <= 10
}

const ensureBanner = (state) => {
  if (state.banner && state.banner.parentNode === state.container) { return state.banner }
  const banner = document.createElement('div')
  banner.className = 'new-posts-banner'
  banner.style.display = 'none'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'new-posts-button'
  button.addEventListener('click', async () => {
    await flushPending(state)
  })
  banner.appendChild(button)
  state.container.insertBefore(banner, state.container.firstChild)
  state.banner = banner
  state.bannerButton = button
  return banner
}

const updateBanner = (state) => {
  if (!state.banner || !state.bannerButton) { return }
  const count = state.pending.length
  if (!count) {
    state.banner.style.display = 'none'
    return
  }
  state.bannerButton.textContent = `Show ${count} new post${count === 1 ? '' : 's'}`
  state.banner.style.display = 'block'
}

const renderEntry = async (state, entry) => {
  const div = render.insertByTimestamp(state.container, entry.hash, entry.ts)
  if (!div) { return }
  if (entry.blob) {
    await render.blob(entry.blob)
  } else {
    const sig = await apds.get(entry.hash)
    if (sig) { await render.blob(sig) }
  }
  state.rendered.add(entry.hash)
}

const flushPending = async (state) => {
  if (!state.pending.length) { return }
  const pending = state.pending.slice().sort(sortDesc)
  state.pending = []
  updateBanner(state)
  for (const entry of pending) {
    await renderEntry(state, entry)
    state.latestVisibleTs = Math.max(state.latestVisibleTs || 0, entry.ts)
    if (!state.oldestVisibleTs) { state.oldestVisibleTs = entry.ts }
  }
}

const enqueuePost = async (state, entry) => {
  if (!entry || !entry.hash || !entry.ts) { return }
  insertEntry(state, entry)
  if (!state.latestVisibleTs) {
    await renderEntry(state, entry)
    state.latestVisibleTs = entry.ts
    state.oldestVisibleTs = entry.ts
    return
  }
  if (entry.ts < state.oldestVisibleTs && state.rendered.size < state.pageSize) {
    await renderEntry(state, entry)
    state.oldestVisibleTs = entry.ts
    return
  }
  const inWindow = state.oldestVisibleTs && entry.ts >= state.oldestVisibleTs && entry.ts <= state.latestVisibleTs
  if (entry.ts > state.latestVisibleTs) {
    if (isAtTop()) {
      await renderEntry(state, entry)
      state.latestVisibleTs = entry.ts
      if (!state.oldestVisibleTs) { state.oldestVisibleTs = entry.ts }
    } else {
      state.pending.push(entry)
      updateBanner(state)
    }
    return
  }
  if (inWindow) {
    await renderEntry(state, entry)
    state.latestVisibleTs = Math.max(state.latestVisibleTs, entry.ts)
    state.oldestVisibleTs = Math.min(state.oldestVisibleTs || entry.ts, entry.ts)
  }
}

window.__feedEnqueue = async (src, entry) => {
  const controller = getController()
  const state = controller.getFeed(src)
  if (!state) { return false }
  await enqueuePost(state, entry)
  return true
}

export const adder = (log, src, div) => {
  if (!div) { return }
  const pageSize = 25
  const entries = buildEntries(log || [])
  let loading = false
  let armed = false
  const sentinelId = 'scroll-sentinel'

  let posts = []
  const state = {
    src,
    container: div,
    entries,
    cursor: 0,
    seen: new Set(entries.map(entry => entry.hash)),
    rendered: new Set(),
    pending: [],
    pageSize,
    latestVisibleTs: 0,
    oldestVisibleTs: 0,
    banner: null,
    bannerButton: null
  }
  getController().feeds.set(src, state)
  ensureBanner(state)

  const takeSlice = () => {
    posts = []
    if (state.cursor >= entries.length) { return posts }
    let idx = state.cursor
    while (idx < entries.length && posts.length < pageSize) {
      const entry = entries[idx]
      if (!state.rendered.has(entry.hash)) {
        posts.push(entry)
      }
      idx += 1
    }
    state.cursor = idx
    return posts
  }

  const ensureSentinel = () => {
    let sentinel = document.getElementById(sentinelId)
    if (!sentinel) {
      sentinel = document.createElement('div')
      sentinel.id = sentinelId
      sentinel.style.height = '1px'
    }
    if (sentinel.parentNode && sentinel.parentNode !== div) {
      sentinel.parentNode.removeChild(sentinel)
    }
    div.appendChild(sentinel)
    return sentinel
  }

  const loadNext = async () => {
    if (loading) { return }
    if (window.location.hash.substring(1) !== src) { return }
    loading = true
    try {
      const next = takeSlice()
      if (!next.length) { return false }
      await addPosts(next, div)
      for (const entry of next) {
        state.rendered.add(entry.hash)
      }
      if (!state.latestVisibleTs && next[0]) {
        state.latestVisibleTs = normalizeTimestamp(next[0].ts)
      }
      if (next[next.length - 1]) {
        state.oldestVisibleTs = normalizeTimestamp(next[next.length - 1].ts)
      }
      ensureSentinel()
      return true
    } finally {
      loading = false
    }
  }

  void loadNext()
  const armScroll = () => {
    armed = true
  }
  window.addEventListener('scroll', armScroll, { passive: true, once: true })
  const sentinel = ensureSentinel()
  const observer = new IntersectionObserver(async (entries) => {
    const entry = entries[0]
    if (!entry || !entry.isIntersecting) { return }
    if (!armed) { return }
    await loadNext()
  }, { root: null, rootMargin: '0px 0px', threshold: 0 })

  observer.observe(sentinel)
}
