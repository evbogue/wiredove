import { createAndFS } from '../vendor/andfs/andfs.js';
import { memoryStore } from '../vendor/andfs/stores.js';

export const DEFAULT_MEDIA_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "video/mp4",
  "video/ogg",
  "video/webm",
]);

// Creates the exact signed upload metadata shared with evbogue.com's Timeline.
export function createAndFSMediaClient(
  {
    files,
    signPayload,
    fetchImpl = fetch,
    endpoint = "/api/media",
    origin = () => location.origin,
    allowedMime = DEFAULT_MEDIA_MIME,
    maxBytes = 32 * 1024 * 1024,
  },
) {
  if (!files?.add || !signPayload) {
    throw new Error("AndFS files and signing adapter are required");
  }
  return {
    async upload(input, { reply, replyto, onStatus } = {}) {
      if (Boolean(reply) !== Boolean(replyto)) throw new Error("A media reply requires both reply and replyto");
      const mime = (input.type || "").split(";")[0].toLowerCase();
      if (!allowedMime.has(mime)) {
        throw new Error("Unsupported image, audio, or video format");
      }
      if (!input.size || input.size > maxBytes) {
        throw new Error(
          `Media must be between 1 byte and ${maxBytes / 1024 / 1024} MiB`,
        );
      }
      onStatus?.("Preparing verified AndFS attachment…");
      const added = await files.add(input);
      const authorization = JSON.stringify({
        action: "andfs-upload-v1",
        andfs: added.manifestHash,
        mime,
        media_size: input.size,
        ...(reply ? { reply } : {}),
        ...(replyto ? { replyto } : {}),
      });
      onStatus?.("Uploading verified AndFS attachment…");
      const response = await fetchImpl(endpoint, {
        method: "POST",
        body: input,
        headers: {
          "X-ANProto-Content": authorization,
          "X-ANProto-Signature": await signPayload(authorization),
        },
      });
      if (!response.ok) {
        const detail = await response.text();
        let message = detail;
        try { message = JSON.parse(detail).error || detail; } catch {}
        throw new Error(message || `Upload failed (${response.status})`);
      }
      const saved = await response.json();
      if (saved.andfs !== added.manifestHash || saved.mime !== mime || saved.media_size !== input.size) {
        throw new Error("Upload server did not confirm the expected AndFS attachment");
      }
      onStatus?.("Ready to publish");
      const media_url = origin() + "/media/" + added.manifestHash;
      return {
        type: mime.split("/")[0],
        andfs: added.manifestHash,
        mime,
        media_name: input.name || `${mime.split("/")[0]}-${Date.now()}`,
        media_size: input.size,
        media_url,
        media_source: origin(),
      };
    },
  };
}

// Signed source URLs locate bytes; every manifest and chunk is authenticated by AndFS.
export function andfsSource(meta, baseURL = globalThis.location?.href) {
  const reference = meta.media_source || meta.media_url;
  if (!reference) throw new Error('AndFS media has no source');
  const url = new URL(reference, baseURL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsupported AndFS media source URL');
  }
  if (!meta.media_source) url.pathname = url.pathname.replace(/\/media\/[^/]+\/?$/, '') || '/';
  url.search = ''; url.hash = '';
  return url.href.replace(/\/$/, '');
}

export async function readAndFSMedia(meta, { store = memoryStore(), fetchImpl = fetch, signal, baseURL, maxBytes = 32 * 1024 * 1024 } = {}) {
  const source = andfsSource(meta, baseURL);
  const files = createAndFS({ store, sources: [{
    async get(id, { signal, maxBytes }) {
      const response = await fetchImpl(`${source}/blobs/${id}`, { signal });
      if (!response.ok) throw new Error(`AndFS source returned HTTP ${response.status}`);
      // Bound untrusted network responses before passing them to the verifier.
      const reader = response.body.getReader();
      const parts = []; let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > maxBytes) throw new Error('AndFS block exceeds size limit');
          parts.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      return bytes;
    }
  }] });
  const manifest = await files.manifest(meta.andfs, { signal });
  if (manifest.size > maxBytes) throw new Error('AndFS media exceeds playback size limit');
  if (meta.media_size !== undefined && manifest.size !== meta.media_size) {
    throw new Error('AndFS size does not match signed metadata');
  }
  return await files.get(meta.andfs, { signal });
}

// Inline image URLs are inside the signed Markdown body. Their path authenticates
// the manifest and identifies the replaceable source, including nested host paths.
export function andfsImageMetadata(reference, baseURL = globalThis.location?.href) {
  try {
    const url = new URL(reference, baseURL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const match = /^(.*)\/media\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
    if (!match) return null;
    return { type: 'image', andfs: match[2], media_url: url.href, media_source: url.origin + match[1] };
  } catch { return null; }
}
