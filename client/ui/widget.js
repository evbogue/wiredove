import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";
import { displayName } from "./format.js";
import { defineWiredoveThreadFeed } from "./feed.js";
import { defineWiredoveThread } from "./thread.js";
import { defineWiredoveComposer } from "./composer.js";
import { loadWiredoveFeed } from "../feed.js";

export class WiredoveWidget extends HTMLElement {
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

export function defineWiredoveWidget() {
  defineWiredoveThreadFeed();
  defineWiredoveThread();
  defineWiredoveComposer();
  return registerElement("wiredove-widget", WiredoveWidget);
}
