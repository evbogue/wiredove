import { applyWiredoveStyles } from './styles.js';
import { registerElement } from './element.js';
import { createComposerSurface, iconButton } from './composer-surface.js';
import { createMediaControls } from './composer-media.js';

// The host owns signing/storage and may persist drafts through its own adapter.
// Detached widgets retain text and selected files in memory, per reply target.
export class WiredoveComposer extends HTMLElement {
  set onSubmit(value) { this._onSubmit = value; this._update?.(); }
  set replyTo(value) {
    if (this._replyTo === value) return;
    this._remember?.();
    this._replyTo = value;
    if (this.isConnected) this.render();
  }
  get replyTo() { return this._replyTo; }
  connectedCallback() { this.render(); }
  disconnectedCallback() { this._remember?.(); this._media?.destroy(); }
  render() {
    const generation = this._generation = (this._generation || 0) + 1;
    this._media?.destroy();
    const current = () => this.isConnected && this._generation === generation;
    const drafts = this._drafts ||= new Map();
    const key = typeof this._replyTo === 'object' ? JSON.stringify(this._replyTo) : this._replyTo || 'new';
    const draft = drafts.get(key) || {};
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.replaceChildren(); applyWiredoveStyles(root);
    const textarea = document.createElement('textarea');
    textarea.placeholder = this._replyTo ? 'Write a reply' : 'Write a message';
    textarea.value = draft.body || '';
    let file = draft.file || null, busy = false, publishing = false;
    let imageButton;
    const remember = this._remember = () => drafts.set(key, { body: textarea.value, file });
    const update = () => {
      surface.publish.disabled = publishing || busy || typeof this._onSubmit !== 'function' || (!textarea.value.trim() && !file);
      surface.tools.inert = publishing;
      textarea.readOnly = publishing;
      if (imageButton) imageButton.disabled = busy || publishing;
    };
    const surface = createComposerSurface({
      textarea, publishLabel: this._replyTo ? 'Reply' : 'Publish',
      onPreview: target => {
        // Hosts can supply their Markdown renderer; text is a safe fallback.
        target.textContent = textarea.value;
        return this.renderPreview?.(target, textarea.value);
      },
      onPublish: async () => {
        if (surface.publish.disabled) return;
        const payload = { body: textarea.value, file, replyTo: this._replyTo || null };
        publishing = true; update(); surface.status.textContent = 'Publishing…';
        try {
          const result = await this._onSubmit(payload);
          if (result?.saved === false || result?.ok === false) throw new Error('Publication was not saved. Your draft is still here.');
          drafts.delete(key);
          if (!current()) return;
          textarea.value = ''; media.reset(); file = null;
          surface.status.textContent = result?.relayed === false ? 'Saved locally; relay confirmation pending.' : 'Published.';
          this.dispatchEvent(new CustomEvent('wiredove-published', { detail: result, bubbles: true, composed: true }));
        } catch (error) {
          if (current()) surface.status.textContent = error.message || 'Could not publish. Your draft is still here.';
        } finally { if (current()) { publishing = false; update(); } }
      }
    });
    this._surface = surface;
    this._update = update;
    const media = createMediaControls({
      persistMedia: async selected => ({ file: selected }),
      onBusy: value => { if (!current()) return; busy = value; update(); },
      onAttachment: attachment => { if (!current()) return; file = attachment?.file || null; remember(); update(); }
    });
    this._media = media;
    const image = document.createElement('input');
    image.type = 'file'; image.accept = 'image/*'; image.hidden = true;
    image.addEventListener('change', () => {
      const selected = image.files?.[0]; image.value = '';
      if (!selected) return;
      if (!selected.type.startsWith('image/')) { surface.status.textContent = 'Choose an image file'; return; }
      void media.attach(selected);
    });
    textarea.addEventListener('input', () => { remember(); update(); });
    imageButton = iconButton('Upload image', 'image_arrow_up', () => image.click());
    surface.tools.append(imageButton, image, media.actions);
    surface.attachments.append(media);
    root.append(surface.root); update();
    if (draft.file) void media.attach(draft.file);
  }
}
export function defineWiredoveComposer() { return registerElement('wiredove-composer', WiredoveComposer); }
