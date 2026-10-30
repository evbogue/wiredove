// AndFS v1: a file is an ordered list of content-addressed byte chunks.
export const SIZE = 262144
export const MAX_CHUNKS = 16384
export const MAX_MANIFEST = 1024 * 1024

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const bytesOf = (value) =>
  value instanceof Uint8Array ? value : new Uint8Array(value)
const base64 = (bytes) => {
  let value = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    value += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(value)
}

export async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', bytesOf(value))
  return base64(new Uint8Array(digest))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export const validHash = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

export function manifestBytes({ size, chunks }) {
  return textEncoder.encode(
    JSON.stringify({ andfs: 1, size, chunkSize: SIZE, chunks }),
  )
}

export function parseManifest(bytes) {
  if (bytes.length > MAX_MANIFEST) throw new Error('Manifest too large')
  let manifest
  try {
    manifest = JSON.parse(textDecoder.decode(bytes))
  } catch {
    throw new Error('Invalid manifest')
  }
  if (
    !manifest || manifest.andfs !== 1 || manifest.chunkSize !== SIZE ||
    !Number.isSafeInteger(manifest.size) || manifest.size < 0 ||
    !Array.isArray(manifest.chunks) || manifest.chunks.length > MAX_CHUNKS ||
    manifest.chunks.length !== Math.ceil(manifest.size / SIZE) ||
    !manifest.chunks.every(validHash)
  ) throw new Error('Invalid AndFS v1 manifest')
  return manifest
}

const checkAbort = (signal) => {
  if (signal?.aborted) {
    throw signal.reason || new DOMException('Aborted', 'AbortError')
  }
}

/** @param {{ store?: { get: Function, put: Function }, sources?: { get: Function }[], timeoutMs?: number }} [options] */
export function createAndFS({ store, sources = [], timeoutMs = 8000 } = {}) {
  if (!store?.get || !store?.put) throw new Error('AndFS requires a byte store')
  const blockStore = store

  /** @param {string} id @param {{ signal?: AbortSignal, maxBytes?: number }} [options] */
  async function getBlock(id, { signal, maxBytes = SIZE } = {}) {
    if (!validHash(id)) throw new Error('Invalid blob hash')
    checkAbort(signal)
    const verify = async (value) => {
      if (value === undefined || value === null) throw new Error('Missing blob')
      const bytes = bytesOf(value)
      if (bytes.length > maxBytes || await hash(bytes) !== id) {
        throw new Error('Blob failed verification: ' + id)
      }
      return bytes
    }
    try {
      return await verify(await blockStore.get(id))
    } catch {
      checkAbort(signal)
    }
    for (const source of sources) {
      checkAbort(signal)
      const controller = new AbortController()
      const abort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(
        () => controller.abort(new Error('Source timed out')),
        timeoutMs,
      )
      try {
        const bytes = await verify(
          await source.get(id, { signal: controller.signal, maxBytes }),
        )
        await blockStore.put(id, bytes)
        return bytes
      } catch {
        checkAbort(signal)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    }
    throw new Error('No verified source for blob: ' + id)
  }

  async function putBlock(bytes) {
    const value = bytesOf(bytes)
    const id = await hash(value)
    await blockStore.put(id, value)
    return id
  }

  /** @param {Blob | Uint8Array<ArrayBuffer> | ArrayBuffer | ReadableStream<Uint8Array<ArrayBuffer>>} input @param {{ signal?: AbortSignal, onProgress?: Function }} [options] */
  async function add(input, { signal, onProgress } = {}) {
    const stream = input instanceof Uint8Array || input instanceof ArrayBuffer
      ? new Blob([input]).stream()
      : input instanceof Blob
      ? input.stream()
      : input
    if (!stream?.getReader) {
      throw new Error('Expected a Blob, byte array, or ReadableStream')
    }
    const reader = stream.getReader()
    const chunks = []
    let buffer = new Uint8Array(SIZE)
    let used = 0
    let size = 0
    const flush = async () => {
      if (!used) return
      if (chunks.length >= MAX_CHUNKS) {
        throw new Error('File exceeds the 4 GiB limit')
      }
      chunks.push(await putBlock(buffer.subarray(0, used)))
      size += used
      onProgress?.({
        step: 'upload',
        index: chunks.length,
        total: Math.ceil(size / SIZE),
        bytes: size,
      })
      buffer = new Uint8Array(SIZE)
      used = 0
    }
    try {
      while (true) {
        checkAbort(signal)
        const { value, done } = await reader.read()
        if (done) break
        const bytes = bytesOf(value)
        for (let offset = 0; offset < bytes.length;) {
          const count = Math.min(SIZE - used, bytes.length - offset)
          buffer.set(bytes.subarray(offset, offset + count), used)
          used += count
          offset += count
          if (used === SIZE) await flush()
        }
      }
      await flush()
      const manifest = manifestBytes({ size, chunks })
      const manifestHash = await putBlock(manifest)
      return {
        manifestHash,
        manifestYaml: new TextDecoder().decode(manifest),
        manifest,
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  async function readManifest(id, options = {}) {
    if (typeof id === 'object') id = id?.manifestHash
    return parseManifest(
      await getBlock(id, { ...options, maxBytes: MAX_MANIFEST }),
    )
  }

  /** @param {string} id @param {{ start?: number, end?: number, signal?: AbortSignal, onProgress?: Function }} [options] */
  function read(id, { start = 0, end, signal, onProgress } = {}) {
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    let manifest, index, stop
    const cleanup = () => signal?.removeEventListener('abort', abort)
    return new ReadableStream({
      async pull(output) {
        try {
          checkAbort(controller.signal)
          if (!manifest) {
            manifest = await readManifest(id, { signal: controller.signal })
            stop = end ?? manifest.size
            if (
              !Number.isSafeInteger(start) || !Number.isSafeInteger(stop) ||
              start < 0 || start > stop || stop > manifest.size
            ) throw new Error('Invalid byte range')
            index = Math.floor(start / SIZE)
          }
          if (index * SIZE >= stop) {
            cleanup()
            output.close()
            return
          }
          const bytes = await getBlock(manifest.chunks[index], {
            signal: controller.signal,
          })
          const expected = Math.min(SIZE, manifest.size - index * SIZE)
          if (bytes.length !== expected) {
            throw new Error('Chunk length mismatch')
          }
          const low = Math.max(0, start - index * SIZE)
          const high = Math.min(bytes.length, stop - index * SIZE)
          output.enqueue(bytes.slice(low, high))
          onProgress?.({
            step: 'read',
            index: index + 1,
            total: manifest.chunks.length,
          })
          index++
        } catch (error) {
          cleanup()
          output.error(error)
        }
      },
      cancel() {
        controller.abort()
        cleanup()
      },
    })
  }

  async function get(input, options = {}) {
    const id = typeof input === 'string' ? input : input?.manifestHash
    if (!validHash(id)) throw new Error('Expected a manifest hash')
    const response = []
    const reader = read(id, options).getReader()
    let length = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        response.push(value)
        length += value.length
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of response) {
      bytes.set(part, offset)
      offset += part.length
    }
    return bytes
  }

  return { add, get, read, getBlock, manifest: readManifest, hash, putBlock }
}

// Compatibility adapter for APDS, which currently stores text values.
// deno-lint-ignore require-await -- Public compatibility API must remain async.
export async function apdsAndFS(apds) {
  const encode = base64
  const decode = (value) =>
    Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  return createAndFS({
    store: {
      get: async (id) => {
        const value = await apds.get(id)
        return value ? decode(value) : undefined
      },
      put: async (id, bytes) => {
        await apds.put(id, encode(bytes))
      },
    },
  })
}

let defaultFS
async function fs() {
  if (!defaultFS) {
    const { apds } = await import(
      'https://esm.sh/gh/evbogue/apds@e091911502c46feaff8f18ec9865c23f42a7dc40/apds.js'
    )
    await apds.start('andfs-v1')
    defaultFS = await apdsAndFS(apds)
  }
  return defaultFS
}
/** @param {*} file @param {Function} [onProgress] */
export const add = async (file, onProgress) =>
  (await fs()).add(file, { onProgress })
/** @param {*} manifest @param {Function} [onProgress] */
export const get = async (manifest, onProgress) =>
  (await fs()).get(manifest, { onProgress })
