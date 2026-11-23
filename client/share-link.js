import { isMessageHash } from './protocol.js'

export const publicPathID = id => id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function reservePublicShare(id, { signal } = {}) {
  if (!isMessageHash(id)) return null
  const response = await fetch('/api/share?id=' + publicPathID(id), { method: 'POST', signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Public share unavailable')
  const { url } = await response.json()
  const link = new URL(url)
  if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password
      || !/^\/[A-Za-z0-9_-]{8,43}$/.test(link.pathname) || link.search || link.hash) {
    throw new Error('Invalid public share URL')
  }
  return link.href
}
