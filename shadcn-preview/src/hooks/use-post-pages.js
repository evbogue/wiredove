import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const pageSize = 25

function subscribeScroll(listener) {
  window.addEventListener('scroll', listener, { passive: true })
  return () => window.removeEventListener('scroll', listener)
}

const isAtTop = () => window.scrollY <= 10

export function usePostPages(posts, { view, active, localIds }) {
  const [limits, setLimits] = useState(() => new Map())
  const [acceptedThrough, setAcceptedThrough] = useState(null)
  const sentinel = useRef(null)
  const limit = limits.get(view) ?? pageSize
  const newest = posts.reduce((time, post) => Math.max(time, post.timestamp), 0)
  const atTop = useSyncExternalStore(subscribeScroll, isAtTop)
  if (active && view === 'feed' && newest
      && (acceptedThrough === null || (newest > acceptedThrough && atTop))) {
    setAcceptedThrough(newest)
  }
  const pending = view === 'feed' && acceptedThrough !== null
    ? posts.filter(post => post.timestamp > acceptedThrough && !localIds.has(post.id))
    : []
  const pendingIds = new Set(pending.map(post => post.id))
  const available = pendingIds.size ? posts.filter(post => !pendingIds.has(post.id)) : posts
  const hasMore = available.length > limit

  const loadMore = useCallback(() => {
    setLimits(previous => {
      if ((previous.get(view) ?? pageSize) !== limit) return previous
      return new Map(previous).set(view, limit + pageSize)
    })
  }, [limit, view])

  useEffect(() => {
    if (!active || !hasMore || !sentinel.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      loadMore()
    }, { rootMargin: '0px 0px 1200px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [active, hasMore, loadMore])

  function showNewPosts() {
    setLimits(previous => new Map(previous).set(view, (previous.get(view) ?? pageSize) + pending.length))
    setAcceptedThrough(newest)
    window.scrollTo({ top: 0 })
  }

  return { posts: available.slice(0, limit), pendingCount: pending.length, hasMore, sentinel, loadMore, showNewPosts }
}
