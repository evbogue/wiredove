import { apds } from 'apds'
import { iconButton } from './client/ui/composer-surface.js'

export const imgUpload = async (textarea, { onBusy, onChange } = {}) => {
  const root = document.createElement('div')
  root.className = 'composer-image-upload'
  const input = document.createElement('input')
  input.type = 'file'; input.accept = 'image/*'; input.hidden = true
  const status = document.createElement('span')
  status.className = 'composer-image-status'
  status.setAttribute('role', 'status')
  const preview = document.createElement('div')
  preview.className = 'composer-image-previews'
  let disposed = false
  const button = iconButton('Upload image', 'image_arrow_up', () => input.click())
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { status.textContent = 'Choose an image file'; return }
    button.disabled = true; onBusy?.(true); status.textContent = 'Adding image…'
    try {
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read image'))
        reader.readAsDataURL(file)
      })
      const image = new Image()
      image.src = source
      await image.decode()
      if (disposed) return
      const hash = await apds.make(source)
      if (disposed) return
      textarea.value = [textarea.value, `![](${hash})`].filter(Boolean).join('\n')
      const card = document.createElement('div')
      card.className = 'composer-image-card'
      const thumbnail = document.createElement('img')
      thumbnail.src = source; thumbnail.alt = file.name
      card.append(thumbnail, iconButton('Remove image', 'close', () => {
        textarea.value = textarea.value.replace(`![](${hash})`, '').trim()
        card.remove(); onChange?.()
      }))
      preview.append(card)
      onChange?.(); status.textContent = ''
    } catch (error) { if (!disposed) status.textContent = error.message || 'Could not add image' }
    finally { if (!disposed) { button.disabled = false; onBusy?.(false) } }
  })
  root.append(button, input, status)
  root.preview = preview
  root.destroy = () => { disposed = true }
  return root
}
