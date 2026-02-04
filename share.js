const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') { return false }
  return Object.getPrototypeOf(value) === Object.prototype
}

export const parseSharePayload = (hash) => {
  if (!hash || typeof hash !== 'string') { return null }
  if (!hash.startsWith('share=')) { return null }
  try {
    const raw = decodeURIComponent(hash.slice(6))
    const data = JSON.parse(raw)
    if (!isPlainObject(data)) { return null }
    return data
  } catch (err) {
    return null
  }
}

const normalizeText = (value) => {
  if (typeof value !== 'string') { return '' }
  return value.trim()
}

export const buildShareMessage = (payload) => {
  if (!payload || typeof payload !== 'object') { return '' }
  const text = normalizeText(payload.text)
  const url = normalizeText(payload.url)
  const title = normalizeText(payload.title)
  const linkLabel = title || url
  const link = url ? `[${linkLabel}](${url})` : ''
  if (!link) { return text }
  if (!text) { return link }
  if (text.includes(url)) { return text }
  return `${text}\n\n${link}`
}
