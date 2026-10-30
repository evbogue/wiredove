import { iconButton } from './composer-surface.js';

// The host persists bytes; this UI preserves multiple inline images in the draft.
export function createImageUpload(textarea, { persistMedia, onBusy, onChange } = {}) {
  const root = document.createElement('div');
  root.className = 'composer-image-upload';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/png,image/jpeg,image/gif,image/webp'; input.hidden = true;
  const status = document.createElement('span');
  status.className = 'composer-image-status'; status.setAttribute('role', 'status');
  const preview = document.createElement('div'); preview.className = 'composer-image-previews';
  const urls = new Set();
  let disposed = false;
  const button = iconButton('Upload image', 'image_arrow_up', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!input.accept.split(',').includes(file.type)) { status.textContent = 'Choose a PNG, JPEG, GIF, or WebP image'; return; }
    button.disabled = true; onBusy?.(true); status.textContent = 'Uploading image…';
    let source;
    try {
      source = URL.createObjectURL(file); urls.add(source);
      const image = new Image(); image.src = source; await image.decode();
      if (disposed) return;
      const attachment = await persistMedia(file, { onStatus: text => { if (!disposed) status.textContent = text; } });
      if (disposed) return;
      // The signed body authenticates this URL, including its AndFS manifest hash.
      const reference = `![](${attachment.media_url})`;
      textarea.value = [textarea.value, reference].filter(Boolean).join('\n');
      const card = document.createElement('div'); card.className = 'composer-image-card';
      const thumbnail = document.createElement('img'); thumbnail.src = source; thumbnail.alt = file.name;
      card.append(thumbnail, iconButton('Remove image', 'close', () => {
        textarea.value = textarea.value.replace(reference, '').trim();
        card.remove(); URL.revokeObjectURL(source); urls.delete(source); onChange?.();
      }));
      preview.append(card); onChange?.(); status.textContent = '';
      source = null; // The preview now owns this URL.
    } catch (error) {
      if (!disposed) status.textContent = error.message || 'Could not upload image';
    } finally {
      if (source) { URL.revokeObjectURL(source); urls.delete(source); }
      if (!disposed) { button.disabled = false; onBusy?.(false); }
    }
  });
  root.append(button, input, status); root.preview = preview;
  root.destroy = () => { disposed = true; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  return root;
}
