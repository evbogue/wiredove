// DOM and navigation dependencies are owned by the caller, never selected by
// whichever application happened to render most recently.
export const scopeDocument = (root) => {
  const owner = root.ownerDocument || root
  return {
    body: root,
    documentElement: owner.documentElement,
    scrollingElement: owner.scrollingElement,
    get activeElement() { return root.activeElement || root.getRootNode?.().activeElement || owner.activeElement },
    getElementById: id => owner.defaultView?.CSS?.escape
      ? root.querySelector('#' + owner.defaultView.CSS.escape(id))
      : Array.from(root.querySelectorAll('[id]')).find(node => node.id === id) || null,
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: (...args) => owner.createElement(...args),
    createTextNode: (...args) => owner.createTextNode(...args),
    createDocumentFragment: () => owner.createDocumentFragment(),
  }
}

export const createNavigation = (initial = '') => {
  let current = initial
  const listeners = new Set()
  return {
    get: () => current,
    async navigate(value) {
      current = value === '?' ? '' : value
      await Promise.all([...listeners].map(listener => listener(current)))
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}

export const createWindowNavigation = (view) => ({
  get: () => view.location.hash.slice(1),
  navigate(value, { replace = false } = {}) {
    if (replace) {
      view.history.replaceState(null, '', '#' + value)
      view.dispatchEvent(new view.HashChangeEvent('hashchange'))
    } else view.location.hash = value
  },
  subscribe(listener) {
    const handler = () => { void Promise.resolve(listener()).catch(error => console.error('route failed', error)) }
    view.addEventListener('hashchange', handler)
    return () => view.removeEventListener('hashchange', handler)
  },
})

export const createWindowScroll = (view) => ({
  get: () => view.scrollY || 0,
  to: value => view.scrollTo(value),
  target: view,
  observerRoot: null,
  height: () => view.innerHeight,
})
