import { startWebsiteApplication } from './client/runtime/website-application.js'

await startWebsiteApplication()

if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('service worker registration failed', err)
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
