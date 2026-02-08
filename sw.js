self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE)
    await cache.addAll(APP_SHELL_ASSETS)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith('wiredove-') && key !== APP_SHELL_CACHE)
        .map((key) => caches.delete(key))
    )
    await self.clients.claim()
  })())
})

const CACHE_VERSION = 'v1'
const APP_SHELL_CACHE = `wiredove-app-shell-${CACHE_VERSION}`
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/favicon.ico',
  '/dovepurple_sm.png',
  '/dovepurple.png',
  '/dove_sm.png',
]

const isCacheableRequest = (request) => {
  if (!request || request.method !== 'GET') { return false }
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) { return false }
  return true
}

const isNavigationRequest = (request) => request.mode === 'navigate'

const isStaticAssetRequest = (request) => {
  const url = new URL(request.url)
  return /\.(?:js|css|png|jpg|jpeg|svg|ico|webmanifest|json)$/i.test(url.pathname)
}

const canCacheResponse = (response) => Boolean(response && response.ok)

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(APP_SHELL_CACHE)
  const cached = await cache.match(request)
  const networkPromise = fetch(request).then(async (response) => {
    if (canCacheResponse(response)) {
      await cache.put(request, response.clone())
    }
    return response
  }).catch(() => null)
  if (cached) {
    void networkPromise
    return cached
  }
  const fresh = await networkPromise
  if (fresh) { return fresh }
  return Response.error()
}

const networkFirst = async (request) => {
  const cache = await caches.open(APP_SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (canCacheResponse(response)) {
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) { return cached }
    if (isNavigationRequest(request)) {
      const fallback = await cache.match('/index.html')
      if (fallback) { return fallback }
    }
    return Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (!isCacheableRequest(request)) { return }
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request))
    return
  }
  if (isStaticAssetRequest(request)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

self.addEventListener('push', (event) => {
  let payload = { title: 'wiredove', body: 'New message', url: '/' }
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      try {
        payload = JSON.parse(event.data.text())
      } catch {
        payload.body = event.data.text()
      }
    }
  }

  const hash = payload.hash
  const targetUrl = payload.url ||
    (typeof hash === 'string' && hash.length > 0
      ? `https://wiredove.net/#${hash}`
      : '/')
  const options = {
    body: payload.body,
    data: { url: targetUrl },
    icon: payload.icon || '/dovepurple_sm.png',
    badge: payload.badge,
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
