import { andfsImageMetadata, readAndFSMedia } from '../andfs.js';
const cache = new Map();
export function imageMime(bytes) {
  if (bytes[0] === 137 && bytes[1] === 80) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
  if (bytes[0] === 71 && bytes[1] === 73) return 'image/gif';
  if (new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  throw new Error('Unsupported image bytes');
}
export async function readImageFile(reference) {
  const meta = andfsImageMetadata(reference);
  if (!meta) throw new Error('No verified original photo is available');
  const bytes = await readAndFSMedia(meta);
  return new File([bytes], 'original-photo', { type: imageMime(bytes) });
}
export async function verifiedImageSource(reference) {
  if (!andfsImageMetadata(reference)) return null;
  if (!cache.has(reference)) {
    const result = readImageFile(reference).then(file => new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
    })).catch(error => { cache.delete(reference); throw error; });
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(reference, result);
  }
  return await cache.get(reference);
}
