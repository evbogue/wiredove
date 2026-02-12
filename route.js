import { apds } from 'apds'
import { render } from './render.js'
import { h } from 'h'
import { composer } from './composer.js'
import { buildShareMessage, parseSharePayload } from './share.js'
import { settings, importKey } from './settings.js'
import { adder } from './adder.js'
import { importBlob } from './import.js'
import { send } from './send.js'
import { noteInterest } from './sync.js'
import { isBlockedAuthor } from './moderation.js'
import { buildProfileHeader } from './profile_header.js'
import { perfStart, perfEnd } from './perf.js'
import { FeedStore } from './feed_store.js'
import { FeedOrchestrator } from './feed_orchestrator.js'

let activeRouteRun = 0
let activeRouteController = null
let activeOrchestrator = null
let activePanelKey = null
const routePanels = new Map()
const routeScrollTop = new Map()

const getScroller = () => {
  let scroller = document.getElementById('scroller')
  if (scroller) { return scroller }
  scroller = h('div', { id: 'scroller' })
  document.body.appendChild(scroller)
  return scroller
}

const getPanelKey = (src) => (src === '' ? '__home__' : src)
const panelKeyToSrc = (key) => (key === '__home__' ? '' : key)

const getRoutePanel = (scroller, key) => {
  let panel = routePanels.get(key)
  if (panel && !document.body.contains(panel)) {
    routePanels.delete(key)
    panel = null
  }
  if (!panel) {
    panel = h('div', { classList: 'route-panel' })
    panel.dataset.routeKey = key
    panel.style.display = 'none'
    routePanels.set(key, panel)
    scroller.appendChild(panel)
  } else if (panel.parentNode !== scroller) {
    scroller.appendChild(panel)
  }
  return panel
}

const activatePanel = (key, panel) => {
  if (activePanelKey && activePanelKey !== key) {
    const previous = routePanels.get(activePanelKey)
    if (previous) {
      routeScrollTop.set(activePanelKey, window.scrollY || 0)
      previous.style.display = 'none'
    }
    window.__feedController?.deactivateFeed?.(panelKeyToSrc(activePanelKey))
  }
  panel.style.display = ''
  activePanelKey = key
  window.__feedController?.activateFeed?.(panelKeyToSrc(key))
  const savedTop = routeScrollTop.get(key)
  if (typeof savedTop === 'number') {
    setTimeout(() => {
      window.scrollTo(0, savedTop)
    }, 0)
  }
}

const waitForFirstRenderedAuthor = (container, timeoutMs = 6000) => new Promise((resolve) => {
  if (!container) { resolve(null); return }
  const existing = container.querySelector('[data-author]')
  if (existing && existing.dataset.author) {
    resolve(existing.dataset.author)
    return
  }
  let resolved = false
  const observer = new MutationObserver(() => {
    if (resolved) { return }
    const found = container.querySelector('[data-author]')
    if (found && found.dataset.author) {
      resolved = true
      observer.disconnect()
      resolve(found.dataset.author)
    }
  })
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-author'] })
  setTimeout(() => {
    if (resolved) { return }
    resolved = true
    observer.disconnect()
    resolve(null)
  }, timeoutMs)
})

const scheduleReplyIndexBuild = () => {
  void render.buildReplyIndex().then(() => {
    render.refreshVisibleReplies?.()
  }).catch((err) => {
    console.warn('reply index build failed', err)
  })
}

const beginRouteRun = () => {
  activeRouteRun += 1
  if (activeOrchestrator) {
    activeOrchestrator.stop()
    activeOrchestrator = null
  }
  if (activeRouteController) {
    activeRouteController.abort()
  }
  activeRouteController = new AbortController()
  return {
    runId: activeRouteRun,
    signal: activeRouteController.signal
  }
}

const makeRouteContext = (src, scroller) => {
  const { runId, signal } = beginRouteRun()
  const isActive = () => runId === activeRouteRun && window.location.hash.substring(1) === src
  const store = new FeedStore(src, { isActive })
  const orchestrator = new FeedOrchestrator({ src, signal, isActive, store })
  activeOrchestrator = orchestrator
  return { runId, signal, isActive, store, orchestrator, scroller, src }
}

export const route = async () => {
  const token = perfStart('route', window.location.hash.substring(1) || 'home')
  const src = window.location.hash.substring(1)
  const scroller = getScroller()
  const panelKey = getPanelKey(src)
  const panel = getRoutePanel(scroller, panelKey)
  activatePanel(panelKey, panel)

  try {
    if (src.startsWith('share=')) {
      const payload = parseSharePayload(src)
      if (payload) {
        const message = buildShareMessage(payload)
        setTimeout(async () => {
          try {
            const compose = await composer(null, { initialBody: message, autoGenKeypair: true })
            document.body.appendChild(compose)
          } catch (err) {
            console.log(err)
          }
        }, 0)
        history.replaceState(null, '', '#')
        if (typeof window.onhashchange === 'function') {
          window.onhashchange()
        }
        return
      }
    }

    if (src === '' || src.startsWith('share=')) {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel)
      const { log } = await ctx.orchestrator.startHome()
      if (!ctx.isActive()) { return }
      adder(log || [], src, panel)
      panel.dataset.ready = 'true'
      return
    }

    if (src === 'settings') {
      panel.replaceChildren()
      if (await apds.pubkey()) {
        panel.appendChild(await settings())
      } else {
        panel.appendChild(await importKey())
      }
      return
    }

    if (src === 'import') {
      panel.replaceChildren()
      panel.appendChild(await importBlob())
      return
    }

    if (src.length < 44 && !src.startsWith('?')) {
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel)
      const { query, primaryKey } = await ctx.orchestrator.startAlias(src)
      if (!ctx.isActive()) { return }
      adder(query || [], src, panel)
      if (query.length) {
        const header = await buildProfileHeader({ label: src, messages: query, canEdit: false, pubkey: primaryKey })
        if (header) { panel.appendChild(header) }
      } else {
        const header = await buildProfileHeader({ label: src, messages: [], canEdit: false, pubkey: primaryKey })
        if (header) { panel.appendChild(header) }
      }
      return
    }

    if (src.length === 44) {
      panel.replaceChildren()
      if (await isBlockedAuthor(src)) { return }
      const selfKey = await apds.pubkey()
      await noteInterest(src)
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel)
      const { log } = await ctx.orchestrator.startAuthor(src)
      if (!ctx.isActive()) { return }
      adder(log || [], src, panel)
      const canEdit = !!(selfKey && selfKey === src)
      void waitForFirstRenderedAuthor(panel).then(async (author) => {
        if (!ctx.isActive()) { return }
        if (!author || author !== src) { return }
        const header = await buildProfileHeader({ label: src.substring(0, 10), messages: log || [], canEdit, pubkey: src })
        if (header) { panel.prepend(header) }
      })
      if (!log || !log[0]) {
        await send(src)
      }
      return
    }

    if (src.startsWith('?')) {
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel)
      const { log } = await ctx.orchestrator.startSearch(src)
      if (!ctx.isActive()) { return }
      adder(log || [], src, panel)
      return
    }

    if (src.length > 44) {
      panel.replaceChildren()
      const hash = await apds.hash(src)
      const opened = await apds.open(src)
      const author = src.substring(0, 44)
      if (await isBlockedAuthor(author)) { return }
      await noteInterest(author)
      if (opened) {
        await apds.add(src)
      }
      const check = await document.getElementById(hash)
      if (!check) {
        let ts = 0
        if (opened) {
          ts = Number.parseInt(opened.substring(0, 13), 10)
          if (Number.isNaN(ts)) { ts = 0 }
        }
        if (!ts) { ts = Date.now() }
        const div = render.insertByTimestamp(panel, hash, ts)
        if (!div) { return }
        if (opened) { div.dataset.opened = opened }
        await render.blob(src, { hash, opened })
      }
    }
  } finally {
    perfEnd(token)
  }
}

window.onhashchange = async () => {
  if (activeOrchestrator) {
    activeOrchestrator.stop()
    activeOrchestrator = null
  }
  if (activeRouteController) {
    activeRouteController.abort()
    activeRouteController = null
  }
  if (window.location.hash === '#?') {
    const search = document.getElementById('search')
    search.value = ''
    search.classList = 'material-symbols-outlined'
    window.location.hash = ''
  }
  await route()
}
