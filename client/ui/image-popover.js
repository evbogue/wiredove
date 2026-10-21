// Hosts supply storage and transport; importing this module does not boot the app.
export const createImagePopover = ({ getImage, requestImage }) => {
  const popover = document.createElement('div')
  popover.id = 'image-popover'
  popover.className = 'image-popover'
  popover.setAttribute('role', 'dialog')
  popover.setAttribute('aria-modal', 'true')
  popover.setAttribute('aria-hidden', 'true')

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'image-popover-close material-symbols-outlined'
  closeButton.setAttribute('aria-label', 'Close image')
  closeButton.textContent = 'Cancel'

  const frame = document.createElement('div')
  frame.className = 'image-popover-frame'

  const image = document.createElement('img')
  image.className = 'image-popover-image'
  image.alt = 'Full size image'

  frame.appendChild(closeButton)
  frame.appendChild(image)
  popover.appendChild(frame)

  const closePopover = () => {
    popover.classList.remove('open')
    popover.setAttribute('aria-hidden', 'true')
    image.src = ''
  }

  const openFromImage = async (target) => {
    if (!target) return
    const hash = target.dataset.hash
    let fullSrc = target.src
    if ((!fullSrc || fullSrc === window.location.href) && hash) {
      const data = await getImage(hash)
      if (data) {
        fullSrc = data
      } else {
        await requestImage(hash)
        return
      }
    }
    if (!fullSrc) return
    image.src = fullSrc
    popover.classList.add('open')
    popover.setAttribute('aria-hidden', 'false')
  }

  popover.addEventListener('click', (event) => {
    if (event.target === popover || event.target === image) {
      closePopover()
    }
  })
  closeButton.addEventListener('click', (event) => {
    event.preventDefault()
    closePopover()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popover.classList.contains('open')) {
      closePopover()
    }
  })

  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('img.post-image')
    if (!target) return
    event.preventDefault()
    openFromImage(target)
  })

  document.body.addEventListener('keydown', (event) => {
    const target = event.target
    if (!target || !target.matches('img.post-image')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openFromImage(target)
    }
  })

  return popover
}

