import { validHash } from './andfs.js'

export function memoryStore() {
  const blocks = new Map()
  return {
    // deno-lint-ignore require-await -- Preserve promise returns and rejection semantics.
    get: async (id) => blocks.get(id)?.slice(),
    // deno-lint-ignore require-await -- Preserve promise returns and rejection semantics.
    put: async (id, bytes) => {
      blocks.set(id, bytes.slice())
    },
    // deno-lint-ignore require-await -- Preserve promise returns and rejection semantics.
    has: async (id) => blocks.has(id),
  }
}

export async function browserStore(name = 'andfs-v1') {
  /** @type {IDBDatabase} */
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('blocks')
      request.result.createObjectStore('pins')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const transaction = (table, mode, operation) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(table, mode)
      const request = operation(tx.objectStore(table))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = tx.onerror = () =>
        reject(tx.error || new Error('Storage transaction failed'))
    })
  return {
    get: (id) => transaction('blocks', 'readonly', (store) => store.get(id)),
    put: (id, bytes) =>
      transaction('blocks', 'readwrite', (store) => store.put(bytes, id)),
    pin: (id) =>
      transaction('pins', 'readwrite', (store) => store.put(true, id)),
    saved: () => transaction('pins', 'readonly', (store) => store.getAllKeys()),
    close: () => db.close(),
  }
}

export async function diskStore(directory) {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const blocks = path.join(directory, 'blocks')
  await fs.mkdir(blocks, { recursive: true })
  const file = (id) => {
    if (!validHash(id)) throw new Error('Invalid hash')
    return path.join(blocks, id)
  }
  return {
    async get(id) {
      try {
        return new Uint8Array(await fs.readFile(file(id)))
      } catch (error) {
        if (error.code === 'ENOENT') return undefined
        throw error
      }
    },
    async put(id, bytes) {
      const target = file(id)
      const temporary = target + '.' + crypto.randomUUID()
      try {
        await fs.writeFile(temporary, bytes)
        await fs.rename(temporary, target)
      } finally {
        await fs.unlink(temporary).catch(() => {})
      }
    },
  }
}
