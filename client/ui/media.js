import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";

import { renderAndFSMedia } from "./media-render.js";

export class WiredoveMedia extends HTMLElement {
  set attachment(value) { this._attachment = value; this.render(); }
  get attachment() { return this._attachment; }
  connectedCallback() { this.render(); }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    renderAndFSMedia(this._attachment, root);
  }
}
export function defineWiredoveMedia() {
  return registerElement("wiredove-media", WiredoveMedia);
}
