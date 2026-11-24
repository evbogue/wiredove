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
      if (location.hash === '#feed') history.replaceState(history.state, '', '#')
      setHash(location.hash.slice(1))
    }
    if (location.hash === '#feed') update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return hash
}
