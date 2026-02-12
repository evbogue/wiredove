import { h } from 'h'
import { identify, promptKeypair } from './identify.js'
import { imageSpan } from './profile.js'
import { apds } from 'apds'
import { composer } from './composer.js'
import { notificationsButton } from "./notifications.js"
import { getPublishStatusSnapshot, subscribePublishStatus } from './publish_status.js'
import { getQueueStatusSnapshot, subscribeQueueStatus } from './network_queue.js'

const PUBLISH_STATUS_FLASH_MS = 8000

const composeButton = async () => {
  const hasKey = !!(await apds.pubkey())
  return h('a', {
    href: '#',
    classList: hasKey ? 'material-symbols-outlined' : 'material-symbols-outlined disabled',
    onclick: async (e) => {
      e.preventDefault()
      if (!await apds.pubkey()) {
        promptKeypair()
        return
      }
      const compose = await composer()
      document.body.appendChild(compose)
    }
  }, ['Edit_Square'])
}

const searchInput = h('input', {
  id: 'search',
  placeholder: 'Search',
  classList: 'material-symbols-outlined',
  style: 'width: 75px; height: 14px;',
  oninput: () => {
    searchInput.classList = ''
    window.location.hash = '?' + searchInput.value
    if (!searchInput.value) { searchInput.classList = 'material-symbols-outlined' }
    if (searchInput.value === '?') {searchInput.value = ''} 
  }
})

export const navbar = async () => {
  const span = h('span')
  const publishDesc = h('span', {
    id: 'publish-desc',
    classList: 'publish-desc',
    'aria-live': 'polite'
  }, [''])
  const publishState = h('span', {
    id: 'publish-state',
    classList: 'publish-state is-idle',
    tabindex: '0'
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
  const publishWrap = h('span', { classList: 'publish-wrap' }, [
    publishDesc,
    publishState
  ])
  const setPublishIndicator = (className, description) => {
    publishState.className = className
    publishState.textContent = ''
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
  subscribePublishStatus((state) => {
    publishStatusState = state
    renderPublishState()
  })
  subscribeQueueStatus((state) => {
    queueStatusState = state
    renderPublishState()
  })

  const left = h('span', {classList: 'navbar-left'}, [
    h('a', {href: '#', classList: 'material-symbols-outlined'}, [
      h('img', {src: './dovepurple_sm.png', classList: 'avatar_small'})
    ]),
    await composeButton(),
  ])

  const right = h('span', {classList: 'navbar-right'}, [
    publishWrap,
    searchInput,
    h('a', {href: 'https://github.com/evbogue/wiredove', classList: 'material-symbols-outlined', style: 'margin-top: 3px;'}, ['Folder_Data']),
    notificationsButton(),
    h('a', {href: '#settings', classList: 'material-symbols-outlined', style: 'margin-top: 3px;'}, ['Settings']),
    span,
  ])

  const div = h('div', {id: 'navbar'}, [left, right])

  if (!await apds.keypair()) {
    div.appendChild(await identify())
  } else {
    span.appendChild(h('a', {href: '#' + await apds.pubkey()},[await imageSpan()]))
  }

  return div
}
