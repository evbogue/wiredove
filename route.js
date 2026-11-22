import { validHash } from './vendor/andfs/andfs.js'
import { createHashMediaView } from './client/ui/hash-media.js'
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
import { parseWorkspaceGitRoute, readWorkspaceSelection, workspaceGitHref } from './client/runtime/workspace-git.js'
import { createWorkspaceGitView, createWorkspaceSyncView } from './client/ui/workspace-git.js'

export const createRouter = ({ root, navigation, scroll, feeds, render: renderer,
  compose, profileHeader = buildProfileHeader, settings, importKey, queries = null, transportControls = false, mediaSource = globalThis.location?.origin }) => {
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
let workspaceLayout = null
const routePanels = new Map()
const routeScrollTop = new Map()
const mediaViews = new Set()

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
  const switchesView = activePanelKey !== null &&
    activePanelKey.startsWith('workspace/') !== key.startsWith('workspace/')
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
  const savedTop = routeScrollTop.get(key) ?? (switchesView ? 0 : undefined)
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
  const orchestrator = new FeedOrchestrator({ src, signal, isActive, store, queries })
  activeOrchestrator = orchestrator
  return { runId, signal, isActive, store, orchestrator, scroller, src }
}

// A refresh merges rows into the existing paginated feed. Never replace mounted
// messages: playback, focus, scroll position and the new-post banner survive.
let refreshQueued = false
let refreshingRows = false
let refreshAgain = false
const refreshRows = async () => {
  if (refreshingRows) { refreshAgain = true; return }
  refreshingRows = true
  try {
    do {
      refreshAgain = false
      const src = navigation.get()
      const panel = routePanels.get(getPanelKey(src))
      if (!queries || !panel?.dataset.queryFeed || panel.dataset.ready !== 'true') continue
      const runId = activeRouteRun
      const signal = activeRouteController?.signal
      const isActive = () => !disposed && runId === activeRouteRun && navigation.get() === src
      try {
        const rows = await queries.query(src, { signal })
        if (!isActive()) continue
        const store = new FeedStore(src, { isActive, enqueue: feeds.enqueue })
        await store.upsertMany(rows)
      } catch (error) {
        if (isActive() && !signal?.aborted) feeds.status?.('Could not refresh feed: ' + error.message)
      }
    } while (refreshAgain && !disposed)
  } finally { refreshingRows = false }
}
const scheduleRefresh = () => {
  if (!queries || disposed || refreshQueued) return
  refreshQueued = true
  queueMicrotask(() => { refreshQueued = false; if (!disposed) void refreshRows() })
}
const unsubscribeQueries = queries?.subscribe(scheduleRefresh)
// Explicit feed refresh, triggered from the navbar refresh icon. A refresh
// merges rows into the existing paginated feed. Never replace mounted
// messages: playback, focus, scroll position and the new-post banner survive.
const refreshFeed = async () => {
  if (!queries || disposed) return
  try {
    await queries.refresh()
    await refreshRows()
  } catch {
    if (!disposed) feeds.status?.('Backend unavailable. Local content remains available; retry refresh.')
  }
}
const watchFeed = (src, panel) => {
  if (!queries || !(src === '' || src.startsWith('?') || src.length === 44)) return
  panel.dataset.queryFeed = 'true'
  // Covers arrivals between the initial snapshot and feed registration.
  scheduleRefresh()
}

const route = async () => {
  if (disposed) return
  const token = perfStart('route', navigation.get() || 'home')
  const current = navigation.get()
  const src = current === 'sync' ? 'workspace/sync' : current
  const run = beginRouteRun()
  const isActive = () => !disposed && run.runId === activeRouteRun && navigation.get() === current
  const scroller = getScroller()
  const panelKey = getPanelKey(src)
  const panel = getRoutePanel(scroller, panelKey)
  activatePanel(panelKey, panel)

  try {
    const viewRoute = navigation.getViewRoute?.() ?? current
    const workspaceSocial = viewRoute.startsWith('workspace/feed/')
    const workspace = workspaceSocial || src.startsWith('workspace/')
    if (!workspace && workspaceLayout) {
      workspaceLayout.replaceWith(scroller)
      workspaceLayout = null
    }
    if (workspace) {
      const sync = src === 'workspace/sync'
      const request = parseWorkspaceGitRoute(src)
      const overview = request ? workspaceGitHref({ repo: request.repo, kind: 'overview' }) : '#workspace/'
      const feedLink = h('a', { href: '#workspace/feed/' }, ['Feed'])
      const repositoryLink = h('a', { href: overview }, ['Repository'])
      const syncLink = h('a', { href: '#workspace/sync' }, ['Sync'])
      const settingsLink = h('a', { href: '#workspace/feed/settings' }, ['Settings'])
      if (workspaceSocial) {
        (src === 'settings' ? settingsLink : feedLink).setAttribute('aria-current', 'page')
      } else if (sync) syncLink.setAttribute('aria-current', 'page')
      else if (!request || request.kind === 'overview') repositoryLink.setAttribute('aria-current', 'page')

      const input = h('input', { type: 'text', required: true,
        autocapitalize: 'none', spellcheck: false })
      const form = h('form', {}, [
        h('label', {}, ['Repository ID', input]),
        h('button', { type: 'submit' }, ['Open repository']),
      ])
      input.addEventListener('input', () => input.setCustomValidity(''))
      form.addEventListener('submit', event => {
        event.preventDefault()
        const repo = input.value.trim()
        if (!/^[A-Za-z0-9_-]+$/.test(repo)) {
          input.setCustomValidity('Enter a valid repository ID.')
          input.reportValidity()
          return
        }
        void navigation.navigate(workspaceGitHref({ repo, kind: 'overview' }).slice(1))
      })

      const repositoryViews = h('div', { classList: 'workspace-sidebar-views' })
      const sidebar = h('nav', { classList: 'workspace-sidebar' }, [
        h('a', { href: '#workspace/feed/compose', classList: 'workspace-new-post' }, ['New post']),
        feedLink, repositoryLink, repositoryViews, syncLink, settingsLink,
        h('details', {}, [h('summary', {}, ['Open by ID']), form]),
      ])
      sidebar.setAttribute('aria-label', 'Workspace navigation')
      if (!workspaceLayout) {
        workspaceLayout = h('div', { classList: 'workspace-layout' })
        scroller.before(workspaceLayout)
        workspaceLayout.append(sidebar, scroller)
      } else workspaceLayout.firstElementChild.replaceWith(sidebar)
      workspaceLayout.classList.toggle('workspace-social', workspaceSocial)
      if (!workspaceSocial) {
        const main = h('div', { classList: 'workspace-main' })
        panel.replaceChildren(main)

        const showRepositoryViews = selection => {
          const url = kind => workspaceGitHref({ repo: selection.repo, kind, rev: kind === 'refs' ? null : selection.rev })
          repositoryViews.replaceChildren(...[
            ['Files', 'tree'], ['History', 'commits'], ['Branches and tags', 'refs'],
          ].map(([label, kind]) => {
            const link = h('a', { href: url(kind) }, [label])
            if (selection.kind === kind) link.setAttribute('aria-current', 'page')
            return link
          }))
        }
        const showRepository = selection => {
          showRepositoryViews(selection)
          createWorkspaceGitView({
            panel: main, request: selection, signal: run.signal, isActive,
            navigate: target => navigation.navigate(target.slice(1)),
            onRevision: rev => showRepositoryViews({ ...selection, rev }),
          })
        }
        if (sync) {
          createWorkspaceSyncView({ panel: main, signal: run.signal, isActive,
            refreshSocial: () => queries?.refresh(), transportControls,
            onSelection: selection => { if (selection) showRepositoryViews(selection) },
          })
        } else if (request) {
          showRepository(request)
        } else if (src === 'workspace/') {
          const status = h('p', {}, ['Loading published repository…'])
          status.setAttribute('role', 'status')
          main.append(status)
          try {
            const selection = await readWorkspaceSelection({ signal: run.signal })
            if (!isActive()) return
            if (selection) showRepository({ repo: selection.repo, kind: 'overview' })
            else status.textContent = 'No repository has been published on this node.'
          } catch {
            if (!isActive()) return
            status.textContent = 'The published repository is unavailable.'
            const retry = h('button', { type: 'button' }, ['Retry'])
            retry.addEventListener('click', () => { void route() })
            main.append(retry)
          }
        } else {
          main.append(h('p', {}, ['This Workspace link is invalid.']),
            h('a', { href: '#workspace/' }, ['Open Workspace']))
        }
        return
      }
    }

    if (src === 'compose' || /^reply=[A-Za-z0-9+/]{43}=$/.test(src)) {
      const signature = src.startsWith('reply=') ? await apds.get(src.slice(6)) : null
      if (!isActive()) return
      if (src.startsWith('reply=') && !signature) {
        panel.textContent = 'Reply target unavailable in the selected archive.'
        return
      }
      const dialog = await composer(signature)
      if (!isActive()) { dialog.remove(); return }
      document.body.appendChild(dialog)
      return
    }

    if (src.startsWith('share=')) {
      const payload = parseSharePayload(src)
      if (payload) {
        const message = buildShareMessage(payload)
        const timer = setTimeout(async () => {
          deferred.delete(timer)
          if (disposed) return
          try {
            const compose = await composer(null, { initialBody: message, autoGenKeypair: true, appendSharedBody: payload.appendToDraft === true })
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
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel, run)
      const { log } = await ctx.orchestrator.startHome()
      if (!ctx.isActive()) { return }
      feeds.adder(log || [], src, panel)
      watchFeed(src, panel)
      panel.dataset.ready = 'true'
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (src === 'settings') {
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
      panel.replaceChildren()
      const content = await apds.pubkey() ? await settings() : await importKey()
      if (!isActive()) return
      panel.appendChild(content)
      panel.dataset.ready = 'true'
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (src === 'import') {
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
      panel.replaceChildren()
      const content = await importBlob(navigation)
      if (!isActive()) return
      panel.appendChild(content)
      panel.dataset.ready = 'true'
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (validHash(src)) {
      if (panel.dataset.ready === 'true') return
      panel.textContent = 'Loading file…'
      try {
        const media = await createHashMediaView(src, { source: mediaSource, signal: run.signal, document: root.ownerDocument })
        if (!isActive()) { media.dispose(); return }
        mediaViews.add(media)
        panel.replaceChildren(media.view)
        panel.dataset.ready = 'true'
      } catch (error) {
        if (isActive()) panel.textContent = 'File unavailable: could not retrieve and verify its bytes.'
      }
      return
    }

    if (src.length < 44 && !src.startsWith('?')) {
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
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
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (src.length === 44 && await apds.open(await apds.get(src) || '')) {
      if (panel.dataset.ready === 'true') return
      panel.replaceChildren()
      const signed = await apds.get(src), opened = await apds.open(signed)
      if (!isActive() || await isBlockedAuthor(signed.substring(0,44))) return
      await render.buildReplyIndex()
      render.insertByTimestamp(panel, src, Number(opened.substring(0,13)))
      await render.blob(signed, { hash: src, opened })
      panel.dataset.ready = 'true'
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (src.length === 44) {
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
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
      watchFeed(src, panel)
      const canEdit = !!(selfKey && selfKey === src)
      const header = await buildProfileHeader({ label: src.substring(0, 10), messages: log || [], canEdit, pubkey: src })
      if (ctx.isActive() && header) panel.prepend(header)
      if (!log || !log[0]) {
        await send(src)
      }
      panel.dataset.ready = 'true'
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (src.startsWith('?')) {
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
      panel.replaceChildren()
      panel.dataset.paginated = 'true'
      scheduleReplyIndexBuild()
      const ctx = makeRouteContext(src, panel, run)
      const { log } = await ctx.orchestrator.startSearch(src)
      if (!ctx.isActive()) { return }
      feeds.adder(log || [], src, panel)
      watchFeed(src, panel)
      panel.dataset.ready = 'true'
      if (panel.dataset.queryFeed) scheduleRefresh()
      return
    }

    if (src.length > 44) {
      if (panel.dataset.ready === 'true') { scheduleRefresh(); return }
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
      if (panel.dataset.queryFeed) scheduleRefresh()
    }
  } catch (error) {
    if (isActive() && !run.signal.aborted) throw error
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
return { route, refreshFeed, invalidate() { for (const panel of routePanels.values()) delete panel.dataset.ready }, navigate: (...args) => navigation.navigate(...args), destroy() {
  disposed = true
  clearTimeout(scrollTimer)
  for (const timer of deferred) clearTimeout(timer)
  activeRouteRun += 1
  unsubscribe()
  unsubscribeQueries?.()
  activeOrchestrator?.stop()
  activeRouteController?.abort()
  for (const panel of routePanels.values()) panel.remove()
  for (const media of mediaViews) media.dispose()
  mediaViews.clear()
  routePanels.clear()
  routeScrollTop.clear()
} }
}
