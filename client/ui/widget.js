import { createIdentityPanel } from './identity-panel.js';
import { applyWiredoveStyles } from "./styles.js";
import { registerElement } from "./element.js";
import { displayName } from "./format.js";
import { defineWiredoveThreadFeed } from "./feed.js";
import { defineWiredoveThread } from "./thread.js";
import { defineWiredoveComposer } from "./composer.js";
import { profileLinksFromHistory } from "../profile-links.js";
import { renderProfileLinks } from "./profile-links.js";
import { loadWiredoveFeed } from "../feed.js";

export class WiredoveWidget extends HTMLElement {
  static get observedAttributes() { return ["feed", "relay", "limit", "interactive"]; }
  get feed() { return this.getAttribute("feed"); }
  set feed(value) {
    if (value == null) this.removeAttribute("feed");
    else this.setAttribute("feed", value);
  }
  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === 'interactive') this.render();
    else { if (name === 'feed') this._posts = []; this.refresh(); }
  }
  disconnectedCallback() { this._loadController?.abort(); }
  async refresh() {
    this._loadController?.abort();
    const controller = new AbortController();
    this._loadController = controller;
    this._loadError = null;
    this._loading = Boolean(this.feed);
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
  set session(value) {
    this._session = value;
    this._identityPanel = null;
    if (this.isConnected) this.render();
  }
  set draftStore(value) { this._draftStore = value; }
  set onPublish(value) {
    this._onPublish = value;
    if (this.isConnected) this.render();
  }
  get onPublish() { return this._onPublish; }
  set capabilities(value) {
    this._capabilities = value || {};
    if (this.isConnected) this.render();
  }
  get capabilities() {
    const defaults = this.hasAttribute('interactive');
    const publisher = typeof this._onPublish === 'function';
    return {
      compose: publisher && Boolean(this._capabilities?.compose ?? defaults),
      reply: publisher && Boolean(this._capabilities?.reply ?? defaults),
    };
  }
  set presentation(value) {
    this._presentation = value || {};
    if (value?.appearance) this.setAttribute('appearance', value.appearance);
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
    if (!this._view) {
      applyWiredoveStyles(root);
      this._nav = document.createElement('div');
      this._status = document.createElement('div');
      this._status.setAttribute('role', 'status');
      this._view = document.createElement('div');
      this._view.className = 'widget-view';
      root.append(this._nav, this._status, this._view);
    }
    const style = document.createElement("style");
    style.textContent =
      `.widget-nav { display:flex; align-items:center; gap:5px; margin-bottom:10px; }.widget-nav[hidden] { display:none; }.widget-nav button { margin-left:0; }.widget-title { margin-right:auto; font-weight:600; }.widget-view > h3 { margin:0 0 5px; }.widget-profile { margin:0 0 10px; }.widget-search { display:flex; gap:5px; margin-bottom:10px; }.widget-search input { flex:1; }`;
    if (!this._widgetStyle) { root.append(style); this._widgetStyle = style; }
    const posts = this._posts || [];
    const route = this._route || { type: "feed" };
    const navigate = (next) => this.navigate(next);
    const nav = this._nav;
    nav.replaceChildren();
    nav.className = 'widget-nav';
    nav.hidden = this._presentation?.navigation === false;
    const title = document.createElement("span");
    title.className = "widget-title";
    title.textContent = this._presentation?.title ?? 'Wiredove';
    title.hidden = !title.textContent;
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
    if (this.capabilities.compose) {
      nav.append(button("Write", { type: "compose" }));
    }
    if (this._session) nav.append(button('Identity & pending posts', { type: 'identity' }));
    if (this.feed) {
      const refresh = button("Refresh", { type: "feed" });
      refresh.onclick = () => this.refresh();
      nav.append(refresh);
    }
    this._status.textContent = this._loading ? 'Loading verified feed…' : this._loadError || '';
    const view = this._view;
    const routeKey = JSON.stringify(route);
    if (this._viewKey !== routeKey) { view.replaceChildren(); this._viewKey = routeKey; }
    const reply = this.capabilities.reply ? post => navigate({ type: 'compose', replyTo: post }) : null;
    const attachFeed = (items) => {
      const feed = view.querySelector('wiredove-thread-feed') || document.createElement('wiredove-thread-feed');
      feed.posts = items;
      feed.presentation = this._presentation;
      feed.onNavigate = navigate;
      feed.onReply = reply;
      if (!feed.parentNode) {
        if (route.type === 'feed') view.replaceChildren();
        view.append(feed);
      }
    };
    const identityPanel = () => {
      this._identityPanel ||= createIdentityPanel(this._session, {
        onChange: () => this.dispatchEvent(new CustomEvent('wiredove-identitychange', { bubbles: true })),
        onRetry: results => {
          for (const result of results) if (result.saved && result.post) {
            const key = result.post.parsed.reply || 'new';
            this._composers?.get(key)?.clearDraft();
          }
          this.dispatchEvent(new CustomEvent('wiredove-retry', { detail: results, bubbles: true }));
        },
      });
      return this._identityPanel;
    };
    if (route.type === 'identity' && this._session) {
      view.replaceChildren(identityPanel());
      void this._identityPanel.refresh();
    } else if (route.type === "profile") {
      const profilePosts = posts.filter((post) => post.author === route.author);
      const heading = view.querySelector('h3') || document.createElement('h3');
      heading.textContent = displayName(profilePosts[0]?.parsed, route.author);
      const key = view.querySelector('.widget-profile') || document.createElement('div');
      key.className = 'pubkey widget-profile';
      key.textContent = route.author || "";
      const links = view.querySelector('nav') || document.createElement('nav');
      renderProfileLinks(links, profileLinksFromHistory(profilePosts) || []);
      if (!heading.parentNode) view.append(heading, key, links);
      attachFeed(profilePosts);
    } else if (route.type === "post") {
      const post = posts.find((item) => item.id === route.id);
      if (post) {
        const thread = view.querySelector('wiredove-thread') || document.createElement('wiredove-thread');
        thread.post = post;
        thread.replies = posts.filter((item) =>
          item.parsed?.reply === post.id || item.parsed?.replyHash === post.id
        );
        thread.presentation = this._presentation;
        thread.onNavigate = navigate;
        thread.onReply = reply;
        if (!thread.parentNode) { view.replaceChildren(); view.append(thread); }
      } else view.textContent = "Message unavailable.";
    } else if (route.type === "search") {
      let form = view.querySelector('form');
      if (!form) {
        form = document.createElement('form');
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
      }
      const query = (route.query || '').toLowerCase();
      if (query) {
        attachFeed(
          posts.filter((post) =>
            `${post.parsed?.name || ""}\n${post.parsed?.body || ""}`
              .toLowerCase().includes(query)
          ),
        );
      }
    } else if (route.type === 'compose') {
      const allowed = route.replyTo ? this.capabilities.reply : this.capabilities.compose;
      if (!allowed) { view.textContent = 'Publishing is unavailable in this view.'; return; }
      const key = route.replyTo?.id || 'new';
      this._composers ||= new Map();
      let composer = this._composers.get(key);
      if (!composer) {
        composer = document.createElement('wiredove-composer');
        composer.replyTo = route.replyTo || null;
        composer.draftStore = this._draftStore;
        if (this._presentation?.appearance) composer.setAttribute('appearance', this._presentation.appearance);
        this._composers.set(key, composer);
      }
      composer.onSubmit = async draft => {
        const permitted = draft.replyTo ? this.capabilities.reply : this.capabilities.compose;
        if (!permitted || typeof this._onPublish !== 'function') throw new Error('Publishing is unavailable. Your draft is still here.');
        let result;
        try { result = await this._onPublish(draft); }
        finally { if (this._identityPanel) void this._identityPanel.refresh(); }
        if (result?.saved === false || result?.ok === false) throw new Error('Publication was not saved. Your draft is still here.');
        this.dispatchEvent(new CustomEvent('wiredove-compose', {
          detail: { ...draft, result }, bubbles: true,
        }));
        return result;
      };
      if (composer.parentNode !== view) {
        view.replaceChildren();
        if (this._session) { view.append(identityPanel()); void this._identityPanel.refresh(); }
        if (route.replyTo) {
          const context = document.createElement('p'); context.textContent = 'Replying to ' + displayName(route.replyTo.parsed, route.replyTo.author);
          view.append(context);
        }
        view.append(composer);
      }
    } else {
      const roots = posts.filter((post) =>
        !post.parsed?.reply && !post.parsed?.replyHash
      );
      if (roots.length) {
        const size = this.pageSize > 0 ? this.pageSize : roots.length;
        this._feedLimit = Math.max(this._feedLimit || 0, size);
        attachFeed(roots.slice(0, this._feedLimit));
        let more = view.querySelector('[data-load-older]');
        if (roots.length > this._feedLimit) {
          if (!more) {
            more = document.createElement('button'); more.type = 'button'; more.dataset.loadOlder = '';
            more.textContent = 'Show older cached posts';
            more.onclick = () => { this._feedLimit += size; this.render(); };
            view.append(more);
          }
        } else more?.remove();
      }
      else view.textContent = "No posts yet.";
    }
  }
}

export function defineWiredoveWidget() {
  defineWiredoveThreadFeed();
  defineWiredoveThread();
  defineWiredoveComposer();
  return registerElement("wiredove-widget", WiredoveWidget);
}
