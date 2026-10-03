import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";
import { defineWiredoveMessage } from "./message.js";

export class WiredoveThread extends HTMLElement {
  set post(value) {
    this._post = value;
    this.render();
  }
  set replies(value) {
    this._replies = Array.isArray(value) ? value : [];
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
    if (!this._post) return;
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    for (
      const [post, reply] of [
        [this._post, false],
        ...(this._replies || []).map((item) => [item, true]),
      ]
    ) {
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
      if (reply) {
        const wrap = document.createElement("div");
        wrap.className = "reply";
        wrap.append(message);
        root.append(wrap);
      } else root.append(message);
    }
  }
}

export function defineWiredoveThread() {
  defineWiredoveMessage();
  return registerElement("wiredove-thread", WiredoveThread);
}
