import { normalizeTimestamp } from './utils.js'

const timestampInsertState = new WeakMap()

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

export const insertByTimestamp = (container, hash, ts, hashFn) => {
  if (!container || !hash) { return null }
  const stamp = normalizeTimestamp(ts)
  if (!stamp) { return null }
  const state = getTimestampState(container)
  const entries = state.entries
  let div = document.getElementById(hash)
  if (!div) {
    div = hashFn(hash)
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
    const sentinel = container.querySelector('.scroll-sentinel')
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
