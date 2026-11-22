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
    const update = () => setHash(location.hash.slice(1))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return hash
}
