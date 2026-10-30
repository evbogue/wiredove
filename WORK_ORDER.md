# Wiredove: migrate multimedia from anblob to AndFS

Requested by Ev, 2026-09-17. Status: AndFS v1 writes and verified playback are implemented locally. Focused local audio/video upload, replication, playback, corruption/retry and restart checks passed on 2026-10-21; production deployment and the full cross-client matrix remain pending.

## Outcome

Wiredove and the CSS-free evbogue.com timeline exchange the same signed ANProto/APDS posts and replies. Newly recorded or uploaded audio/video uses AndFS. Existing anblob posts remain readable during migration.

The first consumer implementation is in `evbogue/evbogue.com`, `timeline/`. Its owner is `evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k=`. Read `timeline/README.md` and the implementation before starting. That implementation is a prototype, not a finished AndFS networking standard.

## Compatibility contract

Preserve ANProto's existing signature envelope and the exact signed YAML bytes. Preserve `name`, `image`, `previous`, `body`, `reply` and `replyto`. `reply` and `previous` identify the hash of a signed ANProto message, not its YAML content or a media manifest. `replyto` is the parent author public key.

New AndFS media metadata (inside the signed YAML front matter):

```yaml
type: video
andfs: <43-character URL-safe unpadded AndFS manifest hash>
mime: video/webm
media_name: clip.webm
media_size: 123456
media_url: https://evbogue.com/timeline/media/<manifest-hash>
media_source: https://evbogue.com/timeline
```

The source base serves `/blobs/<hash>`; the media URL serves reconstructed bytes and byte ranges. The body also includes an ordinary media URL for older clients. Do not set `blob` to an AndFS hash: old clients interpret it as an anblob reference.

The AndFS v1 manifest is `{andfs:1,size,chunkSize:262144,chunks:[...]}` with SHA-256 URL-safe unpadded hashes. Keep its ordered JSON serialization byte-for-byte. Do not relabel anblob IDs: anblob uses a different manifest and 1 MiB chunks. MIME and filename are signed presentation metadata outside the AndFS byte identity.

## W01 — AndFS media adapter

- [x] Pin an AndFS revision and use explicit `createAndFS({store})` instances.
- [x] Replace new-media `putBlob()` calls in `media.js` with AndFS add/store calls.
- [x] Use IndexedDB for local verified bytes and an authenticated persistent server upload path.
- [x] Publish only after the manifest and every referenced chunk are durable remotely.
- [x] Keep new media references separate from legacy `blob` fields.

Acceptance: upload the same fixture in Wiredove and evbogue.com; their manifest hashes and every block match. Reject changed bytes. Test empty files, size limits, interrupted uploads, and retry without duplicate storage. Stop after the adapter and its tests work.

## W02 — Upload and serving endpoints

- [x] Reuse or adapt the prototype's signed `andfs-upload-v1` authorization: ANProto signs the hash of exact JSON containing action, manifest hash, MIME, size, and optional reply/replyto. Check freshness, signer, permissions, quotas and bytes.
- [x] Keep the upload bounded to 32 MiB; larger uploads still require streaming/resumable work.
- [x] Implement persistent verified `/blobs/:hash` reads and a reconstructed media endpoint; do not expose repository files.
- [x] Implement GET/HEAD, 206/416, suffix/open-ended ranges, safe content types, and CORS for public reads.
- [x] Keep metadata outside manifests. Back up `data/andfs` and `data/media` together.

Acceptance: a second browser can retrieve after the uploader closes and after a server restart. Corrupt/missing chunks fail verification; unauthorized, oversize and expired upload attempts fail without publishing posts.

## W03 — Render and publish AndFS attachments

- [x] Recognize `andfs` metadata in `render.js` as a media post, including media-only posts.
- [x] Update `media.js` to resolve the signed source base, validate URL schemes, retrieve/verify blocks, and render native audio/video controls.
- [x] Show fetching, unavailable, and verification-failure states with a normal download link.
- [x] Provide a verified gateway range endpoint and explicitly verify AndFS blocks in the browser before playback.
- [x] Load media on demand as posts approach the viewport; do not feed storage chunks to MediaSource.

Acceptance: real audio and video play and seek on desktop and mobile supported browsers; captions/text still render. Old clients show the body link rather than an invalid anblob player. Loading a feed must not eagerly download every video.

## W04 — Preserve existing anblob posts

- [x] Keep the legacy anblob reader for immutable historical posts.
- [ ] Inventory existing blobs and retain their original endpoints/backups.
- [ ] If migrating bytes, reconstruct and verify the old file, add it to AndFS, and record old-ID → new-manifest mapping outside original signed messages.
- [x] Never rewrite old signed metadata or assume the two hash encodings/manifests are interchangeable.
- [x] Update `MEDIA_PROTOTYPE.md`, `AUDIO_VIDEO_PROPOSAL.md`, `AGENTS.md` and README to distinguish new AndFS writes from legacy reads.

Acceptance: historical audio/video works before and after migration, with identical reconstructed bytes and unchanged signatures/message IDs.

## W05 — Cross-client acceptance

- [ ] Import one disposable identity into both clients; verify identical public keys and valid signatures.
- [ ] Publish in evbogue.com; retrieve in Wiredove; reply in Wiredove; retrieve that reply on evbogue.com.
- [ ] Repeat in the opposite direction, preserving previous-message links across clients.
- [ ] Test an AndFS audio and video attachment in both directions, including verified bytes, restart recovery and seeking.
- [ ] Test relay outage/retry, duplicate delivery, unavailable content, and imports in reverse order.
- [ ] Handle existing Wiredove edit/profile events without corrupting timeline history. The first evbogue.com slice currently rejects edit events.

Use local test relays and disposable identities. Public test posts require Ev's explicit instruction. Completion requires observed round trips, not just matching field names or mocked tests.

## Later

Large resumable uploads, garbage collection, per-user storage management, background synchronization, broader history discovery, key rotation/recovery UX, and media transcoding. Keep these out of the first migration unless required by a failing acceptance check.

## Local acceptance checkpoint — 2026-10-21

- Website uploads use `client/andfs.js`; attachment readiness requires a server
  acknowledgement matching manifest hash, MIME and size. Failed uploads remain
  unpublished and removable/retryable. Concurrent uploads cannot bypass quota checks.
- Duplicate upload retries verify the supplied bytes and repair missing/corrupt stored
  blocks. Failed block reads are not cached as immutable missing content.
- Website AndFS attachments mount the shared `wiredove-media` widget; both it and
  embed messages use `client/ui/media-render.js` and the same block verifier.
  Playback waits for verified bytes, loads near the viewport, and offers download
  and explicit retry. This is only the AndFS attachment slice, not completion of
  the shared message/UI restructuring.
- `deno test --allow-read --allow-write tests/andfs-media.test.js` covers signed
  authorization, empty/oversize/changed/interrupted uploads, duplicates, concurrent
  quota enforcement, fresh-store replication, disk reopen, ranges/HEAD/CORS,
  corrupt/missing blocks, repair and invalid server acknowledgements.
- `tests/andfs.browser.js` passed in isolated Chromium contexts with public writes
  and WebSockets blocked: actual WAV/WebM file uploads through the website composer,
  actual signed metadata and previous links, uploader closure, fresh-reader byte
  equality, playback/seeking at mobile width, separate-origin embedded playback,
  corruption/retry, lazy loading, and historical anblob audio verification/playback.
  Mobile light and desktop dark screenshots were reviewed. A subsequent full Deno
  server-process stop/start retained both uploads; a fresh browser fetched, verified
  and played both. Encoded and ordinary private data/config URLs returned 404.
- `tests/andfs-timeline.integration.js` runs against an explicitly supplied local
  evbogue.com `timeline/` checkout. It passed against the actual Timeline service
  using a local HTTP gossip test relay: both audio/video directions, reply/previous
  links, exact signed content/signatures, identical independent AndFS manifests and
  blocks, duplicate delivery, relay outage/retry, and both services reopened from
  their disk stores. The Timeline UI is read-only; this does not claim complete
  interactive cross-client UI acceptance or production-relay testing.
- Existing composer browser checks passed, including failed-upload publication
  blocking, draft recovery, recording cleanup, and desktop/mobile light/dark layouts.

Still outstanding: physical mobile/Safari playback and recording, production blob
inventory/backups and deployment, edit/profile compatibility, reverse-order imports,
and the rest of the W05 matrix. No public test posts were published.

## New post image uploads — 2026-10-21

Ev requested AndFS for new post images while retaining historical blob readers.
The image tool now uses the shared signed upload client, and the server accepts
PNG/JPEG/GIF/WebP alongside audio/video. Original bytes are preserved; there is no
resize or conversion. Multiple inline images remain supported through manifest URLs
in signed Markdown. Website and embeds use the shared inline image element to fetch
and verify AndFS blocks before display. Profile photos remain on their existing
APDS path; historical APDS image and anblob readers/storage are retained.

The focused media service tests now include all four image MIME types, disk reopen,
fresh-store retrieval, byte ranges and exact block equality. `tests/images.browser.js`
passed actual uploads, pending-upload publication blocking, multiple-image removal,
upload rejection, draft reload, signed publication, uploader closure, fresh-reader
byte equality/display, separate-origin embedding and an original-hash APDS image read.
These changes remain local and have not been deployed to wiredove.net.

## High-resolution profile photos — 2026-10-21

This supersedes the earlier checkpoint where profile photo writes still used APDS.
New profile photos use the same shared AndFS upload helper as post images, retaining
original bytes and a separate PNG crop of up to 1024 × 1024 without upscaling smaller
crops. Cropper.js 2.3.1 is vendored with its MIT license and loaded only on demand.
The shared editor provides drag/pinch framing, keyboard movement, zoom, rotation,
quarter turns, reset and a circular preview. Crop settings are normalized across
viewport sizes; rotation/pan keep crop corners within the original.

Signed profiles retain `image`, `image_original`, and versioned `image_crop` metadata;
later profile edits preserve it. The saved original supports re-cropping after reload.
The old direct avatar uploader also delegates to the shared editor/upload helper.
Website navbar/profile/message/composer avatars and embed avatars verify the new
AndFS URL; historical APDS profile photos retain their original reader.

`tests/profile-photo.browser.js` passed in isolated Chromium with public writes
blocked: actual pointer movement, touch pinch, keyboard movement, fine rotation plus
90° turns, cancel before upload, signed crop/original references, same framing after
reload at a different viewport, byte-identical 2400 × 1800 original, 1024 × 1024 crop,
no empty corners, fresh-reader and separate-origin embedded avatar display, retry after upload failure, no upscaling
of an 80 × 60 source, and cancel preserving the signed profile. Mobile light and
desktop dark screenshots were reviewed. Deployment remains pending.

The existing profile onboarding/edit/backup browser suite and composer browser suite
also passed. A warm service-worker upgrade replaced old profile code while preserving
the disposable identity, profile-photo state and local storage; that check is retained
in `tests/profile-cache-upgrade.cjs`. No browser identity storage was cleared to refresh
the app. Public cropper module CORS is enabled alongside the existing public UI modules.

## Upstream integration checkpoint — 2026-10-25

Merged origin/master at `89fbcef` with the local AndFS implementation. Upstream's
ordered shared image galleries and network queue status are retained. Gallery
thumbnails and enlarged AndFS images resolve verified bytes through the shared
image source module; website and embed use the same path. Composer draft media
previews also reconstruct verified bytes. Public module CORS includes vendored
Marked, and the shell cache is `v11-andfs-image-gallery`.

Validation repeated on the combined tree: Deno server check, 17 media/client tests,
12 routing/gallery/network queue tests, and isolated Chromium composer, image,
profile photo, audio/video, and onboarding suites. The upstream gallery browser
suite passed desktop/mobile light/dark, a separate-origin iframe, queue state
transitions, and warm cache upgrades. The profile cache upgrade passed while
preserving identity and photo state. Local Timeline integration passed both
media directions, exact signatures/blocks, and service restart recovery.
Mobile gallery and desktop dark photo crop screenshots were reviewed. Physical
mobile/Safari and production deployment remain pending; no public test posts
were published. Vendored upstream source bytes remain unchanged.
