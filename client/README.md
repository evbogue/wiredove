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
The host still supplies verified posts and publishing callbacks; importing
the module does not fetch a feed or publish messages by itself.

Message bodies render common Markdown links and HTTP(S) images as DOM nodes.
Legacy image references without a browser-readable URL remain visible as
captions. The Reply control is a labeled button that calls the host's
`onReply` callback.

Open `client/embed-demo.html` from a Wiredove server for a working example of
composing every layer one brick at a time.
