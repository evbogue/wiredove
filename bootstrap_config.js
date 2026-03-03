export const getBootstrapConfig = () => {
  const params = new URLSearchParams(window.location.search)
  const apdsUrl = params.get('apds') || 'wss://pub.wiredove.net/'
  const room = params.get('room') || 'wiredovev1'
  const seed = params.get('seed') || 'evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k='
  const disableRoom = params.get('disableRoom') === '1'
  const localApds = params.get('localApds') === '1'

  return { apdsUrl, room, seed, disableRoom, localApds }
}

export const getRemoteApdsBase = () => {
  const { apdsUrl } = getBootstrapConfig()
  return apdsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
}

export const feedRowsEnabled = () => {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('feedRows') === '1') { return true }
    return localStorage.getItem('wiredove.feedRows') === '1'
  } catch (_err) {
    return false
  }
}
