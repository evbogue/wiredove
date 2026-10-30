import { h as element } from 'h'
import { promptKeypair } from './identify.js'
import { imageSpan } from './profile.js'
import { apds } from 'apds'
import { composer } from './composer.js'
import { notificationsButton } from "./notifications.js"
import { getPublishStatusSnapshot, subscribePublishStatus } from './publish_status.js'
import { getQueueStatusSnapshot, subscribeQueueStatus } from './network_queue.js'

// The legacy helper sets properties; ARIA names must be HTML attributes.
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

const composeButton = async (application) => {
  return h('button', {
    type: 'button',
    title: 'Compose',
    'aria-label': 'Compose',
    classList: 'nav-icon material-symbols-outlined',
    onclick: async (e) => {
      e.preventDefault()
      if (!await apds.pubkey()) {
        promptKeypair(undefined, application)
        return
      }
      const compose = await composer(undefined, { application })
      application.root.appendChild(compose)
    }
  }, ['edit_square'])
}

export const navbar = async (application) => {
  const searchInput = h('input', {
    id: 'search', type: 'search', placeholder: 'Search',
    'aria-label': 'Search Wiredove', autocomplete: 'off',
    oninput: () => { application.navigation.navigate(searchInput.value ? '?' + searchInput.value : '') }
  })
  const syncSearch = () => {
    const hash = application.navigation.get()
    try { searchInput.value = hash.startsWith('?') ? decodeURI(hash.slice(1)) : '' }
    catch { searchInput.value = hash.startsWith('?') ? hash.slice(1) : '' }
  }
  application.cleanup.push(application.navigation.subscribe(syncSearch))
  syncSearch()
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') searchInput.blur()
    if (event.key === 'Enter') { event.preventDefault(); searchInput.blur() }
  })
  const span = h('span', { classList: 'navbar-profile' })
  const publishDesc = h('span', {
    id: 'publish-desc',
    classList: 'publish-desc',
    'aria-live': 'polite'
  }, [''])
  const publishState = h('button', {
    id: 'publish-state',
    classList: 'publish-state is-idle',
    type: 'button',
    'aria-describedby': 'publish-desc'
  }, [''])
  let showPublishDesc = false
  const renderPublishDesc = () => {
    publishDesc.textContent = showPublishDesc ? (publishState.dataset.desc || '') : ''
  }
  publishState.addEventListener('mouseenter', () => {
    showPublishDesc = true
    renderPublishDesc()
  })
  publishState.addEventListener('mouseleave', () => {
    showPublishDesc = false
    renderPublishDesc()
  })
  publishState.addEventListener('focus', () => {
    showPublishDesc = true
    renderPublishDesc()
  })
  publishState.addEventListener('blur', () => {
    showPublishDesc = false
    renderPublishDesc()
  })
  publishState.addEventListener('click', () => { showPublishDesc = true; renderPublishDesc() })
  publishState.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { showPublishDesc = false; renderPublishDesc() }
  })
  const publishWrap = h('span', { classList: 'publish-wrap' }, [
    publishDesc,
    publishState
  ])
  const setPublishIndicator = (className, description) => {
    publishState.className = className
    publishState.textContent = ''
    publishState.dataset.desc = description
    publishState.title = description
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
          `Gossip queue pending (${queueStatusState.high} high, ${queueStatusState.normal} normal, ${queueStatusState.low} low)`
        )
      } else {
        setPublishIndicator('publish-state is-fail', 'Queue has pending items but no active transport')
      }
      return
    }
    const pendingCount = publishStatusState?.pendingCount || 0
    const last = publishStatusState?.lastResult
    if (pendingCount > 0) {
      setPublishIndicator('publish-state is-pending', 'Waiting for pub confirmation')
      return
    }
    if (last && (Date.now() - last.at) < PUBLISH_STATUS_FLASH_MS) {
      if (last.ok) {
        setPublishIndicator('publish-state is-ok', 'Pub confirmed message persistence')
      } else if (last.reason === 'unconfirmed') {
        setPublishIndicator('publish-state is-pending', 'Publish not yet confirmed by pub')
      } else {
        setPublishIndicator('publish-state is-fail', `Publish failed (${last.reason || 'unknown'})`)
      }
      clearTimer = setTimeout(() => {
        renderPublishState()
      }, PUBLISH_STATUS_FLASH_MS)
      return
    }
    setPublishIndicator('publish-state is-idle', 'No recent publish activity')
  }
  application.cleanup.push(subscribePublishStatus((state) => {
    publishStatusState = state
    renderPublishState()
  }))
  application.cleanup.push(subscribeQueueStatus((state) => {
    queueStatusState = state
    renderPublishState()
  }))

  const left = h('span', {classList: 'navbar-left'}, [
    h('a', {href: '#', classList: 'nav-icon', title: 'Home', 'aria-label': 'Home'}, [
      h('img', {src: './dovepurple_sm.png', classList: 'avatar_small', alt: ''})
    ]),
    await composeButton(application),
  ])

  const right = h('span', {classList: 'navbar-right'}, [
    publishWrap,
    searchInput,
    h('a', {href: 'https://github.com/evbogue/wiredove', classList: 'nav-icon nav-source material-symbols-outlined', title: 'Source on GitHub', 'aria-label': 'Source on GitHub'}, ['folder_data']),
    notificationsButton(),
    h('a', {href: '#settings', classList: 'nav-icon material-symbols-outlined', title: 'Settings', 'aria-label': 'Settings'}, ['settings']),
    span,
  ])

  const div = h('nav', {id: 'navbar', 'aria-label': 'Main navigation'}, [left, right])

  if (!await apds.keypair()) {
    span.appendChild(h('button', { type: 'button', classList: 'nav-icon material-symbols-outlined', title: 'Create or import identity', 'aria-label': 'Create or import identity', onclick: () => promptKeypair(undefined, application) }, ['person_add']))
  } else {
    const avatar = await imageSpan()
    avatar.alt = ''
    span.appendChild(h('a', {href: '#' + await apds.pubkey(), classList: 'nav-icon', title: 'Your profile', 'aria-label': 'Your profile'}, [avatar]))
  }

  application.cleanup.push(() => clearTimeout(clearTimer))
  renderPublishState()
  return div
}
