import { apds } from 'apds'
import { send } from '../../send.js'
import { createApplication } from './application.js'
import { createNavigation } from './application-context.js'
import { createImagePopover } from '../ui/image-popover.js'

const fontLoads = new WeakMap()
const iconFontURL = 'https://fonts.gstatic.com/s/materialsymbolsoutlined/v382/kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHOem.ttf'
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

// Session selection is explicit at this boundary. The website supplies its shared
// session; a host must currently supply a compatible initialized APDS session.
export const mountApplication = async (host, { session, navigation = createNavigation(''), layout = 'embedded' } = {}) => {
  if (!host || mounted.has(host) || (host.shadowRoot && !owned.has(host))) throw new Error('Wiredove requires an unused mount element')
  if (!session) throw new Error('A compatible service-session lease is required')
  mounted.add(host)
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
    void loadIcons(doc)
    await ready
    app = await createApplication({ root, navigation, scroll, session })
    const viewer = createImagePopover({ document: doc, root: shadow, delegateRoot: root,
      getImage: hash => apds.get(hash), requestImage: send })
    app.cleanup.push(() => viewer.dispose())
    await app.start()
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
