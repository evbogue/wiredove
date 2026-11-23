// Only the explicit handoff from a public page pauses startup.
export function confirmSharedEntry(location, document) {
  const url = new URL(location.href)
  if (url.searchParams.get('enter') !== 'shared') return Promise.resolve(false)

  const back = url.searchParams.get('back')
  const panel = document.createElement('main')
  panel.className = 'share-entry'
  const title = document.createElement('h1')
  title.textContent = 'Open in Wiredove'
  const description = document.createElement('p')
  description.textContent = 'The app stores posts in this browser and connects to your Wiredove node or peers to sync. You can browse without creating an identity.'
  const open = document.createElement('button')
  open.textContent = 'Enable sync and open'
  const setup = document.createElement('button')
  setup.textContent = 'Enable sync and set up identity'
  const leave = document.createElement('a')
  leave.textContent = 'Back to the public page'
  leave.href = /^\/[A-Za-z0-9_-]{8,43}$/.test(back || '') ? back : '/'
  panel.append(title, description, open, setup, leave)
  document.body.append(panel)

  return new Promise(resolve => {
    const enter = wantsIdentity => {
      url.searchParams.delete('enter')
      url.searchParams.delete('back')
      document.defaultView.history.replaceState(null, '', url)
      panel.remove()
      resolve(wantsIdentity)
    }
    open.addEventListener('click', () => enter(false), { once: true })
    setup.addEventListener('click', () => enter(true), { once: true })
  })
}
