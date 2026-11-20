import { anbotWebsiteServices, startWebsiteApplication } from './client/runtime/website-application.js'

const hosted = location.hostname === 'bot.anproto.com'
await startWebsiteApplication(hosted ? { services: anbotWebsiteServices, network: false } : undefined)

if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('service worker registration failed', err)
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
