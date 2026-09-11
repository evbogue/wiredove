// Vendored from evbogue/ANProto blob.js at commit 01284a213d54e5a802228eafa64f8d95c4db2f67
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const CHUNK_SIZE = 1024 * 1024;
const RAW_PREFIX = "anblob:v1:raw:sha256:";
const CHUNKED_PREFIX = "anblob:v1:chunked:sha256:";

async function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (typeof input === "string") return encoder.encode(input);
  throw new TypeError("blob input must be a string, Blob, ArrayBuffer, or Uint8Array");
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function digest(bytes) {
  return base64url(await sha256(bytes));
}

function rawId(hash) {
  return RAW_PREFIX + hash;
}

function chunkedId(hash) {
  return CHUNKED_PREFIX + hash;
}

function isRaw(id) {
  return id.startsWith(RAW_PREFIX);
}

function isChunked(id) {
  return id.startsWith(CHUNKED_PREFIX);
}

function expectedHash(id) {
  if (isRaw(id)) return id.slice(RAW_PREFIX.length);
  if (isChunked(id)) return id.slice(CHUNKED_PREFIX.length);
  throw new TypeError("invalid ANProto blob id");
}

async function rawRef(bytes) {
  return rawId(await digest(bytes));
}

async function makeManifest(bytes) {
  const chunks = [];

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
    chunks.push({
      id: await rawRef(chunk),
      size: chunk.length,
    });
  }

  return {
    v: 1,
    type: "anproto/blob-manifest",
    size: bytes.length,
    chunkSize: CHUNK_SIZE,
    chunks,
  };
}

function manifestBytes(manifest) {
  // Property insertion order above is the v1 canonical representation.
  return encoder.encode(JSON.stringify(manifest));
}

async function refForBytes(bytes) {
  if (bytes.length <= CHUNK_SIZE) return await rawRef(bytes);
  const manifest = await makeManifest(bytes);
  return chunkedId(await digest(manifestBytes(manifest)));
}

export class MemoryBlobStore {
  #records = new Map();

  async put(id, bytes) {
    this.#records.set(id, new Uint8Array(bytes));
  }

  async get(id) {
    const bytes = this.#records.get(id);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async has(id) {
    return this.#records.has(id);
  }

  get size() {
    return this.#records.size;
  }
}

export class HttpBlobStore {
  constructor(baseUrl, { fetchImpl = fetch } = {}) {
    if (!baseUrl) throw new TypeError("HttpBlobStore requires a base URL");
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  #url(id) {
    return this.baseUrl + "/" + encodeURIComponent(id);
  }

  async put(id, bytes) {
    const response = await this.fetch(this.#url(id), {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: bytes,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} storing ${id}`);
    }
  }

  async get(id) {
    const response = await this.fetch(this.#url(id));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${id}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async has(id) {
    const response = await this.fetch(this.#url(id), { method: "HEAD" });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} checking ${id}`);
    }
    return true;
  }
}

export class IndexedDBBlobStore {
  #db;

  constructor(name = "anproto-blobs") {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available in this environment");
    }

    this.#db = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("blobs")) {
          request.result.createObjectStore("blobs");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async #request(mode, action) {
    const db = await this.#db;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", mode);
      const store = tx.objectStore("blobs");
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(id, bytes) {
    const copy = new Uint8Array(bytes);
    await this.#request("readwrite", (store) => store.put(copy, id));
  }

  async get(id) {
    const value = await this.#request("readonly", (store) => store.get(id));
    return value ? new Uint8Array(value) : null;
  }

  async has(id) {
    const key = await this.#request("readonly", (store) => store.getKey(id));
    return key !== undefined;
  }
}

/**
 * Store bytes and return their portable, content-addressed ANProto blob id.
 *
 * Small values are stored directly. Values larger than 1 MiB are split into
 * fixed 1 MiB chunks and represented by a deterministic manifest.
 */
export async function putBlob(input, store) {
  if (!store?.put) throw new TypeError("putBlob requires a blob store");

  const bytes = await toBytes(input);

  if (bytes.length <= CHUNK_SIZE) {
    const id = await rawRef(bytes);
    if (!(await store.has?.(id))) await store.put(id, bytes);
    return id;
  }

  const manifest = await makeManifest(bytes);

  for (let i = 0, offset = 0; i < manifest.chunks.length; i++, offset += CHUNK_SIZE) {
    const chunkMeta = manifest.chunks[i];
    if (await store.has?.(chunkMeta.id)) continue;
    const chunk = bytes.slice(offset, offset + chunkMeta.size);
    await store.put(chunkMeta.id, chunk);
  }

  const encoded = manifestBytes(manifest);
  const id = chunkedId(await digest(encoded));
  if (!(await store.has?.(id))) await store.put(id, encoded);
  return id;
}

/**
 * Retrieve and verify a blob from any store implementing get(id).
 */
export async function getBlob(id, store) {
  if (!store?.get) throw new TypeError("getBlob requires a blob store");

  const root = await store.get(id);
  if (!root) throw new Error(`blob not found: ${id}`);

  if (isRaw(id)) {
    if (!(await verifyRaw(id, root))) throw new Error(`blob failed verification: ${id}`);
    return root;
  }

  if (!isChunked(id)) throw new TypeError("invalid ANProto blob id");

  if (await digest(root) !== expectedHash(id)) {
    throw new Error(`manifest failed verification: ${id}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(root));
  } catch {
    throw new Error("invalid blob manifest");
  }

  validateManifest(manifest);

  const parts = [];
  let total = 0;

  for (const chunk of manifest.chunks) {
    const bytes = await store.get(chunk.id);
    if (!bytes) throw new Error(`blob chunk not found: ${chunk.id}`);
    if (bytes.length !== chunk.size || !(await verifyRaw(chunk.id, bytes))) {
      throw new Error(`blob chunk failed verification: ${chunk.id}`);
    }
    parts.push(bytes);
    total += bytes.length;
  }

  if (total !== manifest.size) throw new Error("blob size does not match manifest");

  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

/**
 * Fetch a blob from multiple independent sources.
 *
 * Each source may be:
 * - an object implementing async get(id)
 * - an async function (id) => bytes | null
 * - an HTTP base URL serving blobs at <base>/<encoded blob id>
 *
 * For chunked blobs, each chunk gets an independently shuffled source order.
 * Failed, missing, or corrupt copies are skipped automatically.
 */
export async function downloadBlob(
  id,
  sources,
  {
    concurrency = 4,
    store = null,
    random = Math.random,
    onChunk = null,
  } = {},
) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new TypeError("downloadBlob requires at least one source");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }

  const rootResult = await fetchVerified(id, sources, random);
  const root = rootResult.bytes;

  if (store?.put) await store.put(id, root);

  if (isRaw(id)) return root;
  if (!isChunked(id)) throw new TypeError("invalid ANProto blob id");

  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(root));
  } catch {
    throw new Error("invalid blob manifest");
  }
  validateManifest(manifest);

  const parts = new Array(manifest.chunks.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= manifest.chunks.length) return;

      const chunk = manifest.chunks[index];
      let bytes = null;
      let source = "cache";

      if (store?.get) {
        const cached = await store.get(chunk.id);
        if (
          cached &&
          cached.length === chunk.size &&
          await verifyRaw(chunk.id, cached)
        ) {
          bytes = cached;
        }
      }

      if (!bytes) {
        const fetched = await fetchVerified(chunk.id, sources, random);
        bytes = fetched.bytes;
        source = fetched.source;
        if (bytes.length !== chunk.size) {
          throw new Error(`blob chunk has wrong size: ${chunk.id}`);
        }
        if (store?.put) await store.put(chunk.id, bytes);
      }

      parts[index] = bytes;
      if (onChunk) {
        await onChunk({
          index,
          total: manifest.chunks.length,
          id: chunk.id,
          size: chunk.size,
          source,
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, manifest.chunks.length) },
    () => worker(),
  );
  await Promise.all(workers);

  const output = new Uint8Array(manifest.size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  if (!(await verifyBlob(id, output))) {
    throw new Error(`downloaded blob failed final verification: ${id}`);
  }

  return output;
}

/**
 * Return a browser/server ReadableStream of verified bytes.
 *
 * Chunked blobs begin yielding data as soon as each ordered chunk verifies,
 * so callers can pipe the stream to a file, Response, or MediaSource adapter.
 */
export function streamBlob(
  id,
  sources,
  {
    store = null,
    random = Math.random,
    onChunk = null,
  } = {},
) {
  return new ReadableStream({
    async start(controller) {
      try {
        const rootResult = await fetchVerified(id, sources, random);
        const root = rootResult.bytes;
        if (store?.put) await store.put(id, root);

        if (isRaw(id)) {
          controller.enqueue(root);
          controller.close();
          return;
        }

        if (!isChunked(id)) throw new TypeError("invalid ANProto blob id");

        const manifest = JSON.parse(decoder.decode(root));
        validateManifest(manifest);

        for (let index = 0; index < manifest.chunks.length; index++) {
          const chunk = manifest.chunks[index];
          let bytes = null;
          let source = "cache";

          if (store?.get) {
            const cached = await store.get(chunk.id);
            if (
              cached &&
              cached.length === chunk.size &&
              await verifyRaw(chunk.id, cached)
            ) {
              bytes = cached;
            }
          }

          if (!bytes) {
            const fetched = await fetchVerified(chunk.id, sources, random);
            bytes = fetched.bytes;
            source = fetched.source;
            if (bytes.length !== chunk.size) {
              throw new Error(`blob chunk has wrong size: ${chunk.id}`);
            }
            if (store?.put) await store.put(chunk.id, bytes);
          }

          if (onChunk) {
            await onChunk({
              index,
              total: manifest.chunks.length,
              id: chunk.id,
              size: chunk.size,
              source,
            });
          }

          controller.enqueue(bytes);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function fetchVerified(id, sources, random) {
  const shuffled = [...sources];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const failures = [];

  for (const source of shuffled) {
    try {
      const bytes = await readFromSource(source, id);
      if (!bytes) {
        failures.push("missing");
        continue;
      }

      const normalized = await toBytes(bytes);

      if (isRaw(id)) {
        if (await verifyRaw(id, normalized)) return { bytes: normalized, source: sourceName(source) };
        failures.push("corrupt");
        continue;
      }

      if (isChunked(id)) {
        if (await digest(normalized) === expectedHash(id)) return { bytes: normalized, source: sourceName(source) };
        failures.push("corrupt");
        continue;
      }

      throw new TypeError("invalid ANProto blob id");
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }

  throw new Error(
    `could not fetch verified blob ${id} from any source: ${failures.join(", ")}`,
  );
}

function sourceName(source) {
  if (typeof source === "string") return source;
  if (typeof source === "function") return source.name || "function";
  return source?.name || source?.constructor?.name || "store";
}

async function readFromSource(source, id) {
  if (typeof source === "function") return await source(id);

  if (typeof source === "string") {
    const url = source.replace(/\/$/, "") + "/" + encodeURIComponent(id);
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  if (source?.get) return await source.get(id);

  throw new TypeError("blob source must be a get(id) store, function, or base URL");
}

/**
 * Verify bytes against an ANProto blob id without trusting the transport.
 */
export async function verifyBlob(id, input) {
  const bytes = await toBytes(input);
  return (await refForBytes(bytes)) === id;
}

async function verifyRaw(id, bytes) {
  return isRaw(id) && rawId(await digest(bytes)) === id;
}

function validateManifest(manifest) {
  if (
    manifest?.v !== 1 ||
    manifest?.type !== "anproto/blob-manifest" ||
    manifest?.chunkSize !== CHUNK_SIZE ||
    !Number.isSafeInteger(manifest?.size) ||
    manifest.size < 0 ||
    !Array.isArray(manifest?.chunks)
  ) {
    throw new Error("invalid blob manifest");
  }

  let size = 0;
  for (const chunk of manifest.chunks) {
    if (
      !chunk ||
      !isRaw(chunk.id) ||
      !Number.isSafeInteger(chunk.size) ||
      chunk.size < 1 ||
      chunk.size > CHUNK_SIZE
    ) {
      throw new Error("invalid blob chunk");
    }
    size += chunk.size;
  }

  if (size !== manifest.size) throw new Error("invalid blob manifest size");
}

/**
 * Useful when building an ANProto artifact that points at media.
 */
export function mediaArtifact({ blob, mime, name = "", kind, ...extra }) {
  if (!blob || (!isRaw(blob) && !isChunked(blob))) {
    throw new TypeError("mediaArtifact requires an ANProto blob id");
  }

  const inferred = kind || (mime?.startsWith("audio/") ? "audio" : mime?.startsWith("video/") ? "video" : "file");

  return {
    type: inferred,
    blob,
    ...(mime ? { mime } : {}),
    ...(name ? { name } : {}),
    ...extra,
  };
}
