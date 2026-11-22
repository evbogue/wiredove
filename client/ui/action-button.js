export function actionIcon(name) {
  const icon = document.createElement('span')
  icon.className = 'material-symbols-outlined'
  icon.textContent = name
  icon.setAttribute('aria-hidden', 'true')
  return icon
}

export function actionButton(label, symbol, { classList = '', primary = false, iconOnly = false, ...attributes } = {}) {
  const style = iconOnly ? 'wiredove-button-icon' : 'wiredove-button-label'
  const button = document.createElement('button')
  Object.assign(button, { type: 'button', ...attributes })
  button.className = [style, primary && 'wiredove-button-primary', classList].filter(Boolean).join(' ')
  button.append(actionIcon(symbol))
  if (!iconOnly) button.append(label)
  if (iconOnly) {
    button.title = attributes.title || label
    button.setAttribute('aria-label', label)
  }
  return button
}

export function newPostButton(onclick, attributes) {
  return actionButton('New post', 'edit_square', { ...attributes, primary: true, onclick })
}
