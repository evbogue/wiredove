import { isMessageHash } from './client/protocol.js'

// Broadcast a canonical message ID, never raw YAML or a signature envelope.
export const ntfy = async (hash, { fetchImpl = fetch } = {}) => {
  if (!isMessageHash(hash)) throw new Error('A message hash is required for notification')
  const response = await fetchImpl('https://ntfy.sh/wiredove', {
    method: 'POST',
    body: 'https://wiredove.net/#' + hash,
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error(`Notification broadcast failed (${response.status})`)
}
