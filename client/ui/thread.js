import { updateMessageList } from "./message-list.js";
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
    updateMessageList(this, this._post ? [
      { post: this._post },
      ...(this._replies || []).map(post => ({ post, reply: true })),
    ] : []);
  }
}

export function defineWiredoveThread() {
  defineWiredoveMessage();
  return registerElement("wiredove-thread", WiredoveThread);
}
