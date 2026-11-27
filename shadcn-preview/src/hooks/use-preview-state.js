import { useEffect, useState } from 'react'

export function usePreference(key, fallback) {
  const storageKey = 'wiredove-shadcn:' + key
  const [value, setValue] = useState(() => localStorage.getItem(storageKey) ?? fallback)
  useEffect(() => localStorage.setItem(storageKey, value), [storageKey, value])
  return [value, setValue]
}

export function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1))
  useEffect(() => {
    const update = () => {
      const hash = location.hash
      if (hash === '#feed' || hash === '#workspace/') history.replaceState(history.state, '', '#')
      else if (hash.startsWith('#workspace/git/')) history.replaceState(history.state, '', '#' + hash.slice(11))
      setHash(location.hash.slice(1))
    }
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return hash
}
