import { startWebsiteApplication } from './client/runtime/website-application.js'

await startWebsiteApplication()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('service worker registration failed', err)
    })
  }, { once: true })
}
