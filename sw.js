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
