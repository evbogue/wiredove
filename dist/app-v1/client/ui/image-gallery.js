import { resolveImageSource, safeImageURL } from './image-source.js';
import { openImageGallery } from './image-popover.js';

// Shared image-request status copy. 'paused' means the network queue is
// suspended (no connection); the request is held, not lost.
export const imageRequestStatusText = (state) =>
  state === 'paused' ? 'Waiting for connection…'
  : state === 'queued' ? 'Waiting to request image…'
  : state === 'requested' ? 'Asking peers for image…'
  : 'Image hasn’t arrived';
export const imageRequestActive = (state) =>
  state === 'queued' || state === 'requested' || state === 'paused';
// Retry stays available while paused: the queue will not send, but the retry
// re-checks the local cache, which may have filled through another path.
export const imageRequestRetryVisible = (state) => state !== 'queued' && state !== 'requested';

const symbolFontURL = new URL('../../vendor/material-symbols/outlined-v382.ttf', import.meta.url).href;
function ensureSymbolFont(doc) {
  if (!doc.fonts || [...doc.fonts].some(face => face.family.replaceAll('"', '') === 'Wiredove Symbols')) return;
  const Font = doc.defaultView.FontFace;
  if (!Font) return;
  const face = new Font('Wiredove Symbols', `url(${symbolFontURL})`);
  doc.fonts.add(face);
  void face.load().catch(() => { doc.fonts.delete(face); });
}

// Registration is explicit/lazy: importing body/gallery modules has no app effects.
class WiredoveImageGallery extends (globalThis.HTMLElement || class {}) {
  set options(value) { this._options = value; this.render(); }
  get items() { return this._options?.images || []; }
  connectedCallback() { ensureSymbolFont(this.ownerDocument); this.observe(); }
  disconnectedCallback() {
    this._subscriptions?.forEach(stop => stop());
    this._subscriptions = [];
    this._observer?.disconnect();
    this._controller?.abort();
    if (typeof this._stopViewer === 'function') this._stopViewer();
  }
  render() {
    this.disconnectedCallback();
    this.replaceChildren();
    this.className = 'image-gallery';
    this.dataset.count = String(this.items.length);
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', `${this.items.length} image${this.items.length === 1 ? '' : 's'}`);
    this._controller = new AbortController();
    this.items.forEach((item, index) => {
      const tile = this.ownerDocument.createElement('button');
      tile.type = 'button';
      tile.className = 'image-gallery-tile';
      const openLabel = `Open image ${index + 1} of ${this.items.length}: ${item.alt || 'Post image'}`;
      tile.setAttribute('aria-label', openLabel);
      const image = this.ownerDocument.createElement('img');
      image.alt = item.alt || 'Post image';
      // The gallery observer defers assigning src; pending images are hidden.
      image.loading = 'eager';
      image.decoding = 'async';
      const status = this.ownerDocument.createElement('span');
      status.className = 'image-gallery-status';
      status.setAttribute('role', 'status');
      const symbol = this.ownerDocument.createElement('span');
      symbol.className = 'material-symbols-outlined image-gallery-symbol';
      symbol.setAttribute('aria-hidden', 'true');
      status.append(symbol);
      const retry = this.ownerDocument.createElement('button');
      retry.type = 'button';
      retry.className = 'image-gallery-retry';
      retry.setAttribute('aria-label', 'Retry image');
      retry.title = 'Retry image';
      const retrySymbol = this.ownerDocument.createElement('span');
      retrySymbol.className = 'material-symbols-outlined image-gallery-symbol';
      retrySymbol.setAttribute('aria-hidden', 'true'); retrySymbol.textContent = 'refresh';
      retry.append(retrySymbol);
      retry.hidden = true;
      const cell = this.ownerDocument.createElement('div');
      cell.className = 'image-gallery-cell image-pending';
      let loading = false;
      const showStatus = (label, busy = false) => {
        cell.classList.add('image-pending');
        status.hidden = false;
        status.setAttribute('aria-label', label);
        symbol.textContent = busy ? 'progress_activity' : 'image';
        symbol.classList.toggle('image-gallery-spinning', busy);
        tile.title = busy ? label : label + ' — Retry image';
        tile.setAttribute('aria-label', tile.title);
        tile.setAttribute('aria-busy', String(busy));
      };
      showStatus('Loading image…', true);
      const failed = () => {
        tile.classList.remove('image-loaded');
        showStatus('Image unavailable');
        tile.classList.add('image-unavailable');
        retry.hidden = false;
      };
      image.addEventListener('load', () => {
        if (!this.isConnected) return;
        status.hidden = true;
        cell.classList.remove('image-pending');
        symbol.classList.remove('image-gallery-spinning');
        tile.setAttribute('aria-label', openLabel); tile.title = openLabel;
        tile.removeAttribute('aria-busy');
        tile.classList.remove('image-unavailable');
        tile.classList.add('image-loaded');
        retry.hidden = true;
      });
      image.addEventListener('error', failed);
      tile._load = async (retryRequest = false) => {
        if (loading || this._controller.signal.aborted || !this.isConnected) return;
        loading = true;
        const controller = this._controller;
        retry.hidden = true;
        showStatus('Loading image…', true);
        try {
          const src = await resolveImageSource(item, this._options.resolveImage, controller.signal, retryRequest, this._options.mediaOptions);
          if (controller.signal.aborted || !this.isConnected) return;
          if (src) image.src = src;
          else { failed(); tile._watch?.(); }
        } catch { if (!controller.signal.aborted) failed(); }
        finally { loading = false; }
      };
      retry.onclick = () => tile._load(true);
      tile._watch = () => {
        tile._stop?.();
        if (!this._options.resolveImage?.subscribe) return;
        const stop = this._options.resolveImage.subscribe(item.src, ({ state }) => {
          if (!this.isConnected || tile.classList.contains('image-loaded')) return;
          if (state === 'received') { void tile._load(); return; }
          showStatus(imageRequestStatusText(state), state === 'queued' || state === 'requested');
          retry.hidden = !imageRequestRetryVisible(state);
        });
        tile._stop = stop;
        this._subscriptions.push(stop);
      };
      tile.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!tile.classList.contains('image-loaded')) { void tile._load(true); return; }
        const request = { images: this.items, index, trigger: tile, owner: this,
          resolveImage: this._options.resolveImage, mediaOptions: this._options.mediaOptions };
        this._stopViewer = (this._options.onOpen || openImageGallery)(request);
      });
      tile.append(image, status);
      cell.append(tile, retry);
      this.append(cell);
    });
    if (this.isConnected) this.observe();
  }
  observe() {
    if (!this._options) return;
    if (this._controller?.signal.aborted) {
      this._controller = new AbortController();
    }
    this._observer?.disconnect();
    const tiles = [...this.querySelectorAll('.image-gallery-tile')];
    const IO = this.ownerDocument.defaultView.IntersectionObserver;
    if (!IO) { tiles.forEach(tile => tile._load()); return; }
    this._observer = new IO(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { this._observer.unobserve(entry.target); entry.target._load(); }
    }), { rootMargin: '200px' });
    tiles.forEach(tile => this._observer.observe(tile));
  }
  refreshSource(hash, src) {
    this.items.forEach((item, index) => {
      if (item.src !== hash) return;
      const image = this.querySelectorAll('.image-gallery-tile img')[index];
      const safe = safeImageURL(src, { resolved: true });
      if (image && safe) image.src = safe;
    });
  }
}

export function createImageGallery({ images, resolveImage, onOpen, mediaOptions, document: doc = globalThis.document }) {
  const registry = doc.defaultView.customElements;
  if (!registry.get('wiredove-image-gallery')) registry.define('wiredove-image-gallery', WiredoveImageGallery);
  const gallery = doc.createElement('wiredove-image-gallery');
  gallery.options = { images, resolveImage, onOpen, mediaOptions };
  return gallery;
}
