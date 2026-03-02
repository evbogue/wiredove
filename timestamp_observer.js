import { apds } from 'apds'

const timestampRefreshMs = 60000
const visibleTimestamps = new Map()
let timestampObserver = null

const refreshTimestamp = async (element, timestamp) => {
  if (!document.body.contains(element)) {
    const stored = visibleTimestamps.get(element)
    if (stored) { clearInterval(stored.intervalId) }
    visibleTimestamps.delete(element)
    return
  }
  element.textContent = await apds.human(timestamp)
}

export const observeTimestamp = (element, timestamp) => {
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
