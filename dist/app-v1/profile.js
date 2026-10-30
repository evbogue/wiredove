import { h } from 'https://esm.sh/gh/evbogue/apds@78abedd/lib/h.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'
import { resolveImageSrc } from './profile_image.js'
import { createProfileEditor } from './client/ui/profile-editor.js'
import { uploadProfilePhoto } from './upload.js'

const cache = new Map()
let cacheTime = Date.now()
const getCachedImage = key => {
  if (Date.now() - cacheTime > 60000) { cache.clear(); cacheTime = Date.now() }
  return cache.get(key)
}

export const nameDiv = async () => {
  const name = await apds.get('name')

  const namer = h('input', {
    placeholder: name || 'Name yourself'
  })

  const namerDiv = h('div', [
    namer,
    h('button', {onclick: async () => {
      if (namer.value) {
        namer.placeholder = namer.value
        await apds.put('name', namer.value)
        namer.value = ''
      }
    }}, ['Save'])
  ])

  return namerDiv
}

export const nameSpan = async () => {
  const pubkey = await apds.pubkey()
  const span = h('a', {href: '#' + pubkey, classList: 'avatarlink'}, [await apds.get('name') || pubkey.substring(0, 10)])
  return span
}

export const imageSpan = async () => {
  const avatarImg = await apds.visual(await apds.pubkey())

  const existingImage = await apds.get('image')

  if (existingImage) { 
    if (getCachedImage(existingImage)) {
      avatarImg.src = getCachedImage(existingImage)
    } else {
      const src = await resolveImageSrc(existingImage)
      if (src) { avatarImg.src = src; cache.set(existingImage, src) }
    }
  }

  avatarImg.classList = 'avatar_small'
  
  return avatarImg
}

export const avatarSpan = async () => {
  const avatarImg = await apds.visual(await apds.pubkey())

  const existingImage = await apds.get('image')
  
  if (existingImage) { 
    if (getCachedImage(existingImage)) {
      avatarImg.src = getCachedImage(existingImage)
    } else {
      const src = await resolveImageSrc(existingImage)
      if (src) { avatarImg.src = src; cache.set(existingImage, src) }
    }
  }

  avatarImg.classList = 'avatar'

  const editor = createProfileEditor({
    imageSrc: avatarImg.src,
    onImageChange: async (data, cropped, options) => {
      const saved = await uploadProfilePhoto(cropped, options)
      await apds.put('image', saved.image)
      await apds.put('profile_photo', saved)
      avatarImg.src = data; cache.set(saved.image, data)
      return saved
    }
  })
  editor.photo.hidden = true
  avatarImg.onclick = () => editor.choosePhoto()
  const span = h('span', [avatarImg, editor.photo])

  return span
}

export const profile = async () => {
  const div = h('div')

  div.appendChild(await avatarSpan())

  div.appendChild(h('div', {classList: 'pubkey' }, [await apds.pubkey()]))

  div.appendChild(await nameDiv())
  return div
}
