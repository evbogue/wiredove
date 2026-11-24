export function trackVisualViewport() {
  const viewport = window.visualViewport
  if (!viewport) return

  const style = document.documentElement.style
  function update() {
    style.setProperty('--preview-viewport-top', `${viewport.offsetTop}px`)
    style.setProperty('--preview-viewport-height', `${viewport.height}px`)
    style.setProperty('--preview-viewport-center-x', `${viewport.offsetLeft + viewport.width / 2}px`)
    style.setProperty('--preview-viewport-width', `${viewport.width}px`)
  }

  update()
  viewport.addEventListener('resize', update, { passive: true })
  viewport.addEventListener('scroll', update, { passive: true })
}
