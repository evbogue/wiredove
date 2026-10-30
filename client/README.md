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
adapter; unavailable references keep a stable tile with Retry. Reply is a labeled
button shown only with a functional `onReply` callback. Parent links support both
`reply` and historical `replyHash`. Missing legacy audio/video adapters display an
explicit unavailable state instead of silently dropping the attachment.

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
for AndFS attachments. Website AndFS playback mounts this same widget; it and
embed messages fetch and verify blocks before assigning local playback URLs.
It does not implement the website's legacy media adapter. Registration functions explicitly register required child elements
and are idempotent. Imports alone do not register elements or load a feed.

`client/ui.js` preserves the original convenience API; `client/render.js` preserves
DOM-free helper imports. Canonical helpers live in `ui/format.js`, `ui/body.js`,
`ui/media-render.js`, and `ui/styles.js`. The aggregate `client/index.js` still
imports the complete UI set; use individual modules for narrow dependencies.

The website and custom element now both call the record-driven
`ui/message-view.js` component. The website supplies explicit extensions for its
observer-bound metadata, content and rich controls in light DOM; the public
custom element mounts the same component in shadow DOM. Website edit-event
summaries and APDS data services remain compatibility paths; this does not claim
complete edit/moderation/profile or service parity. See
[the feature inventory](../docs/SHARED_UI_INVENTORY.md) and
[work order](../SHARED_UI_WORK_ORDER.md). Target service/record contracts are
in `core/contracts.js`; adapters implementing them are a later stage.

Run module registration/import checks with `node --test client/ui/modules_test.js`.
Those import checks alone do not establish layout or rendering parity.
Use the root README development commands for the full CI suite. Browser coverage
now includes actual website `render.meta` message shells, edit summaries, raw controls
and reply previews, plus embed reply/navigation callbacks at desktop/mobile sizes
in both themes and in a separate-origin iframe. These fixtures preserve the current
feature differences; they do not establish a complete canonical message widget.

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

### AndFS media verification

`client/andfs.js` owns the signed upload client and shared verified reader.
Uploads require the server to acknowledge the expected hash, MIME and size.
The reader honors the signed source path (including `/timeline`), bounds network
blocks, verifies the manifest and chunks, and checks signed file size. Playback
buffers up to 32 MiB before supplying a local object URL. Media widgets load near
the viewport, provide retry/download controls, and release resources on disconnect.
Public hosts must serve `/vendor/andfs/` with CORS as well as `/client/` and CSS.

Run the focused server/client checks:

```sh
deno test --allow-read --allow-write tests/andfs-media.test.js client/
```

`tests/andfs.browser.js` is an isolated Playwright suite function against a local
server; it blocks public writes, suppresses app bootstrap and creates disposable
identities. It exercises real file uploads/publication and fresh-reader playback,
separate-origin widgets, verification failures/retry, lazy loading and legacy audio.
The optional cross-repository integration uses the actual Timeline data service
and a local HTTP gossip test relay, with disposable disk stores:

```sh
deno run --allow-read --allow-write --allow-net --allow-env tests/andfs-timeline.integration.js /absolute/path/to/evbogue.com/timeline
```

Replicated signed posts retain the original media source. Readers fetch and verify
blocks from that source; this does not automatically mirror media onto every relay
or provide media availability if the original host is offline.

### New inline post images

The website image uploader stores original PNG/JPEG/GIF/WebP bytes with the same
signed AndFS upload client. Multiple images stay inline as `![](media_url)` in the
signed Markdown body. Each URL contains the authenticated manifest hash and its
source path; `andfsImageMetadata()` resolves that path without changing the signed
body. This does not overwrite the profile `image` field or the audio/video metadata.

`ui/image-gallery.js` supplies the shared image gallery used by website Markdown
and embed messages. AndFS sources pass through the verified block reader before
display or enlargement. Legacy APDS references use the host's existing resolver;
signed image references and ordering remain unchanged.

`tests/images.browser.js` checks actual PNG/JPEG/GIF/WebP uploads and byte equality,
multiple-image drafts, removal, publication blocking while uploading, failures,
reload, fresh-reader verification/display, a separate-origin embed, and historical
APDS image loading. New profile photo behavior is described below.

### Profile photos and cropping

The shared profile editor loads vendored Cropper.js 2.3.1 only when a crop is opened.
It supports drag/pinch framing, keyboard arrows, zoom, fine-angle rotation, quarter
turns, reset, and a live circular preview. Rotation/pan keep the square crop inside
the source. Export uses source pixels, capped at 1024 × 1024; the small on-screen
preview does not determine output resolution. Smaller source crops are not enlarged.

The existing `onImageChange(dataURL)` callback remains compatible; it now also
receives `(dataURL, croppedFile, { original, crop, onStatus })`. `photoState` can
supply a persisted `{ image, original, crop }` for re-cropping. `onBusy` lets a frame
block profile saving during uploads. The optional `Adjust crop` action fetches and
verifies the preserved original; crop settings normalize framing across viewports.

The website's `uploadProfilePhoto()` in `upload.js` uses the same signed AndFS
uploader as inline post images. It uploads original bytes and the PNG crop before
returning a new draft. Saving signs `image` (cropped URL), `image_original` (original
URL), and `image_crop` (versioned source dimensions, normalized transform and output
size). Later profile edits preserve that metadata. The original is publicly readable
like other uploaded media. Cancel leaves the previously signed profile unchanged.

`ui/image-source.js` verifies AndFS avatar bytes for website and embed readers;
`profile_image.js` supplies the website's legacy APDS fallback. Navbar, composer,
profile and message avatars accept the new URL without treating it as an APDS hash.
Legacy profile hashes remain unchanged. `tests/profile-photo.browser.js` covers
rotation, pointer/touch/keyboard controls, exact original bytes, output resolution,
no upscaling, upload retry, cancellation, signed metadata, and re-cropping after reload.

`tests/profile-cache-upgrade.cjs` checks a warm service-worker upgrade through a local
proxy, verifying that stale profile code is replaced while the identity, local storage,
and profile-photo state remain intact. Run it with Playwright available and pass a
local Wiredove origin. It uses a disposable browser, not the active user identity.

### Image galleries

`ui/body.js` exports `parseMessageBody(text)` (DOM-free ordered model) and
`appendFormattedText(target, text, { resolveImage, onOpen })`. The website's
`markdown.js` supplies its APDS storage/transport adapter. The pinned Marked lexer
is vendored locally; rendering constructs safe DOM and treats raw HTML as text.

`ui/image-gallery.js` exports `createImageGallery({ images, resolveImage, onOpen,
document })`. Each image is `{ src, alt, title?, link? }`. Calling the factory
lazily registers `wiredove-image-gallery`; importing the module is inert.
Adjacent images wrap into rows of 140px square previews with 6px gaps and
12px corners on each photo. Single images use a 220px square. Previews shrink
to fit narrow containers; every image remains visible in the run and opens
the full original in the viewer.

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


## Shared message and reply-only hosts

```js
widget.capabilities = { reply: true, compose: false };
widget.onPublish = async draft => {
  // Host owns identity, exact-byte signing, storage, relay confirmation and retry.
  // draft.replyTo is the existing post-shaped record, with id and author.
  return await host.publish(draft);
};
widget.presentation = {
  postURL: post => '/timeline/?post=' + encodeURIComponent(post.id),
  replyURL: id => '/timeline/?post=' + encodeURIComponent(id),
  // Optional: omit the widget's navigation bar when the host supplies navigation.
  navigation: false,
};
widget.posts = verifiedPosts;
```

`interactive` remains a compatibility opt-in for compose and reply. Explicit
`capabilities` overrides those defaults; both require a functional `onPublish`.
Removing that publisher immediately removes Reply and Write. Standalone
`wiredove-message`, `wiredove-thread` and `wiredove-thread-feed` show Reply only
when `onReply` is a function. Navigation callbacks retain `{type,id?,author?}`;
modified clicks retain ordinary link behavior. `postURL`, `replyURL` and
`authorURL` accept HTTP(S), fragment and same-origin root-relative links.

A failed publisher must throw or return `saved:false` / `ok:false`; the draft
remains. Return `{saved:true,relayed:false}` when saved locally but awaiting relay
confirmation. The composer displays that distinction. Legacy callbacks returning
no value remain supported. `wiredove-compose` is a post-callback notification
with `{...draft,result}`; `wiredove-published.detail` is the result. Do not publish
a second time from either event. Hosts update `posts` after verified retrieval;
callback results are not silently inserted as verified records.

Equivalent records retain message DOM during feed/thread refresh; current
callbacks are used without rebuilding media. Explicit presentation changes or
changed rendered record fields rebuild that message and dispose its media.
Per-target composer drafts survive widget navigation in memory. Hosts own
reload persistence and identity-setup recovery; this is not a durable draft store.

`presentation.renderLegacyMedia(parsed,target,post)` may synchronously append
historical media UI and return a cleanup function. Without it the public view
shows an unavailable message. Existing `renderBody`, `resolveImage`, `avatarURL`,
`timestamp`, `authorURL` and `onOpenGallery` presentation hooks remain supported.
The website retains its original legacy media reader and immutable references.

See [the integration handoff](../docs/SHARED_MESSAGE_HANDOFF.md) for coordination,
validation boundaries and release notes. `npm run test:browser` includes signed
fixture, separate-origin, keyboard, draft failure/retry and playback-retention
checks at desktop, 390px and 320px in light/dark modes. Publication callbacks in
that suite are injected; actual site storage/relay acceptance is a separate gate.

### Interactive host sessions

`client/runtime/browser-store.js` exports opt-in IndexedDB storage (including File
attachments). `client/runtime/publishing-session.js` exports a transport-neutral
session with injected protocol/host/upload adapters. Assign `widget.session`,
`widget.draftStore = session.store`, `widget.onPublish = session.publish`, and
explicit capabilities. The shared identity panel appears on Reply and under
Identity & pending posts. Keys are persisted only in the browser; backups require
an explicit download/import. Import verifies the private/public key pair.

Sessions persist exact signed outbox records before sending, serialize publishes,
block signing another message until retry completes, and distinguish local save
from relay confirmation. Hosts refresh verified posts on `wiredove-compose` and
`wiredove-retry`; neither event is a request to publish again. Handle
`wiredove-identitychange` to enable owner-only top-level composing. Persist compose
routes in the host so reloading restores the target as well as its stored draft.
`presentation.appearance = 'publication'` enables a quiet, light publication
surface without changing default Wiredove styling. Storage is opened only when a
host explicitly creates/initializes the session; importing widgets stays inert.
