import { registerMediaDisposer } from './media-render.js';
import { getBlob, HttpBlobStore, IndexedDBBlobStore, putBlob } from '../../anproto_blob.js';

let cache;
// Historical IDs retain their original anblob verifier and cache. Transport is
// explicit for embeds; a signed media_source takes precedence over the adapter.
export async function readLegacyMedia(metadata, { source = globalThis.location?.origin } = {}) {
  cache ||= new IndexedDBBlobStore('wiredove-media-v1');
  try { return await getBlob(metadata.blob, cache); } catch {}
  const url = new URL(metadata.media_source || source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Unsafe legacy media source');
  const bytes = await getBlob(metadata.blob, new HttpBlobStore(url.href.replace(/\/$/, '') + '/blobs'));
  if (await putBlob(bytes, cache) !== metadata.blob) throw Error('Legacy media identity changed');
  return bytes;
}

export function renderLegacyMedia(metadata, container, options = {}) {
  if (metadata?.andfs || !metadata?.blob || !['audio', 'video'].includes(metadata.type)) return false;
  const doc = container.ownerDocument;
  const wrap = doc.createElement('div'); wrap.className = 'media-post';
  const status = doc.createElement('div'); status.className = 'media-status'; status.setAttribute('role', 'status');
  const player = doc.createElement(metadata.type); player.className = 'media-player';
  player.controls = true; player.preload = 'none'; player.playsInline = true;
  const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry media'; retry.hidden = true;
  wrap.append(status, player, retry); container.append(wrap);
  let objectURL, observer, loading = false, disposed = false;
  const load = async () => {
    if (loading || disposed || objectURL) return;
    loading = true; retry.hidden = true; status.textContent = 'Loading verified legacy media…';
    try {
      const bytes = await readLegacyMedia(metadata, options);
      if (disposed) return;
      objectURL = URL.createObjectURL(new Blob([bytes], { type: metadata.mime || '' }));
      player.src = objectURL; wrap.dataset.verified = 'true'; status.textContent = 'Verified legacy ANProto blob';
      observer?.disconnect();
    } catch {
      if (!disposed) { status.textContent = 'Media unavailable. Please retry.'; retry.hidden = false; }
    } finally { loading = false; }
  };
  status.textContent = 'Media will load when visible';
  retry.addEventListener('click', load);
  if (typeof IntersectionObserver === 'undefined') void load();
  else { observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { rootMargin: '300px' }); observer.observe(wrap); }
  player.addEventListener('error', () => { if (objectURL) status.textContent = 'Verified media; this browser could not play the format.'; });
  const dispose = () => { disposed = true; observer?.disconnect(); player.removeAttribute('src'); if (objectURL) URL.revokeObjectURL(objectURL); };
  registerMediaDisposer(wrap, dispose);
  return dispose;
}
