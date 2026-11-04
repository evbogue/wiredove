// Signed references and byte verification remain the host adapter's responsibility.
export const isLegacyImage = value => /^[A-Za-z0-9+/]{43}=$/.test(value || '');
export const safeImageURL = (value, { resolved = false } = {}) => {
  if (typeof value !== 'string') return null;
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return url.username || url.password ? null : url.href; } catch { return null; }
  }
  if (resolved && /^(?:blob:|data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,)/i.test(value)) return value;
  return null;
};
export const safeLinkURL = value => {
  if (isLegacyImage(value)) return '#' + value;
  if (/^\/#([A-Za-z0-9_-]{43})$/.test(value || '')) return value.slice(1);
  if (typeof value !== 'string') return null;
  if (/^#[^\s]*$/.test(value) || /^mailto:[^\s<>]+$/i.test(value)) return value;
  return safeImageURL(value);
};
export const resolveImageSource = async (item, resolveImage, signal, retry = false, mediaOptions = {}) => {
  if (signal?.aborted) return null;
  if (andfsImageMetadata(item.src)) {
    const verified = await verifiedImageSource(item.src, mediaOptions);
    return signal?.aborted ? null : verified;
  }
  const direct = safeImageURL(item.src);
  if (direct) return direct;
  if (!isLegacyImage(item.src) || !resolveImage) return null;
  const result = await resolveImage(item.src, { signal, retry });
  return signal?.aborted ? null : safeImageURL(result, { resolved: true });
};

import { andfsImageMetadata, readAndFSMedia } from '../andfs.js';
const cache = new Map();
export function imageMime(bytes) {
  if (bytes[0] === 137 && bytes[1] === 80) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
  if (bytes[0] === 71 && bytes[1] === 73) return 'image/gif';
  if (new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  throw new Error('Unsupported image bytes');
}
export async function readImageFile(reference, options = {}) {
  const meta = andfsImageMetadata(reference);
  if (!meta) throw new Error('No verified original photo is available');
  const bytes = await readAndFSMedia(meta, options);
  return new File([bytes], 'original-photo', { type: imageMime(bytes) });
}
export async function verifiedImageSource(reference, options = {}) {
  if (!andfsImageMetadata(reference)) return null;
  const key = JSON.stringify([reference, options.baseURL || null]);
  if (!cache.has(key)) {
    const result = readImageFile(reference, options).then(file => new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
    })).catch(error => { cache.delete(key); throw error; });
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, result);
  }
  return await cache.get(key);
}
