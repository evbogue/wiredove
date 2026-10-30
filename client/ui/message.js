import { createMessageView } from './message-view.js';
import { applyWiredoveStyles } from './styles.js';
import { registerElement } from './element.js';

export class WiredoveMessage extends HTMLElement {
  set post(value) { this._post = value; this.render(); }
  get post() { return this._post; }
  set onReply(value) {
    this._handlers ||= {};
    this._handlers.onReply = value;
    this._view?.updateActions();
  }
  get onReply() { return this._handlers?.onReply; }
  set onNavigate(value) {
    this._handlers ||= {};
    this._handlers.onNavigate = value;
  }
  set presentation(value) {
    const next = value || {}, previous = this._presentation || {};
    this._presentation = next;
    this._view?.updateActions();
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    if ([...keys].some(key => previous[key] !== next[key])) {
      this._renderKey = null;
      this.render();
    }
  }
  connectedCallback() { this.render(); }
  disconnectedCallback() {
    queueMicrotask(() => { if (!this.isConnected) this._dispose(); });
  }
  _dispose() { this._view?.dispose(); this._renderKey = null; }
  render() {
    const post = this._post;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    this._handlers ||= {};
    this._handlers.post = post;
    // Equivalent verified records retain playback, focus and image requests.
    const key = post ? JSON.stringify([post.id, post.author, post.timestamp, post.parsed || post]) : null;
    if (key && key === this._renderKey) return;
    this._dispose();
    this._view = null;
    root.replaceChildren();
    if (!post) return;
    this._renderKey = key;
    applyWiredoveStyles(root);
    this._view = createMessageView({ post, presentation: this._presentation, handlers: this._handlers });
    root.append(this._view.article);
  }
}

export function defineWiredoveMessage() {
  return registerElement('wiredove-message', WiredoveMessage);
}
