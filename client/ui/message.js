import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";
import { displayName, human, visual } from "./format.js";
import { appendFormattedText } from "./body.js";
import { renderAndFSMedia } from "./media-render.js";

export class WiredoveMessage extends HTMLElement {
  set post(value) {
    this._post = value;
    this.render();
  }
  get post() {
    return this._post;
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
    const post = this._post;
    if (!post) return;
    const parsed = post.parsed || post;
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    const article = document.createElement("article");
    article.className = "message";
    const main = document.createElement("div");
    main.className = "message-main";
    let avatar;
    try {
      avatar = visual(post.author);
    } catch {
      avatar = document.createElement("img");
    }
    avatar.className = "avatar";
    avatar.alt = "";
    const customAvatar = this._presentation?.avatarURL?.(post);
    if (customAvatar) avatar.src = customAvatar;
    const avatarLink = document.createElement("a");
    avatarLink.href = this._presentation?.authorURL?.(post) ||
      `https://wiredove.net/#${encodeURIComponent(post.author || "")}`;
    avatarLink.addEventListener("click", (event) => {
      if (!this._onNavigate) return;
      event.preventDefault();
      this._onNavigate({ type: "profile", author: post.author });
    });
    avatarLink.append(avatar);
    const stack = document.createElement("div");
    stack.className = "message-stack";
    const author = document.createElement("a");
    author.className = "avatarlink";
    author.textContent = displayName(parsed, post.author);
    author.href = this._presentation?.authorURL?.(post) ||
      `https://wiredove.net/#${encodeURIComponent(post.author || "")}`;
    author.addEventListener("click", (event) => {
      if (!this._onNavigate) return;
      event.preventDefault();
      this._onNavigate({ type: "profile", author: post.author });
    });
    const meta = document.createElement("span");
    meta.className = "message-meta";
    const pubkey = document.createElement("span");
    pubkey.className = "pubkey";
    pubkey.textContent = String(post.author || "").substring(0, 6);
    const time = document.createElement("a");
    time.href = "#";
    if (post.timestamp) {
      time.dateTime = new Date(post.timestamp).toISOString();
      time.title = new Date(post.timestamp).toLocaleString();
      time.textContent = this._presentation?.timestamp?.(post) ||
        human(post.timestamp);
    }
    time.addEventListener("click", (event) => {
      if (!this._onNavigate) return;
      event.preventDefault();
      this._onNavigate({ type: "post", id: post.id });
    });
    meta.append(pubkey, " ", time);
    stack.append(author);
    if (parsed.body || parsed.andfs) {
      const body = document.createElement("div");
      body.className = "message-body";
      if (this._presentation?.renderBody) {
        this._presentation.renderBody(parsed.body, body, post);
      } else appendFormattedText(body, parsed.body);
      renderAndFSMedia(parsed, body);
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const reply = document.createElement("button");
      reply.className = "reply-action";
      reply.type = "button";
      reply.setAttribute("aria-label", "Reply to this post");
      reply.textContent = "Reply";
      reply.addEventListener("click", (event) => {
        this._onReply?.(post);
      });
      actions.append(reply);
      body.append(actions);
      stack.append(body);
    }
    main.append(avatarLink, stack);
    article.append(meta, main);
    root.append(article);
  }
}

export function defineWiredoveMessage() {
  return registerElement("wiredove-message", WiredoveMessage);
}
