import { createImageUpload } from './client/ui/image-upload.js'
import { storeMedia } from './media.js'

export const uploadImage = (file, options = {}) => storeMedia(file, options)

// New post images use AndFS. Historical APDS image reads stay in markdown.js.
export const imgUpload = async (textarea, { reply, replyto, ...options } = {}) =>
  createImageUpload(textarea, {
    ...options,
    persistMedia: (file, status) => uploadImage(file, { reply, replyto, ...status })
  })

export async function uploadProfilePhoto(cropped, { original, crop, onStatus } = {}) {
  const source = await uploadImage(original, { onStatus })
  const photo = await uploadImage(cropped, { onStatus })
  return { image: photo.media_url, original: source.media_url, crop }
}
