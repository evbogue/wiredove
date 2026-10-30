import { andfsImageMetadata } from '../andfs.js';
import { renderAndFSMedia, disposeMedia } from './media-render.js';
import { registerElement } from './element.js';

// Light DOM retains the website's existing image gallery and keyboard controls.
export class WiredoveInlineImage extends HTMLElement {
  static get observedAttributes() { return ['source', 'alt']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }
  disconnectedCallback() { disposeMedia(this); }
  render() {
    disposeMedia(this); this.replaceChildren();
    const attachment = andfsImageMetadata(this.getAttribute('source'));
    if (!attachment) { this.textContent = 'Image unavailable'; return; }
    attachment.media_name = this.getAttribute('alt') || 'Download image';
    renderAndFSMedia(attachment, this, { inlineImage: true });
  }
}
export function defineWiredoveInlineImage() {
  return registerElement('wiredove-inline-image', WiredoveInlineImage);
}
export function createInlineImage(source, alt = '') {
  defineWiredoveInlineImage();
  const image = document.createElement('wiredove-inline-image');
  image.setAttribute('source', source); image.setAttribute('alt', alt);
  return image;
}
