import { normalizeProfileLinks } from '../../client/profile-links.js'

export function mergeAuthorProfile(profiles, { author, id, timestamp, parsed }) {
  if (!parsed || parsed.edit || parsed.reply || parsed.replyHash || parsed.replyto || parsed.replyTo
      || String(parsed.type || '').startsWith('git-')) return
  let profile = profiles.get(author)
  for (const field of ['name', 'image', 'bio', 'links']) {
    const value = parsed[field]
    if (field === 'links' ? !Array.isArray(value) : typeof value !== 'string') continue
    if (field === 'name' && !value.trim()) continue
    const current = profile?.[field]
    if (current && (current.timestamp > timestamp || (current.timestamp === timestamp && current.id <= id))) continue
    profile = {
      ...profile,
      [field]: { id, timestamp, value: field === 'links' ? normalizeProfileLinks(value) : value.trim() },
    }
  }
  if (profile) profiles.set(author, profile)
}
