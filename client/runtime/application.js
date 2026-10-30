import { apds } from 'apds'
import { createFeedQueries } from './feed-queries.js'
import { createRouter } from '../../route.js'
import { createFeedController } from '../../adder.js'
import { createRenderer } from '../../render.js'
import { createSettings } from '../../settings.js'
import { composer } from '../../composer.js'
import { navbar } from '../../navbar.js'
import { buildProfileHeader } from '../../profile_header.js'

// UI ownership only. The caller still owns the APDS/transport session.
export const createApplication = async ({ root, navigation, scroll, session = null }) => {
  const application = { root, navigation, scroll, session, cleanup: [] }
  application.queries = createFeedQueries({ protocol: apds, refresh: () => session?.refresh?.(),
    subscribe: listener => session?.artifacts?.subscribe(listener) || (() => {}) })
  application.cleanup.push(() => application.queries.destroy())
  application.render = createRenderer({ root, application })
  application.feeds = createFeedController({ root, navigation, scroll, render: application.render })
  const settings = createSettings(application)
  application.cleanup.push(settings.destroy)
  application.router = createRouter({ ...settings,
    root, navigation, scroll, feeds: application.feeds, render: application.render, queries: application.queries,
    compose: (sig, options) => composer(sig, { ...options, application }),
    profileHeader: options => buildProfileHeader({ ...options, root, runExclusive: session?.runExclusive, session }),
  })
  let nav = await navbar(application)
  root.appendChild(nav)
  // Hash links remain real shareable links; only this root owns their UI action.
  const onClick = event => {
    const anchor = event.target.closest?.('a[href]')
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const href = anchor.getAttribute('href')
    const canonical = session?.policy?.canonicalURL + '/#'
    const route = href.startsWith('#') ? href.slice(1) : session?.policy && href.startsWith(canonical) ? href.slice(canonical.length) : null
    if (route === null) return
    event.preventDefault()
    void navigation.navigate(route)
  }
  root.addEventListener('click', onClick)
  let destroyed = false
  let disposal
  application.identityChanged = async () => {
    application.render.resetIdentity?.()
    nav.remove()
    nav = await navbar(application)
    root.prepend(nav)
    application.router.invalidate()
    await navigation.navigate(await import('apds').then(m => m.apds.pubkey()) || '')
  }
  application.navigate = (...args) => navigation.navigate(...args)
  application.start = () => application.router.route()
  application.destroy = () => {
    if (destroyed) return disposal
    destroyed = true
    disposal = (async () => {
      try {
        application.router.destroy()
        application.feeds.destroy()
        application.render.destroy()
        root.removeEventListener('click', onClick)
        for (const cleanup of [...application.cleanup]) await cleanup?.()
        application.cleanup.length = 0
        nav.remove()
      } finally { await session?.release() }
    })()
    return disposal
  }
  return application
}
