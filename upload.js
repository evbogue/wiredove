import { apds } from 'apds'
import { h } from 'h'

export const imgUpload = async (textarea) => {
  const uploadButton = h('button', {
    classList: 'material-symbols-outlined',
    onclick: () => { uploader.click() }
  }, ['image_arrow_up'])
  
  const uploader = h('input', { type: 'file', style: 'display: none;'})
  
  uploader.addEventListener('change', (e) => {
    const file = e.target.files[0]
    const reader = new FileReader()
  
    reader.onload = (e) => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const img = new Image()
  
      img.onload = async () => {
        //const size = 256
        //if (img.width > size || img.height > size) {
        //  const width = img.width
        //  const height = img.height
        //  let cropWidth
        //  let cropHeight
        //  if (width > height) {
        //    cropWidth = size
        //    cropHeight = cropWidth * (height / width)
        //  } else {
        //    cropHeight = size
        //    cropWidth = cropHeight * (width / height)
        //  }
  
        //  canvas.width = cropWidth
        //  canvas.height = cropHeight
        //  ctx.drawImage(img, 0, 0, width, height, 0, 0, cropWidth, cropHeight)
        //  const croppedImage = canvas.toDataURL()
        //  avatarImg.src = croppedImage
        //  const hash = await apds.make(croppedImage)
        //  await apds.put('image', hash)
        //} else {
          const croppedImage = canvas.toDataURL()
          const hash = await apds.make(img.src)
          const mdimg = `![](${hash})`
          console.log(await apds.get(hash))
          if (textarea.value) {
            textarea.value = textarea.value + '\n' + mdimg
          } else {
            textarea.value = mdimg
          }
        //  await apds.put('image', hash)
        //}
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })



  return h('div', [
    uploadButton,
    uploader 
  ])
}

