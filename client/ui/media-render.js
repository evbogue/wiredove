import { andfsSource, readAndFSMedia } from '../andfs.js';

const disposers = new WeakMap();
export function disposeMedia(container) {
  for (const wrap of container.querySelectorAll('.media-post')) disposers.get(wrap)?.();
}

// One AndFS attachment renderer for website messages and public widgets.
// Playback receives a local object URL only after all blocks pass verification.
export const renderAndFSMedia = (yaml, container, options = {}) => {
  if (!yaml?.andfs || !['image', 'audio', 'video'].includes(yaml.type)) return false;
  const wrap = document.createElement('div');
  wrap.className = 'media-post';
  const status = document.createElement('div');
  status.className = 'media-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Media will load when visible';
  const player = document.createElement(yaml.type === 'image' ? 'img' : yaml.type);
  player.className = 'media-player';
  if (yaml.type === 'image') {
    player.alt = yaml.media_name || 'Attached image';
    if (options.inlineImage) {
      wrap.classList.add('media-inline-image');
      player.classList.add('post-image'); player.tabIndex = 0;
    }
  }
  else { player.controls = true; player.preload = 'none'; player.playsInline = true; }
  const link = document.createElement('a');
  link.textContent = yaml.media_name || 'Download attachment';
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  const retry = document.createElement('button');
  retry.type = 'button'; retry.textContent = 'Retry media'; retry.hidden = true;
  wrap.append(status, player, link, retry);
  container.append(wrap);
  const controller = new AbortController();
  let observer, objectURL, loading = false, disposed = false;
  disposers.set(wrap, () => {
    disposed = true; controller.abort(); observer?.disconnect();
    player.removeAttribute('src');
    if (objectURL) URL.revokeObjectURL(objectURL);
  });
  try {
    // A gateway URL is a download fallback, never the verified player source.
    const url = new URL(yaml.media_url || `${andfsSource(yaml)}/media/${yaml.andfs}`, location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe media URL');
    link.href = url.href;
  } catch { link.remove(); }
  const load = async () => {
    if (loading || disposed || objectURL) return;
    loading = true; retry.hidden = true; observer?.disconnect();
    status.classList.remove('error'); status.textContent = 'Loading and verifying AndFS media…';
    try {
      const bytes = await readAndFSMedia(yaml, { ...options, signal: controller.signal });
      if (disposed) return;
      objectURL = URL.createObjectURL(new Blob([bytes], { type: yaml.mime || '' }));
      player.src = objectURL;
      status.textContent = 'Verified AndFS media';
    } catch (error) {
      if (disposed) return;
      status.textContent = 'Media unavailable: could not retrieve and verify AndFS blocks';
      status.classList.add('error'); retry.hidden = false;
    } finally { loading = false; }
  };
  player.addEventListener('error', () => {
    if (objectURL) status.textContent = 'Verified media; this browser could not play the format. Use the download link.';
  });
  retry.addEventListener('click', load);
  if (typeof IntersectionObserver === 'undefined') void load();
  else {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load();
    }, { rootMargin: '300px' });
    observer.observe(wrap);
  }
  return true;
};
