# Wiredove client core

This directory is the reusable, UI-free compatibility layer for ANProto web
pages. It preserves exact host-supplied YAML bytes, uses standard ANProto
signatures, speaks the Wiredove gossip relay, and creates the AndFS media
metadata shared with the evbogue.com Timeline.

Hosts supply their own YAML and identity/storage adapters; UI, moderation,
quotas, and server deployment remain application concerns. Historical APDS
images and `anblob` media are read by the host app, never rewritten here.

`defineWiredoveElements()` registers `wiredove-message`,
`wiredove-composer`, `wiredove-thread-feed`, `wiredove-thread`, and
`wiredove-widget`. Set their properties rather than relying on global state:
`message.post`, `feed.posts`, and callback properties such as `onReply` and
`onSubmit`.

On another website, import the public module directly:

```js
import { defineWiredoveElements } from "https://wiredove.net/client/ui.js";
defineWiredoveElements();
```

The module also loads `client/render.js` and `style.css` from wiredove.net.
Without a `feed` attribute, hosts still supply verified posts and publishing
callbacks. A configured widget can load its own public feed.

Message bodies render common Markdown links and HTTP(S) images as DOM nodes.
Legacy image references without a browser-readable URL remain visible as
captions. The Reply control is a labeled button that calls the host's
`onReply` callback.

Open `client/embed-demo.html` from a Wiredove server for a working example of
composing every layer one brick at a time.

## Drop-in public feed

```html
<script type="module" src="https://wiredove.net/embed.js"></script>
<wiredove-widget feed="evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k="></wiredove-widget>
```

`feed` is an ANProto author public key. Optional `relay` defaults to
`https://pub.wiredove.net`; `limit` defaults to 40 and is capped at 200.
The widget requests the latest author signature, verifies the exact content
bytes, and follows authenticated `previous` message IDs. Replies remain
available in the loaded history for thread views. This is bounded author
history, not discovery of replies from other authors or a global network feed.

The widget starts loading when connected, reloads when configuration changes,
and offers a Refresh button. Errors are visible and can be retried. Obsolete
loads cannot overwrite a newer feed or host-assigned `posts`. Listen for
`wiredove-loaded` (detail: `{posts}`) and `wiredove-error` (detail: Error), or
call `widget.refresh()`. Network loading requires public relay CORS support.
The default verifier uses pinned ANProto and APDS YAML modules from esm.sh;
embedding sites must permit those modules in their CSP.

No identity is created and no posts are published. Leave off `interactive`
for the public read-only embed. Signing, publishing, and media upload remain
host responsibilities. `client/network-demo.html` demonstrates live loading;
`embed-demo.html` remains the local UI composition demo.

The UI-free `loadWiredoveFeed({feed, baseURL, limit, protocol, relay, signal})`
export supports host-provided protocol/relay adapters. Cancellation suppresses
obsolete results; in-flight requests retain the relay's 10-second timeout.

Run adapter authentication tests with `node --test client/feed_test.js` or
`deno test client/feed_test.js`.
