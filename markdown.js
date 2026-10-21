import { apds } from 'apds'
import { send } from './send.js'
import { appendFormattedText } from './client/ui/body.js'

const resolveImage = async (hash, { signal } = {}) => {
  const image = await apds.get(hash)
  if (signal?.aborted) return null
  if (!image) await send(hash)
  return image
}

export const appendMarkdown = (target, text) => {
  appendFormattedText(target, text, { resolveImage })
}
