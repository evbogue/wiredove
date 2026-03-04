import { apds } from 'apds'

export const isHash = (value) => typeof value === 'string' && value.length === 44

export const getOpenedFromQuery = async (hash) => {
  if (!hash) { return null }
  const query = await apds.query(hash)
  if (Array.isArray(query) && query[0] && query[0].opened) {
    return query[0].opened
  }
  if (query && query.opened) {
    return query.opened
  }
  return null
}

export const normalizeTimestamp = (ts) => {
  const value = Number.parseInt(ts, 10)
  return Number.isNaN(value) ? 0 : value
}
