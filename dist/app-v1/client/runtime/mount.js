import { acquireDefaultSession } from './default-session.js'
import { composer } from '../../composer.js'
import { apds } from 'https://esm.sh/gh/evbogue/apds@4934fac/apds.js'
import { send } from '../../send.js'
import { createApplication } from './application.js'
import { createNavigation } from './application-context.js'
import { createImagePopover } from '../ui/image-popover.js'

const fontLoads = new WeakMap()
const iconFontURL = new URL('../../vendor/material-symbols/outlined-v382.ttf', import.meta.url).href
const loadIcons = doc => {
  if (!fontLoads.has(doc)) {
    const face = new FontFace('Wiredove Symbols', `url(${iconFontURL})`)
    doc.fonts.add(face)
    fontLoads.set(doc, face.load().catch(() => { doc.fonts.delete(face) }))
  }
  return fontLoads.get(doc)
}

const mounted = new WeakSet()
const owned = new WeakSet()
const stylesheet = new URL('../application.css', import.meta.url).href

// Both frames use the same default services; advanced internal callers may
// supply an already acquired compatible session lease.
export const mountApplication = async (host, { session, navigation, initialRoute = '', layout = 'embedded', ...services } = {}) => {
  if (!host || mounted.has(host) || (host.shadowRoot && !owned.has(host))) throw new Error('Wiredove requires an unused mount element')
  mounted.add(host)
  try { session ||= await acquireDefaultSession(services) }
  catch (error) { mounted.delete(host); throw error }
  navigation ||= createNavigation(initialRoute)
  let shadow
  try { shadow = host.shadowRoot || host.attachShadow({ mode: 'open' }) }
  catch (error) { mounted.delete(host); await session.release?.(); throw error }
  owned.add(host)
  const doc = host.ownerDocument
  const style = doc.createElement('link')
  style.rel = 'stylesheet'; style.href = stylesheet
  const ready = new Promise((resolve, reject) => {
    style.onload = resolve
    style.onerror = () => reject(new Error('Wiredove stylesheet could not load'))
  })
  const root = doc.createElement('section')
  root.className = 'wiredove-application'
  root.setAttribute('aria-label', 'Wiredove')
  if (layout === 'page') root.classList.add('wiredove-page')
  const fonts = doc.createElement('link')
  fonts.rel = 'stylesheet'
  fonts.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&family=Source+Sans+3:wght@400;600;700&display=swap'
  shadow.append(style, fonts, root)
  const scroll = { get: () => root.scrollTop, to: value => root.scrollTo(value),
    target: root, observerRoot: root, height: () => root.clientHeight }
  let app
  try {
    await loadIcons(doc)
    await ready
    app = await createApplication({ root, navigation, scroll, session })
    const viewer = createImagePopover({ document: doc, root: shadow, delegateRoot: root,
      getImage: hash => apds.get(hash), requestImage: send })
    app.cleanup.push(() => viewer.dispose())
    if (session.subscribeRenderer) app.cleanup.push(session.subscribeRenderer(app.render))
    app.draftScope = host.id || layout
    await app.start()
    if (session.artifacts?.error) app.feeds.status('Backend unavailable. Showing locally verified content. ' + session.artifacts.error, { sticky: true })
    if (session.artifacts) {
      try {
        const resume = localStorage.getItem(`wiredove-composer-open:${await apds.pubkey() || 'anon'}:${app.draftScope}`)
        if (resume) { const draft = JSON.parse(resume); root.append(await composer(draft.sig, { ...draft, application: app })) }
      } catch (error) { app.feeds.status('Could not restore the open draft: ' + error.message) }
    }
    const destroy = app.destroy
    let disposal
    app.destroy = () => disposal ||= (async () => {
      try { await destroy() }
      finally { shadow.replaceChildren(); mounted.delete(host) }
    })()
    return app
  } catch (error) {
    if (app) await app.destroy()
    else await session.release?.()
    shadow.replaceChildren()
    mounted.delete(host)
    throw error
  }
}
