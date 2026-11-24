const resetKey = 'wiredove-shadcn:reset-requested'
const modes = ['archive', 'hosted']
const databases = [
  ...modes.flatMap(mode => [
    'wiredove-shadcn-preview-' + mode,
    'wiredove-shadcn-preview-' + mode + ':application',
    'wiredove-shadcn-preview-' + mode + ':feed',
    'wiredove-shadcn-peer-records-' + mode,
  ]),
  'wiredove-shadcn-legacy-media',
]

export function resetRequested() {
  try { return sessionStorage.getItem(resetKey) === 'yes' }
  catch { return false }
}

export function requestPreviewReset() {
  sessionStorage.setItem(resetKey, 'yes')
  location.reload()
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = resolve
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other Wiredove preview tabs, then retry.'))
  })
}

export async function resetPreview() {
  const results = await Promise.allSettled(databases.map(deleteDatabase))
  const failed = results.find(result => result.status === 'rejected')
  if (failed) throw failed.reason
  if ('caches' in globalThis) {
    await Promise.all(modes.map(mode => caches.delete('wiredove-shadcn-preview-' + mode)))
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('wiredove-shadcn:')) localStorage.removeItem(key)
  }
  sessionStorage.removeItem(resetKey)
  history.replaceState(history.state, '', '#')
  location.reload()
}
