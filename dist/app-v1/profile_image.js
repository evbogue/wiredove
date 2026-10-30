import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'
import { send } from './send.js'
import { andfsImageMetadata } from './client/andfs.js'
import { verifiedImageSource } from './client/ui/image-source.js'

export async function resolveImageSrc(value) {
  if (!value || typeof value !== 'string') return null
  if (andfsImageMetadata(value)) {
    try { return await verifiedImageSource(value) } catch { return null }
  }
  if (value.length === 44) {
    const image = await apds.get(value)
    if (image) return image
    await send(value)
    return null
  }
  if (/^data:image\//.test(value)) return value
  try {
    const url = new URL(value, location.href)
    if (['http:', 'https:'].includes(url.protocol)) return url.href
  } catch {}
  return null
}
