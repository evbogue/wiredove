import { h } from 'h' 
import { apds } from 'apds'

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

  if (existingImage) { avatarImg.src = await apds.get(existingImage)}

  avatarImg.classList = 'avatar_small'
  
  return avatarImg
}

export const avatarSpan = async () => {
  const avatarImg = await apds.visual(await apds.pubkey())

  const existingImage = await apds.get('image')
  
  if (existingImage) { avatarImg.src = await apds.get(existingImage)}

  avatarImg.classList = 'avatar'

  avatarImg.onclick = () => {uploader.click()}

  const uploader = h('input', { type: 'file', style: 'display: none;'})

  uploader.addEventListener('change', (e) => {
    const file = e.target.files[0]
    const reader = new FileReader()

    reader.onload = (e) => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const img = new Image()

      img.onload = async () => {
        const size = 256
        if (img.width > size || img.height > size) {
          const width = img.width
          const height = img.height
          let cropWidth
          let cropHeight

          if (width > height) {
            cropWidth = size
            cropHeight = cropWidth * (height / width)
          } else {
            cropHeight = size
            cropWidth = cropHeight * (width / height)
          }

          canvas.width = cropWidth
          canvas.height = cropHeight
          ctx.drawImage(img, 0, 0, width, height, 0, 0, cropWidth, cropHeight)
          const croppedImage = canvas.toDataURL()
          avatarImg.src = croppedImage
          const hash = await apds.make(croppedImage)
          await apds.put('image', hash)
        } else {
          const croppedImage = canvas.toDataURL()
          avatarImg.src = img.src
          const hash = await apds.make(img.src)
          await apds.put('image', hash)
        }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

  const span = h('span', [
    avatarImg,
    uploader
  ]) 

  return span
}

export const profile = async () => {
  const div = h('div')

  div.appendChild(await avatarSpan())

  div.appendChild(h('div', {classList: 'pubkey' }, [await apds.pubkey()]))

  div.appendChild(await nameDiv())
  return div
}
