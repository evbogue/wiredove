import { h as element } from 'h'
import { identify, promptKeypair } from './identify.js'
import { imageSpan } from './profile.js'
import { apds } from 'apds'
import { composer } from './composer.js'
import { notificationsButton } from "./notifications.js"
import { getPublishStatusSnapshot, subscribePublishStatus } from './publish_status.js'
import { getQueueStatusSnapshot, subscribeQueueStatus } from './network_queue.js'

// The legacy element helper assigns properties; ARIA needs HTML attributes.
const h = (tag, attributes, children) => {
  const node = element(tag, attributes, children)
  if (attributes && !Array.isArray(attributes)) {
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('aria-')) node.setAttribute(name, value)
    }
  }
  return node
}

const PUBLISH_STATUS_FLASH_MS = 8000

const icon = (name) => h('span', { classList: 'material-symbols-outlined', 'aria-hidden': 'true' }, [name])

const composeButton = () => h('button', {
  type: 'button', classList: 'nav-compose', title: 'Compose a post',
  onclick: async () => {
    if (!await apds.pubkey()) { promptKeypair(); return }
    document.body.appendChild(await composer())
  }
}, [icon('edit_square'), h('span', ['Compose'])])

export const navbar = async () => {
  const searchInput = h('input', {
    id: 'search', type: 'search', placeholder: 'Search Wiredove',
    'aria-label': 'Search Wiredove', autocomplete: 'off',
    oninput: () => { window.location.hash = searchInput.value ? '?' + searchInput.value : '' }
  })
  const syncSearch = () => {
    const hash = window.location.hash.slice(1)
    try { searchInput.value = hash.startsWith('?') ? decodeURI(hash.slice(1)) : '' }
    catch { searchInput.value = hash.startsWith('?') ? hash.slice(1) : '' }
  }
  window.addEventListener('hashchange', syncSearch)
  syncSearch()
  const search = h('form', { classList: 'nav-search', role: 'search',
    onsubmit: (event) => { event.preventDefault(); searchInput.focus() }
  }, [icon('search'), searchInput])
  const searchToggle = h('button', {
    type: 'button', classList: 'nav-search-toggle', title: 'Search Wiredove',
    'aria-label': 'Search Wiredove', 'aria-expanded': 'false', 'aria-controls': 'search',
    onclick: () => {
      const open = div.classList.toggle('search-open')
      searchToggle.setAttribute('aria-expanded', String(open))
      if (open) searchInput.focus()
    }
  }, [icon('search')])
  const publishDesc = h('span', {
    id: 'publish-desc',
    classList: 'publish-desc',
    'aria-live': 'polite'
  }, [''])
  const publishState = h('button', {
    id: 'publish-state',
    classList: 'publish-state is-idle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'publish-desc'
  }, [''])
  let showPublishDesc = false
  const renderPublishDesc = () => {
    publishDesc.textContent = publishState.dataset.desc || ''
    publishDesc.hidden = !showPublishDesc
    publishState.setAttribute('aria-expanded', String(showPublishDesc))
  }
  publishState.addEventListener('click', () => {
    showPublishDesc = !showPublishDesc
    renderPublishDesc()
  })
  const publishWrap = h('span', { classList: 'publish-wrap' }, [
    publishDesc,
    publishState
  ])
  const setPublishIndicator = (className, description) => {
    publishState.className = className
    publishState.replaceChildren(h('span', { classList: 'publish-dot', 'aria-hidden': 'true' }))
    publishState.title = description
    publishState.dataset.desc = description
    publishState.setAttribute('aria-label', description)
    renderPublishDesc()
  }
  let clearTimer = null
  let publishStatusState = getPublishStatusSnapshot()
  let queueStatusState = getQueueStatusSnapshot()
  const renderPublishState = () => {
    if (clearTimer) {
      clearTimeout(clearTimer)
      clearTimer = null
    }
    const queueTotal = queueStatusState?.total || 0
    const queueReady = Boolean(queueStatusState?.wsReady || queueStatusState?.gossipReady)
    if (queueTotal > 0) {
      if (queueReady) {
        setPublishIndicator(
          'publish-state is-pending',
          'Sending queued updates'
        )
      } else {
        setPublishIndicator('publish-state is-fail', 'Offline — updates waiting to send')
      }
      return
    }
    const pendingCount = publishStatusState?.pendingCount || 0
    const last = publishStatusState?.lastResult
    if (pendingCount > 0) {
      setPublishIndicator('publish-state is-pending', 'Sending — waiting for server confirmation')
      return
    }
    if (last && (Date.now() - last.at) < PUBLISH_STATUS_FLASH_MS) {
      if (last.ok) {
        setPublishIndicator('publish-state is-ok', 'Saved — server confirmed your post')
      } else if (last.reason === 'unconfirmed') {
        setPublishIndicator('publish-state is-pending', 'Still waiting for server confirmation')
      } else {
        setPublishIndicator('publish-state is-fail', `Publish failed (${last.reason || 'unknown'})`)
      }
      clearTimer = setTimeout(() => {
        renderPublishState()
      }, PUBLISH_STATUS_FLASH_MS)
      return
    }
    setPublishIndicator('publish-state is-idle', 'No posts waiting to send')
  }
  subscribePublishStatus((state) => {
    publishStatusState = state
    renderPublishState()
  })
  subscribeQueueStatus((state) => {
    queueStatusState = state
    renderPublishState()
  })

  const left = h('a', { href: '#', classList: 'nav-home', 'aria-label': 'Wiredove home', title: 'Home' }, [
    h('img', { src: './dovepurple_sm.png', alt: '', classList: 'avatar_small' }),
    h('span', { classList: 'nav-wordmark' }, ['Wiredove'])
  ])
  const hasKey = !!(await apds.keypair())
  const summary = h('summary', { 'aria-label': hasKey ? 'Account menu' : 'Wiredove menu', title: hasKey ? 'Account menu' : 'Wiredove menu' }, [
    hasKey ? await imageSpan() : icon('menu')
  ])
  const links = h('div', { classList: 'nav-account-links' })
  if (hasKey) links.append(h('a', { href: '#' + await apds.pubkey() }, ['Your profile']))
  else links.append(await identify())
  const notifications = notificationsButton()
  notifications.append(h('span', ['Notifications']))
  links.append(
    notifications,
    h('a', { href: '#settings' }, ['Settings']),
    h('a', { href: 'https://github.com/evbogue/wiredove' }, ['Wiredove on GitHub'])
  )
  const account = h('details', { classList: 'nav-account' }, [summary, links])
  links.addEventListener('click', (event) => { if (event.target.closest('a, button')) account.open = false })
  const right = h('div', { classList: 'navbar-right' }, [
    publishWrap, searchToggle, composeButton(), account
  ])
  const div = h('nav', { id: 'navbar', 'aria-label': 'Main navigation' }, [left, search, right])
  const dismiss = () => { account.open = false; showPublishDesc = false; renderPublishDesc() }
  document.addEventListener('click', (event) => { if (!account.contains(event.target)) account.open = false; if (!publishWrap.contains(event.target)) { showPublishDesc = false; renderPublishDesc() } })
  div.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (account.open) summary.focus()
    if (div.classList.contains('search-open')) {
      div.classList.remove('search-open'); searchToggle.setAttribute('aria-expanded', 'false'); searchToggle.focus()
    }
    dismiss()
  })
  renderPublishState()
  return div
}
