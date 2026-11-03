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
  let insertion = null;
  let draft = textarea.value;
  let edit = null;
  const beforeEdit = event => {
    edit = { value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd, type: event.inputType };
  };
  // Keep the original insertion point attached to edits, rather than using a
  // stale offset or whichever caret position happens to exist when bytes arrive.
  const trackEdits = () => {
    const next = textarea.value;
    if (insertion !== null && next !== draft) {
      let start = 0, oldEnd = draft.length, newEnd = next.length;
      while (start < oldEnd && start < newEnd && draft[start] === next[start]) start++;
      while (oldEnd > start && newEnd > start && draft[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
      // Actual edit bounds disambiguate repeated text (e.g. typing another "a"
      // before an anchor in "aaaa"). Diffing remains a fallback for autofill.
      if (edit?.value === draft && ['insertText', 'insertFromPaste', 'insertLineBreak'].includes(edit.type)) {
        start = edit.start; oldEnd = edit.end; newEnd = oldEnd + next.length - draft.length;
      } else if (edit?.value === draft && ['deleteContentBackward', 'deleteContentForward'].includes(edit.type)) {
        start = textarea.selectionStart; oldEnd = start + draft.length - next.length; newEnd = start;
      }
      if (insertion >= oldEnd) insertion += newEnd - oldEnd;
      else if (insertion > start) insertion = newEnd;
    }
    draft = next;
    edit = null;
  };
  textarea.addEventListener('beforeinput', beforeEdit);
  textarea.addEventListener('input', trackEdits);
  const button = iconButton('Upload image', 'image_arrow_up', () => {
    draft = textarea.value;
    insertion = textarea.selectionStart;
    input.click();
  });
  input.addEventListener('cancel', () => { insertion = null; });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file || disposed || button.disabled) return;
    if (!input.accept.split(',').includes(file.type)) { insertion = null; status.textContent = 'Choose a PNG, JPEG, GIF, or WebP image'; return; }
    trackEdits();
    insertion ??= textarea.selectionStart;
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
      trackEdits();
      const before = textarea.value.slice(0, insertion), after = textarea.value.slice(insertion);
      const text = (before && !before.endsWith('\n') ? '\n' : '') + reference + (after && !after.startsWith('\n') ? '\n' : '');
      // Insert without replacing selected prose. Preserve the current editing
      // selection if it moved during upload; otherwise continue after the image.
      const start = textarea.selectionStart, end = textarea.selectionEnd, direction = textarea.selectionDirection;
      const position = insertion;
      textarea.setRangeText(text, position, position, 'end');
      if (start !== position || end !== position) {
        textarea.setSelectionRange(start >= position ? start + text.length : start, end >= position ? end + text.length : end, direction);
      }
      draft = textarea.value;
      insertion = null;
      onChange?.(); status.textContent = '';
    } catch (error) {
      if (!disposed) status.textContent = error.message || 'Could not upload image';
    } finally {
      insertion = null;
      if (source) URL.revokeObjectURL(source);
      if (!disposed) { button.disabled = false; onBusy?.(false); }
    }
  });
  root.append(button, input, status);
  root.destroy = () => {
    disposed = true; insertion = null;
    textarea.removeEventListener('beforeinput', beforeEdit);
    textarea.removeEventListener('input', trackEdits);
  };
  return root;
}
