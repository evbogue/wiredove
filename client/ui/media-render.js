import { createImageGallery } from './image-gallery.js';
export const renderAndFSMedia = (yaml, container, galleryOptions = {}) => {
  if (!yaml?.andfs || !["image", "audio", "video"].includes(yaml.type)) {
    return false;
  }
  const source = /^https:\/\//.test(yaml.media_url || "") ||
      /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(
        yaml.media_url || "",
      )
    ? yaml.media_url
    : null;
  const wrap = document.createElement("div");
  wrap.className = "media-post";
  if (!source) {
    wrap.textContent = "AndFS media is unavailable: no safe media URL.";
    container.appendChild(wrap);
    return true;
  }
  if (yaml.type === 'image') {
    // Only suppress an attachment duplicate with matching explicit source evidence.
    if ([...container.querySelectorAll('wiredove-image-gallery')].some(gallery =>
      gallery.items.some(item => item.src === source))) return true;
    wrap.append(createImageGallery({ ...galleryOptions, images: [{ src: source, alt: yaml.media_name || 'Attached image' }], document: container.ownerDocument }));
  }
  const player = yaml.type === 'image' ? null : document.createElement(yaml.type);
  if (player) {
    player.className = 'media-player';
    player.src = source;
    player.controls = true;
    player.preload = yaml.type === 'video' ? 'metadata' : 'none';
    if (yaml.type === 'video') player.playsInline = true;
    wrap.appendChild(player);
  }
  const link = document.createElement("a");
  link.href = source;
  link.textContent = yaml.media_name || "Download attachment";
  wrap.appendChild(link);
  container.appendChild(wrap);
  return true;
};

