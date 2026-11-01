import { iconButton } from './composer-surface.js';

// The host persists bytes; this UI preserves multiple inline images in the draft.
export function createImageUpload(textarea, { persistMedia, onBusy, onChange } = {}) {
  const root = document.createElement('div');
  root.className = 'composer-image-upload';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/png,image/jpeg,image/gif,image/webp'; input.hidden = true;
  const status = document.createElement('span');
  status.className = 'composer-image-status'; status.setAttribute('role', 'status');
  let disposed = false;
  const button = iconButton('Upload image', 'image_arrow_up', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!input.accept.split(',').includes(file.type)) { status.textContent = 'Choose a PNG, JPEG, GIF, or WebP image'; return; }
    button.disabled = true; onBusy?.(true); status.textContent = 'Uploading image…';
    let source;
    try {
      source = URL.createObjectURL(file);
      const image = new Image(); image.src = source; await image.decode();
      if (disposed) return;
      const attachment = await persistMedia(file, { onStatus: text => { if (!disposed) status.textContent = text; } });
      if (disposed) return;
      // The signed body authenticates this URL, including its AndFS manifest hash.
      const reference = `![](${attachment.media_url})`;
      textarea.value = [textarea.value, reference].filter(Boolean).join('\n');
      onChange?.(); status.textContent = '';
    } catch (error) {
      if (!disposed) status.textContent = error.message || 'Could not upload image';
    } finally {
      if (source) URL.revokeObjectURL(source);
      if (!disposed) { button.disabled = false; onBusy?.(false); }
    }
  });
  root.append(button, input, status);
  root.destroy = () => { disposed = true; };
  return root;
}
