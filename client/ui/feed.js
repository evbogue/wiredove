import { updateMessageList } from "./message-list.js";
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
    updateMessageList(this, (this._posts || []).map(post => ({ post })));
  }
}

export function defineWiredoveThreadFeed() {
  defineWiredoveMessage();
  return registerElement("wiredove-thread-feed", WiredoveThreadFeed);
}
