// Optional browser UI. Hosts retain ownership of storage, signing, relay
// behavior, moderation, and styling. Widgets optionally load public feeds.
import { loadWiredoveFeed } from "./feed.js";
import { displayName, human, renderAndFSMedia, visual } from "./render.js";

const css = `
:host { display:block; color:inherit; font:inherit; }
.controls { align-items:center; display:flex; flex-wrap:wrap; gap:.5rem; }
.status { color:var(--wiredove-muted, #777); font-size:.875rem; min-height:1.2em; }
.message-actions { margin-top:.25rem; }
.reply-action { border:0; background:transparent; color:var(--wiredove-muted, #777); cursor:pointer; font:inherit; padding:0; }
.reply-action:hover { color:inherit; text-decoration:underline; }
.message-body .wiredove-inline-image { display:block; max-width:100%; max-height:36rem; height:auto; object-fit:contain; margin-block:.5rem; }
.message-body .wiredove-legacy-image-label { display:block; color:var(--wiredove-muted, #777); font-size:.88rem; }
`;
const wiredoveStyleURL = new URL("../style.css", import.meta.url).href;
const applyWiredoveStyles = (root) => {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = wiredoveStyleURL;
  const local = document.createElement("style");
  local.textContent = css;
  root.append(stylesheet, local);
};

const appendFormattedText = (target, text) => {
  for (const line of String(text || "").split("\n")) {
    const row = document.createElement("div");
    const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>]+|#[A-Za-z0-9_]+)/g;
    let cursor = 0;
    for (const match of line.matchAll(pattern)) {
      const [whole, imageAlt, imageSource, linkLabel, linkTarget, token] = match;
      row.append(document.createTextNode(line.slice(cursor, match.index)));
      if (imageAlt !== undefined) {
        if (/^https?:\/\//.test(imageSource)) {
          const image = document.createElement("img");
          image.src = imageSource;
          image.alt = imageAlt || "Attached image";
          image.loading = "lazy";
          image.className = "wiredove-inline-image";
          row.append(image);
        } else {
          const label = document.createElement("span");
          label.className = "wiredove-legacy-image-label";
          label.textContent = "Image: " + (imageAlt || "Attached image");
          label.title = "This legacy image is not available here.";
          row.append(label);
        }
      } else if (linkLabel !== undefined) {
        const link = document.createElement("a");
        link.href = linkTarget;
        link.rel = "noreferrer";
        link.textContent = linkLabel || linkTarget;
        row.append(link);
      } else if (/^https?:\/\//.test(token)) {
        const link = document.createElement("a");
        link.href = token;
        link.rel = "noreferrer";
        link.textContent = token;
        row.append(link);
      } else {
        const tag = document.createElement("a");
        tag.href = "#?" + encodeURIComponent(token);
        tag.textContent = token;
        row.append(tag);
      }
      cursor = match.index + whole.length;
    }
    row.append(document.createTextNode(line.slice(cursor)));
    target.append(row);
  }
};

class WiredoveMessage extends HTMLElement {
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

class WiredoveComposer extends HTMLElement {
  set onSubmit(value) {
    this._onSubmit = value;
  }
  set replyTo(value) {
    this._replyTo = value;
    this.render();
  }
  get replyTo() {
    return this._replyTo;
  }
  connectedCallback() {
    this.render();
  }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    const form = document.createElement("form");
    form.className = "message composer";
    const textarea = document.createElement("textarea");
    textarea.name = "body";
    textarea.placeholder = this._replyTo ? "Write a reply" : "Write a message";
    const controls = document.createElement("div");
    controls.className = "controls";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*,audio/*,video/*";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = this._replyTo ? "Reply" : "Publish";
    const status = document.createElement("div");
    status.className = "status";
    controls.append(file, submit);
    form.append(textarea, controls, status);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = "Publishing…";
      try {
        await this._onSubmit?.({
          body: textarea.value,
          file: file.files?.[0] || null,
          replyTo: this._replyTo || null,
        });
        textarea.value = "";
        file.value = "";
        status.textContent = "Published.";
        this.dispatchEvent(
          new CustomEvent("wiredove-published", { bubbles: true }),
        );
      } catch (error) {
        status.textContent = error?.message || "Could not publish.";
      } finally {
        submit.disabled = false;
      }
    });
    root.append(form);
  }
}

class WiredoveThreadFeed extends HTMLElement {
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

class WiredoveThread extends HTMLElement {
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

class WiredoveWidget extends HTMLElement {
  static get observedAttributes() { return ["feed", "relay", "limit"]; }
  get feed() { return this.getAttribute("feed"); }
  set feed(value) {
    if (value == null) this.removeAttribute("feed");
    else this.setAttribute("feed", value);
  }
  attributeChangedCallback() { if (this.isConnected) this.refresh(); }
  disconnectedCallback() { this._loadController?.abort(); }
  async refresh() {
    this._loadController?.abort();
    const controller = new AbortController();
    this._loadController = controller;
    this._loadError = null;
    this._loading = Boolean(this.feed);
    this._posts = [];
    this.render();
    if (!this.feed) return;
    try {
      const posts = await loadWiredoveFeed({
        feed: this.feed,
        baseURL: this.getAttribute("relay") || "https://pub.wiredove.net",
        limit: this.getAttribute("limit") || 40,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      this._posts = posts;
      this.dispatchEvent(new CustomEvent("wiredove-loaded", {
        detail: { posts }, bubbles: true,
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      this._loadError = error.message || "Could not load feed.";
      this.dispatchEvent(new CustomEvent("wiredove-error", {
        detail: error, bubbles: true,
      }));
    } finally {
      if (!controller.signal.aborted) { this._loading = false; this.render(); }
    }
  }

  set posts(value) {
    this._loadController?.abort();
    this._loading = false;
    this._loadError = null;
    this._posts = Array.isArray(value) ? value : [];
    this.render();
  }
  set onPublish(value) {
    this._onPublish = value;
  }
  set presentation(value) {
    this._presentation = value || {};
    this.render();
  }
  connectedCallback() {
    this.render();
    if (this.feed) this.refresh();
  }
  navigate(route) {
    this._route = route;
    this.dispatchEvent(
      new CustomEvent("wiredove-routechange", {
        detail: route,
        bubbles: true,
      }),
    );
    this.render();
  }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.replaceChildren();
    applyWiredoveStyles(root);
    const style = document.createElement("style");
    style.textContent =
      `.widget-nav { display:flex; align-items:center; gap:5px; margin-bottom:10px; }.widget-nav button { margin-left:0; }.widget-title { margin-right:auto; font-weight:600; }.widget-view > h3 { margin:0 0 5px; }.widget-profile { margin:0 0 10px; }.widget-search { display:flex; gap:5px; margin-bottom:10px; }.widget-search input { flex:1; }`;
    root.append(style);
    const posts = this._posts || [];
    const route = this._route || { type: "feed" };
    const navigate = (next) => this.navigate(next);
    const nav = document.createElement("div");
    nav.className = "widget-nav";
    const title = document.createElement("span");
    title.className = "widget-title";
    title.textContent = "Wiredove";
    const button = (label, target) => {
      const control = document.createElement("button");
      control.textContent = label;
      control.onclick = () => navigate(target);
      return control;
    };
    nav.append(
      title,
      button("Feed", { type: "feed" }),
      button("Search", { type: "search", query: "" }),
    );
    if (this.hasAttribute("interactive")) {
      nav.append(button("Write", { type: "compose" }));
    }
    if (this.feed) {
      const refresh = button("Refresh", { type: "feed" });
      refresh.onclick = () => this.refresh();
      nav.append(refresh);
    }
    root.append(nav);
    if (this._loading || this._loadError) {
      const status = document.createElement("div");
      status.setAttribute("role", "status");
      status.textContent = this._loading ? "Loading verified feed…" : this._loadError;
      root.append(status);
      return;
    }
    const view = document.createElement("div");
    view.className = "widget-view";
    const attachFeed = (items) => {
      const feed = document.createElement("wiredove-thread-feed");
      feed.posts = items;
      feed.presentation = this._presentation;
      feed.onNavigate = navigate;
      feed.onReply = (post) =>
        this.hasAttribute("interactive") &&
        navigate({ type: "compose", replyTo: post });
      view.append(feed);
    };
    if (route.type === "profile") {
      const profilePosts = posts.filter((post) => post.author === route.author);
      const heading = document.createElement("h3");
      heading.textContent = displayName(profilePosts[0]?.parsed, route.author);
      const key = document.createElement("div");
      key.className = "pubkey widget-profile";
      key.textContent = route.author || "";
      view.append(heading, key);
      attachFeed(profilePosts);
    } else if (route.type === "post") {
      const post = posts.find((item) => item.id === route.id);
      if (post) {
        const thread = document.createElement("wiredove-thread");
        thread.post = post;
        thread.replies = posts.filter((item) =>
          item.parsed?.reply === post.id || item.parsed?.replyHash === post.id
        );
        thread.presentation = this._presentation;
        thread.onNavigate = navigate;
        thread.onReply = (item) =>
          this.hasAttribute("interactive") &&
          navigate({ type: "compose", replyTo: item });
        view.append(thread);
      } else view.textContent = "Message unavailable.";
    } else if (route.type === "search") {
      const form = document.createElement("form");
      form.className = "widget-search";
      const input = document.createElement("input");
      input.placeholder = "Search messages";
      input.value = route.query || "";
      const submit = document.createElement("button");
      submit.textContent = "Search";
      form.append(input, submit);
      form.onsubmit = (event) => {
        event.preventDefault();
        navigate({ type: "search", query: input.value.trim() });
      };
      view.append(form);
      const query = (route.query || "").toLowerCase();
      if (query) {
        attachFeed(
          posts.filter((post) =>
            `${post.parsed?.name || ""}\n${post.parsed?.body || ""}`
              .toLowerCase().includes(query)
          ),
        );
      }
    } else if (route.type === "compose" && this.hasAttribute("interactive")) {
      const composer = document.createElement("wiredove-composer");
      composer.replyTo = route.replyTo || null;
      composer.onSubmit = async (draft) => {
        await this._onPublish?.(draft);
        this.dispatchEvent(
          new CustomEvent("wiredove-compose", {
            detail: draft,
            bubbles: true,
          }),
        );
      };
      view.append(composer);
    } else {
      const roots = posts.filter((post) =>
        !post.parsed?.reply && !post.parsed?.replyHash
      );
      if (roots.length) attachFeed(roots);
      else view.textContent = "No posts yet.";
    }
    root.append(view);
  }
}

export function defineWiredoveElements() {
  if (!globalThis.customElements) {
    throw new Error("Wiredove UI requires a browser");
  }
  if (!customElements.get("wiredove-message")) {
    customElements.define("wiredove-message", WiredoveMessage);
  }
  if (!customElements.get("wiredove-composer")) {
    customElements.define("wiredove-composer", WiredoveComposer);
  }
  if (!customElements.get("wiredove-thread-feed")) {
    customElements.define("wiredove-thread-feed", WiredoveThreadFeed);
  }
  if (!customElements.get("wiredove-thread")) {
    customElements.define("wiredove-thread", WiredoveThread);
  }
  if (!customElements.get("wiredove-widget")) {
    customElements.define("wiredove-widget", WiredoveWidget);
  }
  return {
    WiredoveMessage,
    WiredoveComposer,
    WiredoveThread,
    WiredoveThreadFeed,
    WiredoveWidget,
  };
}
