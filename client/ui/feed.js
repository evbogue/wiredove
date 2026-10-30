import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";
import { defineWiredoveMessage } from "./message.js";

export class WiredoveThreadFeed extends HTMLElement {
  set posts(value) {
    this._posts = Array.isArray(value) ? value : [];
    this.render();
  }
  set onReply(value) {
    this._onReply = value;
    this.render();
  }
  set onNavigate(value) {
    this._onNavigate = value;
    this.render();
  }
  set presentation(value) {
    this._presentation = value || {};
    this.render();
  }
  connectedCallback() {
    this.render();
  }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    for (const post of this._posts || []) {
      const message = document.createElement("wiredove-message");
      message.post = post;
      message.presentation = this._presentation;
      message.onReply = (value) => {
        this._onReply?.(value);
        this.dispatchEvent(
          new CustomEvent("wiredove-reply", { detail: value, bubbles: true }),
        );
      };
      message.onNavigate = (route) => this._onNavigate?.(route);
      root.append(message);
    }
  }
}

export function defineWiredoveThreadFeed() {
  defineWiredoveMessage();
  return registerElement("wiredove-thread-feed", WiredoveThreadFeed);
}
