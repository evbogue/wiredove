import { h } from 'h'
import { apds } from 'apds'
import { canCompose, openComposer } from '../../navbar.js'
import { promptKeypair } from '../../identify.js'
import { profileAvatarLink } from '../../profile.js'
import { notificationsButton } from '../../notifications.js'
import { subscribeQueueStatus } from '../../network_queue.js'

import { actionButton, actionIcon as workspaceIcon, newPostButton } from './action-button.js'

export { workspaceIcon }

export function createWorkspaceShell(scroller, application) {
  const primary = h('div', { classList: 'workspace-sidebar-views' })
  const footer = h('div', { classList: 'workspace-sidebar-footer' })
  const brandName = scroller.ownerDocument.location?.hostname === 'bot.anproto.com' ? 'ANBot' : 'Wiredove'
  const desktopBrand = h('a', { href: '#', classList: 'workspace-brand' }, [brandName])
  const sidebar = h('nav', { classList: 'workspace-sidebar' }, [desktopBrand, primary, footer])
  sidebar.setAttribute('aria-label', 'Workspace navigation')
  const slot = h('aside', { classList: 'workspace-sidebar-slot' }, [sidebar])
  const drawer = h('dialog', { classList: 'workspace-drawer' })
  drawer.setAttribute('aria-label', 'Workspace navigation drawer')
  const drawerButton = actionButton('Menu', 'menu', { classList: 'workspace-menu', iconOnly: true })
  drawerButton.setAttribute('aria-expanded', 'false')
  drawerButton.setAttribute('aria-haspopup', 'dialog')
  const close = actionButton('Close menu', 'close', { iconOnly: true })
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
  const header = h('header', { classList: 'workspace-context' }, [title, actions])
  const mobileBar = h('div', { classList: 'workspace-mobile-bar' }, [
    drawerButton, h('a', { href: '#', classList: 'workspace-brand' }, [brandName]),
  ])
  const content = h('div', { classList: 'workspace-content' }, [mobileBar, header])
  const layout = h('div', { classList: 'workspace-layout' }, [slot, content, drawer])
  scroller.before(layout)
  content.append(scroller)
  const ResizeObserver = scroller.ownerDocument.defaultView.ResizeObserver
  const resize = ResizeObserver && new ResizeObserver(() => {
    const mobile = drawerButton.getClientRects().length > 0
    if (drawer.open && !mobile) drawer.close()
    if (mobile && identity.parentNode !== mobileBar) mobileBar.append(identity)
    if (!mobile && identity.parentNode !== footer) footer.append(identity)
  })
  resize?.observe(layout)

  const search = h('input', { type: 'search', placeholder: 'Search', autocomplete: 'off' })
  search.setAttribute('aria-label', 'Search Wiredove')
  const submitSearch = actionButton('Search', 'search', { type: 'submit', iconOnly: true })
  const searchForm = h('form', { classList: 'workspace-search' }, [search, submitSearch])
  searchForm.addEventListener('submit', event => {
    event.preventDefault()
    if (drawer.open) drawer.close()
    const query = search.value.trim()
    void application?.navigation.navigate(query ? '?' + query : '')
  })
  const newPost = newPostButton(() => {
    if (drawer.open) drawer.close()
    void openComposer(application)
  }, { classList: 'workspace-new-post', hidden: true })
  header.append(searchForm, newPost)

  const identity = h('div', { classList: 'workspace-identity' })
  const social = actionButton('Social view', 'dynamic_feed')
  social.addEventListener('click', () => { void application?.navigation.setWorkspace(false) })
  const options = h('details', { classList: 'workspace-options' }, [
    h('summary', {}, ['Workspace options']), h('a', { href: '#settings' }, ['Settings']),
  ])
  if (application?.session?.policy?.capabilities?.notifications !== false && application) {
    options.append(notificationsButton())
  }
  options.append(h('a', { href: 'https://github.com/evbogue/wiredove' }, ['Source on GitHub']), social)
  footer.append(options, identity)

  async function refreshIdentity() {
    if (!application) return
    const key = await apds.pubkey()
    newPost.hidden = !await canCompose(application)
    if (key) {
      identity.replaceChildren(await profileAvatarLink(key, { label: true }))
      return
    }
    const control = h('button', { type: 'button', onclick: () => {
      if (drawer.open) drawer.close()
      promptKeypair(undefined, application)
    } }, [workspaceIcon('person_add'), h('span', { classList: 'workspace-identity-label' }, ['Posting identity'])])
    control.setAttribute('aria-label', 'Create or import identity')
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
