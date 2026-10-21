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
  if (typeof value !== 'string') return null;
  if (/^#[^\s]*$/.test(value) || /^mailto:[^\s<>]+$/i.test(value)) return value;
  return safeImageURL(value);
};
export const resolveImageSource = async (item, resolveImage, signal, retry = false) => {
  if (signal?.aborted) return null;
  const direct = safeImageURL(item.src);
  if (direct) return direct;
  if (!isLegacyImage(item.src) || !resolveImage) return null;
  const result = await resolveImage(item.src, { signal, retry });
  return signal?.aborted ? null : safeImageURL(result, { resolved: true });
};
