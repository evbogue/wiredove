# Wiredove: migrate multimedia from anblob to AndFS

Requested by Ev, 2026-09-17. Status: planned; this work order does not change Wiredove runtime behavior.

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

- [ ] Pin an AndFS revision and use explicit `createAndFS({store})` instances.
- [ ] Replace new-media `putBlob()` calls in `media.js` with AndFS add/store calls.
- [ ] Use IndexedDB for local verified bytes and an authenticated persistent server upload path.
- [ ] Publish only after the manifest and every referenced chunk are durable remotely.
- [ ] Keep new media references separate from legacy `blob` fields.

Acceptance: upload the same fixture in Wiredove and evbogue.com; their manifest hashes and every block match. Reject changed bytes. Test empty files, size limits, interrupted uploads, and retry without duplicate storage. Stop after the adapter and its tests work.

## W02 — Upload and serving endpoints

- [ ] Reuse or adapt the prototype's signed `andfs-upload-v1` authorization: ANProto signs the hash of exact JSON containing action, manifest hash, MIME, size, and optional reply/replyto. Check freshness, signer, permissions, quotas and bytes.
- [ ] Review the prototype's bounded, whole-file 32 MiB upload and implement streaming/resumable uploads if larger media is required.
- [ ] Implement persistent verified `/blobs/:hash` reads and a reconstructed media endpoint; do not expose repository files.
- [ ] Implement GET/HEAD, 206/416, suffix/open-ended ranges, safe content types, and CORS for public reads.
- [ ] Keep metadata outside manifests. Inventory and back up manifests and all chunks.

Acceptance: a second browser can retrieve after the uploader closes and after a server restart. Corrupt/missing chunks fail verification; unauthorized, oversize and expired upload attempts fail without publishing posts.

## W03 — Render and publish AndFS attachments

- [ ] Recognize `andfs` metadata in `render.js` as a media post, including media-only posts.
- [ ] Update `media.js` to resolve the signed source base, validate URL schemes, retrieve/verify blocks, and render native audio/video controls.
- [ ] Show fetching, unavailable, and verification-failure states with a normal download link.
- [ ] Prefer verified gateway range delivery for progressive playback. Be explicit whether verification happens at the gateway or in the browser.
- [ ] Do not feed arbitrary storage chunks to MediaSource; they are not codec segments. No transcoding/adaptive streaming requirement in this milestone.

Acceptance: real audio and video play and seek on desktop and mobile supported browsers; captions/text still render. Old clients show the body link rather than an invalid anblob player. Loading a feed must not eagerly download every video.

## W04 — Preserve existing anblob posts

- [ ] Keep the legacy anblob reader for immutable historical posts.
- [ ] Inventory existing blobs and retain their original endpoints/backups.
- [ ] If migrating bytes, reconstruct and verify the old file, add it to AndFS, and record old-ID → new-manifest mapping outside original signed messages.
- [ ] Never rewrite old signed metadata or assume the two hash encodings/manifests are interchangeable.
- [ ] Update `MEDIA_PROTOTYPE.md`, `AUDIO_VIDEO_PROPOSAL.md`, `AGENTS.md` and README to distinguish new AndFS writes from legacy reads.

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
