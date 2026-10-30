import { createRouter } from '../../route.js'
import { createFeedController } from '../../adder.js'
import { createRenderer } from '../../render.js'
import { createSettings } from '../../settings.js'
import { composer } from '../../composer.js'
import { navbar } from '../../navbar.js'
import { buildProfileHeader } from '../../profile_header.js'

// UI ownership only. The caller still owns the APDS/transport session.
export const createApplication = async ({ root, navigation, scroll }) => {
  const application = { root, navigation, scroll, cleanup: [] }
  application.render = createRenderer({ root, application })
  application.feeds = createFeedController({ root, navigation, scroll, render: application.render })
  const settings = createSettings(application)
  application.cleanup.push(settings.destroy)
  application.router = createRouter({ ...settings,
    root, navigation, scroll, feeds: application.feeds, render: application.render,
    compose: (sig, options) => composer(sig, { ...options, application }),
    profileHeader: options => buildProfileHeader({ ...options, root }),
  })
  const nav = await navbar(application)
  root.appendChild(nav)
  // Hash links remain real shareable links; only this root owns their UI action.
  const onClick = event => {
    const anchor = event.target.closest?.('a[href^="#"]')
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void navigation.navigate(anchor.getAttribute('href').slice(1))
  }
  root.addEventListener('click', onClick)
  let destroyed = false
  application.navigate = (...args) => navigation.navigate(...args)
  application.start = () => application.router.route()
  application.destroy = () => {
    if (destroyed) return
    destroyed = true
    application.router.destroy()
    application.feeds.destroy()
    application.render.destroy()
    root.removeEventListener('click', onClick)
    for (const cleanup of [...application.cleanup]) cleanup?.()
    application.cleanup.length = 0
    nav.remove()
  }
  return application
}
