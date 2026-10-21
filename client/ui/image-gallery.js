import { resolveImageSource, safeImageURL } from './image-source.js';
import { openImageGallery } from './image-popover.js';

// Registration is explicit/lazy: importing body/gallery modules has no app effects.
class WiredoveImageGallery extends (globalThis.HTMLElement || class {}) {
  set options(value) { this._options = value; this.render(); }
  get items() { return this._options?.images || []; }
  connectedCallback() { this.observe(); }
  disconnectedCallback() {
    this._observer?.disconnect();
    this._controller?.abort();
    if (typeof this._stopViewer === 'function') this._stopViewer();
  }
  render() {
    this.disconnectedCallback();
    this.replaceChildren();
    this.className = 'image-gallery';
    this.dataset.count = String(Math.min(this.items.length, 4));
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', `${this.items.length} image${this.items.length === 1 ? '' : 's'}`);
    this._controller = new AbortController();
    this.items.slice(0, 4).forEach((item, index) => {
      const tile = this.ownerDocument.createElement('button');
      tile.type = 'button';
      tile.className = 'image-gallery-tile';
      tile.setAttribute('aria-label', `Open image ${index + 1} of ${this.items.length}: ${item.alt || 'Post image'}`);
      const image = this.ownerDocument.createElement('img');
      image.alt = item.alt || 'Post image';
      image.loading = 'lazy';
      image.decoding = 'async';
      const status = this.ownerDocument.createElement('span');
      status.className = 'image-gallery-status';
      status.textContent = 'Loading image…';
      const retry = this.ownerDocument.createElement('button');
      retry.type = 'button';
      retry.className = 'image-gallery-retry';
      retry.textContent = 'Retry image';
      retry.hidden = true;
      const cell = this.ownerDocument.createElement('div');
      cell.className = 'image-gallery-cell';
      const failed = () => {
        status.textContent = 'Image unavailable';
        tile.classList.add('image-unavailable');
        retry.hidden = false;
      };
      image.addEventListener('load', () => {
        if (!this.isConnected) return;
        status.textContent = '';
        tile.classList.remove('image-unavailable');
        tile.classList.add('image-loaded');
        retry.hidden = true;
      });
      image.addEventListener('error', failed);
      tile._load = async () => {
        if (this._controller.signal.aborted || !this.isConnected) return;
        const controller = this._controller;
        retry.hidden = true;
        status.textContent = 'Loading image…';
        try {
          const src = await resolveImageSource(item, this._options.resolveImage, controller.signal);
          if (controller.signal.aborted || !this.isConnected) return;
          if (src) image.src = src;
          else failed();
        } catch { if (!controller.signal.aborted) failed(); }
      };
      retry.onclick = () => tile._load();
      tile.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const request = { images: this.items, index, trigger: tile, owner: this,
          resolveImage: this._options.resolveImage };
        this._stopViewer = (this._options.onOpen || openImageGallery)(request);
      });
      tile.append(image, status);
      if (index === 3 && this.items.length > 4) {
        const more = this.ownerDocument.createElement('span');
        more.className = 'image-gallery-more';
        more.textContent = `+${this.items.length - 4} more`;
        more.setAttribute('aria-hidden', 'true');
        tile.setAttribute('aria-label', `${tile.getAttribute('aria-label')}; ${this.items.length - 4} more images available`);
        tile.append(more);
      }
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
      if (item.src !== hash || index >= 4) return;
      const image = this.querySelectorAll('.image-gallery-tile img')[index];
      const safe = safeImageURL(src, { resolved: true });
      if (image && safe) image.src = safe;
    });
  }
}

export function createImageGallery({ images, resolveImage, onOpen, document: doc = globalThis.document }) {
  const registry = doc.defaultView.customElements;
  if (!registry.get('wiredove-image-gallery')) registry.define('wiredove-image-gallery', WiredoveImageGallery);
  const gallery = doc.createElement('wiredove-image-gallery');
  gallery.options = { images, resolveImage, onOpen };
  return gallery;
}
