import { render } from './render.js'
import { apds } from 'apds'

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

const isAscending = (log) => {
  if (!log || log.length < 2) { return false }
  let left = 0
  let right = 0
  for (const post of log) {
    left = getTimestamp(post)
    if (left) { break }
  }
  for (let i = log.length - 1; i >= 0; i--) {
    right = getTimestamp(log[i])
    if (right) { break }
  }
  return left && right ? left < right : false
}

export const adder = (log, src, div) => {
  if (log && log[0]) {
    let index = 0
    const ascending = isAscending(log)
    let loading = false
    let armed = false
    const sentinelId = 'scroll-sentinel'

    let posts = []
    const takeSlice = () => {
      if (ascending) {
        const end = log.length - index
        const start = Math.max(0, end - 25)
        posts = log.slice(start, end).reverse()
      } else {
        posts = log.slice(index, index + 25)
      }
      index = index + 25
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
      const hasMore = await loadNext()
      if (hasMore === false) {
        observer.disconnect()
      }
    }, { root: null, rootMargin: '0px 0px', threshold: 0 })

    observer.observe(sentinel)
  }
}
