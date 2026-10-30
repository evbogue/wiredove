import { apds } from 'apds'
import { h } from 'h'
import { buildShareMessage, parseSharePayload } from './share.js'
import { scopeDocument } from './client/runtime/application-context.js'
import { importBlob } from './import.js'
import { send } from './send.js'
import { noteInterest } from './sync.js'
import { isBlockedAuthor } from './moderation.js'
import { buildProfileHeader } from './profile_header.js'
import { perfStart, perfEnd } from './perf.js'
import { FeedStore } from './feed_store.js'
import { FeedOrchestrator } from './feed_orchestrator.js'

export const createRouter = ({ root, navigation, scroll, feeds, render: renderer,
  compose, profileHeader = buildProfileHeader, settings, importKey }) => {
const document = scopeDocument(root)
const render = renderer
const composer = compose
const buildProfileHeader = profileHeader
let disposed = false
let scrollTimer = null
const deferred = new Set()
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
  if (!panel) {
    panel = h('div', { classList: 'route-panel' })
    panel.dataset.routeKey = key
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
      routeScrollTop.set(activePanelKey, scroll.get())
      previous.remove()
    }
    feeds?.deactivateFeed?.(panelKeyToSrc(activePanelKey))
  }
  activePanelKey = key
  feeds?.activateFeed?.(panelKeyToSrc(key))
  const savedTop = routeScrollTop.get(key)
  if (typeof savedTop === 'number') {
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      if (disposed || activePanelKey !== key) return
      scroll.to({ top: savedTop })
    }, 0)
  }
}

const scheduleReplyIndexBuild = () => {
  void render.buildReplyIndex().then(() => {
    if (!disposed) render.refreshVisibleReplies?.()
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

const makeRouteContext = (src, scroller, run) => {
  const { runId, signal } = run
  const isActive = () => !disposed && runId === activeRouteRun && navigation.get() === src
  const store = new FeedStore(src, { isActive, enqueue: feeds.enqueue })
  const orchestrator = new FeedOrchestrator({ src, signal, isActive, store })
  activeOrchestrator = orchestrator
  return { runId, signal, isActive, store, orchestrator, scroller, src }
}

const route = async () => {
  if (disposed) return
  const token = perfStart('route', navigation.get() || 'home')
  const src = navigation.get()
  const run = beginRouteRun()
  const isActive = () => !disposed && run.runId === activeRouteRun && navigation.get() === src
  const scroller = getScroller()
  const panelKey = getPanelKey(src)
  const panel = getRoutePanel(scroller, panelKey)
  activatePanel(panelKey, panel)

  try {
    if (src.startsWith('share=')) {
      const payload = parseSharePayload(src)
      if (payload) {
        const message = buildShareMessage(payload)
        const timer = setTimeout(async () => {
          deferred.delete(timer)
          if (disposed) return
          try {
            const compose = await composer(null, { initialBody: message, autoGenKeypair: true })
            if (!disposed) document.body.appendChild(compose)
          } catch (err) {
            console.log(err)
          }
        }, 0)
        deferred.add(timer)
        await navigation.navigate('', { replace: true })
        return
      }
    }

    if (src === '' || src.startsWith('share=')) {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel, run)
      const { log } = await ctx.orchestrator.startHome()
      if (!ctx.isActive()) { return }
      feeds.adder(log || [], src, panel)
      panel.dataset.ready = 'true'
      return
    }

    if (src === 'settings') {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      const content = await apds.pubkey() ? await settings() : await importKey()
      if (!isActive()) return
      panel.appendChild(content)
      panel.dataset.ready = 'true'
      return
    }

    if (src === 'import') {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      const content = await importBlob(navigation)
      if (!isActive()) return
      panel.appendChild(content)
      panel.dataset.ready = 'true'
      return
    }

    if (src.length < 44 && !src.startsWith('?')) {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel, run)
      const { query, primaryKey } = await ctx.orchestrator.startAlias(src)
      if (!ctx.isActive()) { return }
      feeds.adder(query || [], src, panel)
      const header = await buildProfileHeader({ label: src, messages: query || [], canEdit: false, pubkey: primaryKey })
      // Keep the profile ahead of feed rows and loading placeholders, just as
      // on public-key routes. Header construction can outlive a route change.
      if (!ctx.isActive()) { return }
      if (header) panel.prepend(header)
      panel.dataset.ready = 'true'
      return
    }

    if (src.length === 44) {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      if (await isBlockedAuthor(src)) { return }
      const selfKey = await apds.pubkey()
      await noteInterest(src)
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel, run)
      const { log } = await ctx.orchestrator.startAuthor(src)
      if (!ctx.isActive()) { return }
      feeds.adder(log || [], src, panel)
      const canEdit = !!(selfKey && selfKey === src)
      const header = await buildProfileHeader({ label: src.substring(0, 10), messages: log || [], canEdit, pubkey: src })
      if (ctx.isActive() && header) panel.prepend(header)
      if (!log || !log[0]) {
        await send(src)
      }
      panel.dataset.ready = 'true'
      return
    }

    if (src.startsWith('?')) {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel, run)
      const { log } = await ctx.orchestrator.startSearch(src)
      if (!ctx.isActive()) { return }
      feeds.adder(log || [], src, panel)
      panel.dataset.ready = 'true'
      return
    }

    if (src.length > 44) {
      if (panel.dataset.ready === 'true') { return }
      panel.replaceChildren()
      const hash = await apds.hash(src)
      const opened = await apds.open(src)
      const author = src.substring(0, 44)
      if (await isBlockedAuthor(author)) { return }
      await noteInterest(author)
      if (opened) {
        await apds.add(src)
      }
      if (!isActive()) return
      const check = document.getElementById(hash)
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
      panel.dataset.ready = 'true'
    }
  } finally {
    perfEnd(token)
  }
}

const onNavigate = async () => {
  if (activeOrchestrator) {
    activeOrchestrator.stop()
    activeOrchestrator = null
  }
  if (activeRouteController) {
    activeRouteController.abort()
    activeRouteController = null
  }
  if (navigation.get() === '?') {
    const search = document.getElementById('search')
    if (search) { search.value = ''; search.classList = 'material-symbols-outlined' }
    await navigation.navigate('')
    return
  }
  await route()
}

const unsubscribe = navigation.subscribe(onNavigate)
return { route, navigate: (...args) => navigation.navigate(...args), destroy() {
  disposed = true
  clearTimeout(scrollTimer)
  for (const timer of deferred) clearTimeout(timer)
  activeRouteRun += 1
  unsubscribe()
  activeOrchestrator?.stop()
  activeRouteController?.abort()
  for (const panel of routePanels.values()) panel.remove()
  routePanels.clear()
  routeScrollTop.clear()
} }
}
