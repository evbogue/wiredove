// Native modal dialogs are document-wide. Within an application shadow root use
// a locally mounted dialog, with keyboard behavior contained in that dialog.
export const showScopedDialog = (dialog, anchor) => {
  const doc = dialog.ownerDocument
  let tree = anchor?.getRootNode()
  let root = doc
  while (tree?.host) {
    if (tree.querySelector('.wiredove-application')) { root = tree; break }
    tree = tree.host.getRootNode()
  }
  if (root === doc) {
    doc.body.append(dialog)
    dialog.showModal()
    return
  }
  const previous = root.activeElement
  const keydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
    }
    if (event.key !== 'Tab') return
    const controls = [...dialog.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]')]
      .filter(node => !node.disabled && !node.closest('[hidden]') && node.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus() }
  }
  dialog.addEventListener('keydown', keydown)
  dialog.addEventListener('close', () => {
    dialog.removeEventListener('keydown', keydown)
    if (previous?.isConnected) previous.focus({ preventScroll: true })
  }, { once: true })
  root.append(dialog)
  dialog.show()
}
