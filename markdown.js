import { apds } from 'apds'
import { send } from './send.js'
import { subscribeHashRequest } from './network_queue.js'
import { appendFormattedText } from './client/ui/body.js'

const resolveImage = async (hash, { signal, retry } = {}) => {
  const image = await apds.get(hash)
  if (signal?.aborted) return null
  if (!image) await send(hash, { priority: 'high', retry })
  return image
}

resolveImage.subscribe = subscribeHashRequest

export const appendMarkdown = (target, text) => {
  appendFormattedText(target, text, { resolveImage })
}
