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

Message bodies use the same ordered Markdown/gallery renderer as the website.
Consecutive images form galleries; prose, lists, quotes and code retain their
authored positions. Legacy APDS images require a host `presentation.resolveImage`
adapter; unavailable references keep a stable tile with Retry. The Reply control is a labeled button that calls the host's
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

## Individual UI modules

The widgets are now individually importable. Register only what a host needs:

```js
import { defineWiredoveMessage } from "https://wiredove.net/client/ui/message.js";
defineWiredoveMessage();
```

Modules export their element class and registration function. `ui/message.js`,
`ui/composer.js`, `ui/feed.js`, `ui/thread.js`, `ui/media.js`, and `ui/widget.js`
contain the existing widget implementations. `ui/feed.js` retains the public
`wiredove-thread-feed` name. `wiredove-media` accepts an `attachment` property
for current AndFS gateway media. It does not yet implement the website's legacy
media adapter. Registration functions explicitly register required child elements
and are idempotent. Imports alone do not register elements or load a feed.

`client/ui.js` preserves the original convenience API; `client/render.js` preserves
DOM-free helper imports. Canonical helpers live in `ui/format.js`, `ui/body.js`,
`ui/media-render.js`, and `ui/styles.js`. The aggregate `client/index.js` still
imports the complete UI set; use individual modules for narrow dependencies.

The website now uses the shared body/gallery renderer and image viewer, but has
not yet migrated its whole message shell, actions or data services. See
[the feature inventory](../docs/SHARED_UI_INVENTORY.md) and
[work order](../SHARED_UI_WORK_ORDER.md). Target service/record contracts are
in `core/contracts.js`; adapters implementing them are a later stage.

Run module registration/import checks with `node --test client/ui/modules_test.js`.
These checks do not establish browser layout or website/embed rendering parity.

### Profile editing

`ui/profile-editor.js` exports `createProfileEditor({ name, bio, links,
imageSrc, onImageChange })`. This UI-only module supplies labeled name/bio
fields, the shared links editor, and an accessible photo crop dialog. Frames
own loading, signing, persistence and publishing. `onImageChange` receives the
confirmed PNG crop; `reset(...)` discards drafts and `disabled` locks the editor
during publication. The website uses this same editor for initial setup and
later profile changes.

`tests/profile-setup.browser.js` is a browser-suite function to run with a page
on a local Wiredove origin. It creates isolated browser contexts and covers new
identities without posts, crop apply/cancel, link validation/reordering, signed
metadata, immediate-reload persistence, cancel, backup download/import, and
skipping optional setup. It publishes clearly named test profile updates through
the app's normal transport. It does not modify the active browser identity.

### Image galleries

`ui/body.js` exports `parseMessageBody(text)` (DOM-free ordered model) and
`appendFormattedText(target, text, { resolveImage, onOpen })`. The website's
`markdown.js` supplies its APDS storage/transport adapter. The pinned Marked lexer
is vendored locally; rendering constructs safe DOM and treats raw HTML as text.

`ui/image-gallery.js` exports `createImageGallery({ images, resolveImage, onOpen,
document })`. Each image is `{ src, alt, title?, link? }`. Calling the factory
lazily registers `wiredove-image-gallery`; importing the module is inert.
Adjacent runs show at most four previews. A ten-image run displays “+6 more”;
opening a preview starts at that occurrence and exposes the entire run.

`resolveImage(hash, { signal })` may return a browser-readable image URL or a
raster image data URL from the host's legacy adapter. It must honor lifecycle
cancellation where possible. URL/reference authentication does not establish
image-byte verification. Typed AndFS images use the same gallery; native
AndFS audio/video controls are retained.

By default, `ui/image-popover.js` mounts one native modal dialog per document.
Gallery actions work explicitly across shadow roots and inside a separate-origin
iframe; they do not inspect a parent site's DOM. To own modal mounting, supply
`onOpen(request)` (or `presentation.onOpenGallery` on a message). The request has
`images`, `index`, `trigger`, `owner`, and `resolveImage`; return a cleanup
function. Built-in viewing supports buttons, arrow keys, swipe, image/backdrop
click, Escape, focus restoration, and automatic close when the owner disconnects.

Checks:

- `node --test tests/image-gallery.test.js client/ui/modules_test.js client/feed_test.js`
- `NODE_PATH=<Playwright modules> CHROMIUM_EXECUTABLE=<optional binary> node tests/image-gallery.browser.cjs`

The browser suite runs actual website `render.content` and embed message widgets
with local image/identity fixtures. It never signs or publishes. It covers counts,
inline ordering, source errors, duplicate occurrences, edited bodies, nested
replies, keyboard/touch controls, light/dark layouts, narrow containers, an actual
separate-origin iframe, and warm service-worker cache upgrades preserving storage.

Image sync activity: a `resolveImage(hash, {signal, retry})` adapter may expose
`resolveImage.subscribe(hash, listener)`, returning an unsubscribe function.
Listeners receive `{state}` with `queued`, `requested`, `received`, or `idle`.
The shared gallery/viewer shows waiting/request activity and hides Retry while
active; `received` re-resolves the bytes. The website adapter uses the real network
queue. Requests expire 15 seconds after the last transport dispatch; a user retry
bypasses the normal 30-second hash cooldown. Incoming peer requests do not count
as receiving image bytes. No percentage or receiving-bytes claim is made because
these transports deliver complete blobs rather than reporting byte progress.
