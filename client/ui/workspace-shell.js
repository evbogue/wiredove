import { h } from 'h'
import { apds } from 'apds'
import { canCompose, openComposer } from '../../navbar.js'
import { promptKeypair } from '../../identify.js'
import { notificationsButton } from '../../notifications.js'
import { subscribeQueueStatus } from '../../network_queue.js'

export function createWorkspaceShell(scroller, application) {
  const primary = h('div', { classList: 'workspace-sidebar-views' })
  const footer = h('div', { classList: 'workspace-sidebar-footer' })
  const sidebar = h('nav', { classList: 'workspace-sidebar' }, [primary, footer])
  sidebar.setAttribute('aria-label', 'Workspace navigation')
  const slot = h('aside', { classList: 'workspace-sidebar-slot' }, [sidebar])
  const drawer = h('dialog', { classList: 'workspace-drawer' })
  drawer.setAttribute('aria-label', 'Workspace navigation drawer')
  const drawerButton = h('button', { type: 'button', classList: 'workspace-menu' }, ['Menu'])
  drawerButton.setAttribute('aria-expanded', 'false')
  drawerButton.setAttribute('aria-haspopup', 'dialog')
  const close = h('button', { type: 'button' }, ['Close menu'])
  close.addEventListener('click', () => drawer.close())
  drawer.append(close)
  drawerButton.addEventListener('click', () => {
    drawer.append(sidebar)
    drawer.showModal()
    drawerButton.setAttribute('aria-expanded', 'true')
  })
  drawer.addEventListener('close', () => {
    slot.append(sidebar)
    drawerButton.setAttribute('aria-expanded', 'false')
    if (drawerButton.getClientRects().length) drawerButton.focus()
  })
  sidebar.addEventListener('click', event => {
    if (drawer.open && event.target.closest('a[href]') && !event.defaultPrevented) drawer.close()
  })

  const title = h('h1')
  const actions = h('div', { classList: 'workspace-context-actions' })
  const header = h('header', { classList: 'workspace-context' }, [drawerButton, title, actions])
  const content = h('div', { classList: 'workspace-content' }, [header])
  const layout = h('div', { classList: 'workspace-layout' }, [slot, content, drawer])
  scroller.before(layout)
  content.append(scroller)
  const ResizeObserver = scroller.ownerDocument.defaultView.ResizeObserver
  const resize = ResizeObserver && new ResizeObserver(() => {
    if (drawer.open && !drawerButton.getClientRects().length) drawer.close()
  })
  resize?.observe(layout)

  const search = h('input', { type: 'search', placeholder: 'Search', autocomplete: 'off' })
  search.setAttribute('aria-label', 'Search Wiredove')
  const searchForm = h('form', { classList: 'workspace-search' }, [search, h('button', { type: 'submit' }, ['Search'])])
  searchForm.addEventListener('submit', event => {
    event.preventDefault()
    if (drawer.open) drawer.close()
    const query = search.value.trim()
    void application?.navigation.navigate(query ? '?' + query : '')
  })
  const newPost = h('button', { type: 'button', classList: 'workspace-new-post', hidden: true }, ['New post'])
  newPost.addEventListener('click', () => {
    if (drawer.open) drawer.close()
    void openComposer(application)
  })
  sidebar.prepend(newPost, searchForm)

  const identity = h('div')
  const social = h('button', { type: 'button' }, ['Social view'])
  social.addEventListener('click', () => { void application?.navigation.setWorkspace(false) })
  footer.append(identity, h('a', { href: '#settings' }, ['Settings']))
  if (application?.session?.policy?.capabilities?.notifications !== false && application) {
    footer.append(notificationsButton())
  }
  footer.append(h('a', { href: 'https://github.com/evbogue/wiredove' }, ['Source on GitHub']), social)

  async function refreshIdentity() {
    if (!application) return
    const key = await apds.pubkey()
    newPost.hidden = !await canCompose(application)
    const control = key ? h('a', { href: '#' + key }, ['Your profile'])
      : h('button', { type: 'button', onclick: () => {
        if (drawer.open) drawer.close()
        promptKeypair(undefined, application)
      } }, ['Create or import identity'])
    identity.replaceChildren(control)
  }

  let unsubscribe
  let timer
  let syncUnavailable = false
  let renderSync
  function watchSync(label) {
    unsubscribe?.()
    clearInterval(timer)
    let queue
    let pending = 0
    renderSync = () => {
      const count = pending + (queue?.total || 0)
      label.textContent = count ? 'Sync · ' + count + (queue?.total && !queue.wsReady && !queue.gossipReady ? ' waiting' : ' pending') : syncUnavailable ? 'Sync unavailable' : 'Sync'
    }
    unsubscribe = subscribeQueueStatus(state => { queue = state; renderSync() })
    const artifacts = application?.session?.artifacts
    if (artifacts) {
      const update = async () => {
        try { pending = (await artifacts.pending()).length; renderSync() } catch {}
      }
      void update()
      timer = setInterval(update, 1000)
    }
  }

  return {
    layout, primary, search, actions,
    setTitle(value) { title.textContent = value },
    closeMenu() { if (drawer.open) drawer.close() },
    refreshIdentity, watchSync,
    setSyncUnavailable(value) { syncUnavailable = value; renderSync?.() },
    destroy() {
      resize?.disconnect()
      unsubscribe?.()
      clearInterval(timer)
      if (drawer.open) drawer.close()
      layout.replaceWith(scroller)
    },
  }
}
