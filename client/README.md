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

The website uses the shared AndFS media widget and profile/composer helpers, but
its full message renderer has not yet migrated to these widgets. See
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

`ui/inline-image.js` supplies the shared inline image element used by the website
Markdown renderer and embed body formatter. It uses the same verified block reader
as audio/video, retains image-gallery keyboard/click targets, and releases object
URLs on disconnect. Legacy 44-character APDS image references still follow the
website's original reader; embeds retain their existing legacy-image placeholder.

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
