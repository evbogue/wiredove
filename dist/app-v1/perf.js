const SAMPLES_PER_METRIC = 60
const LOG_EVERY_N = 20
const metrics = new Map()

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const isEnabled = () => {
  if (typeof window === 'undefined') { return false }
  if (window.__perfMetrics === true) { return true }
  try {
    return localStorage.getItem('wiredove.perf') === '1'
  } catch {
    return false
  }
}

const percentile = (values, p) => {
  if (!values.length) { return 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[idx]
}

const pushMetric = (name, duration) => {
  const record = metrics.get(name) || { values: [], count: 0 }
  record.values.push(duration)
  if (record.values.length > SAMPLES_PER_METRIC) {
    record.values.shift()
  }
  record.count += 1
  metrics.set(name, record)
  if (record.count % LOG_EVERY_N !== 0) { return }
  const p50 = percentile(record.values, 0.5)
  const p95 = percentile(record.values, 0.95)
  const avg = record.values.reduce((sum, value) => sum + value, 0) / record.values.length
  console.log(`[perf] ${name} n=${record.values.length} avg=${avg.toFixed(1)}ms p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`)
}

export const perfStart = (name, detail = '') => {
  if (!isEnabled()) { return null }
  return { name, detail, t0: nowMs() }
}

export const perfEnd = (token) => {
  if (!token || !token.name) { return 0 }
  const duration = nowMs() - token.t0
  const metricName = token.detail ? `${token.name}:${token.detail}` : token.name
  pushMetric(metricName, duration)
  return duration
}

export const perfMeasure = async (name, fn, detail = '') => {
  const token = perfStart(name, detail)
  try {
    return await fn()
  } finally {
    perfEnd(token)
  }
}
