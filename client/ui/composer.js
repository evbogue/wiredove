import { applyWiredoveStyles } from './styles.js';
import { registerElement } from './element.js';
import { createComposerSurface, iconButton } from './composer-surface.js';
import { createMediaControls } from './composer-media.js';

// The host owns signing/storage and may persist drafts through its own adapter.
// Detached widgets retain text and selected files in memory, per reply target.
export class WiredoveComposer extends HTMLElement {
  clearDraft() {
    this._clearDraft?.();
  }
  set onSubmit(value) { this._onSubmit = value; this._update?.(); }
  set replyTo(value) {
    if (this._replyTo === value) return;
    this._remember?.();
    this._replyTo = value;
    if (this.isConnected) this.render();
  }
  get replyTo() { return this._replyTo; }
  async connectedCallback() {
    const key = this._replyTo?.id || 'new';
    const drafts = this._drafts ||= new Map();
    if (this.draftStore && !drafts.has(key)) {
      try {
        const saved = await this.draftStore.get('draft:' + key);
        if (saved) drafts.set(key, saved);
      } catch { this._draftError = 'Draft storage is unavailable. Keep this page open until you finish.'; }
    }
    if (this.isConnected) this.render();
  }
  disconnectedCallback() { this._remember?.(); this._media?.destroy(); }
  render() {
    const generation = this._generation = (this._generation || 0) + 1;
    this._media?.destroy();
    const current = () => this.isConnected && this._generation === generation;
    const drafts = this._drafts ||= new Map();
    const key = this._replyTo?.id || 'new';
    const draft = drafts.get(key) || {};
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.replaceChildren(); applyWiredoveStyles(root);
    const textarea = document.createElement('textarea');
    textarea.placeholder = this._replyTo ? 'Write a reply' : 'Write a message';
    textarea.value = draft.body || '';
    let file = draft.file || null, busy = false, publishing = false;
    let imageButton;
    const persist = value => {
      if (!this.draftStore) return Promise.resolve();
      const previous = this._persisting || Promise.resolve();
      const operation = previous.catch(() => {}).then(() => value
        ? this.draftStore.set('draft:' + key, value) : this.draftStore.delete('draft:' + key));
      this._persisting = operation;
      operation.catch(() => { if (current()) surface.status.textContent = 'Could not save draft in this browser. Keep this page open.'; });
      return operation;
    };
    const remember = this._remember = () => {
      const value = { body: textarea.value, file };
      drafts.set(key, value);
      void persist(value);
    };
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
          await persist(null);
          if (!current()) return;
          textarea.value = ''; media.reset(); file = null;
          surface.status.textContent = result?.relayed === false ? 'Saved locally; relay confirmation pending.' : 'Published.';
          this.dispatchEvent(new CustomEvent('wiredove-published', { detail: result, bubbles: true, composed: true }));
        } catch (error) {
          if (current()) surface.status.textContent = error.message || 'Could not publish. Your draft is still here.';
        } finally { if (current()) { publishing = false; update(); } }
      }
    });
    this._clearDraft = () => {
      textarea.value = ''; media.reset(); file = null;
      drafts.delete(key); void persist(null); update();
    };
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
    if (this._draftError) surface.status.textContent = this._draftError;
    if (draft.file) void media.attach(draft.file);
  }
}
export function defineWiredoveComposer() { return registerElement('wiredove-composer', WiredoveComposer); }
