const entryURL = new URL(location.href)
const sharedEntry = entryURL.searchParams.get('enter') === 'shared'
if (sharedEntry) {
  entryURL.searchParams.delete('enter')
  entryURL.searchParams.delete('back')
  history.replaceState(null, '', entryURL)
}
let initialRecords = []
if (sharedEntry && /^#[A-Za-z0-9+/]{43}=$/.test(location.hash)) {
  const id = location.hash.slice(1, -1).replace(/\+/g, '-').replace(/\//g, '_')
  try {
    const response = await fetch('/api/public-record?id=' + id, { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      const { records } = await response.json()
      if (Array.isArray(records) && records.length <= 15) initialRecords = records
    }
  } catch { /* The app can still resolve the ID through its normal sync. */ }
}
const { anbotWebsiteServices, startWebsiteApplication } = await import('./client/runtime/website-application.js')
const hosted = location.hostname === 'bot.anproto.com'
await startWebsiteApplication({
  services: { ...(hosted ? anbotWebsiteServices : {}), initialRecords },
  network: !hosted,
})

if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('service worker registration failed', err)
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
