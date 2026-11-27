self.addEventListener('push', event => {
  const post = event.data?.json()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(post?.hash) || !(post.expiresAt > Date.now())) return
  event.waitUntil(self.registration.showNotification(post.title, {
    vibrate: [200],
    body: post.body, tag: post.hash, data: { hash: post.hash },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(self.registration.scope)
  url.hash = event.notification.data.hash
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window' })
    const tab = windows.find(client => client.url === url.href) || windows[0]
    if (tab && (tab.url === url.href || await tab.navigate(url.href))) return tab.focus()
    return self.clients.openWindow(url.href)
  })())
})
