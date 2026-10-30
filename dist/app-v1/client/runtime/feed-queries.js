// Queries read APDS's verified local index. Archive refresh is explicit: these
// results describe this cache/backend, never a complete search of public relays.
export const createFeedQueries = ({ protocol, refresh = async () => {}, subscribe = () => () => {} }) => {
  const listeners = new Set()
  let disposed = false
  let refreshing
  const changed = () => { if (!disposed) for (const listener of listeners) listener() }
  const unsubscribe = subscribe(changed)
  return {
    scope: 'local-cache-and-backend-archive',
    changed,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async query(route = '', { signal } = {}) {
      signal?.throwIfAborted()
      if (disposed) throw Error('Feed queries disposed')
      // Copy before sorting: APDS owns the original index array.
      const rows = await protocol.query(route || undefined)
      signal?.throwIfAborted()
      if (disposed) throw Error('Feed queries disposed')
      const unique = new Map()
      for (const row of rows || []) if (row?.hash) unique.set(row.hash, row)
      return [...unique.values()].sort((a, b) => Number(b.ts || b.opened?.slice(0, 13) || 0) - Number(a.ts || a.opened?.slice(0, 13) || 0) || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
    },
    refresh() {
      if (disposed) return Promise.reject(Error('Feed queries disposed'))
      if (!refreshing) refreshing = Promise.resolve().then(refresh).then(() => { changed() }).finally(() => { refreshing = null })
      return refreshing
    },
    destroy() { disposed = true; unsubscribe(); listeners.clear() },
  }
}
