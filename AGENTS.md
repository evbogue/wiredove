# AGENTS.md

## Purpose

This file records project context and session-specific lessons so future agents do not repeat failed work.

## Repository basics

- Repository: `evbogue/wiredove`
- Default branch: `master`
- Audio/video planning document: `AUDIO_VIDEO_PROPOSAL.md`
- The current first milestone is intentionally small:
  `record/upload → AndFS → signed ANProto artifact → fetch → verify → play`

## Product direction

Wiredove is the user-facing product layer.

ANProto should remain a small authentication/provenance layer rather than becoming “SSB 2.”

For media:

- Wiredove owns the media UX.
- ANProto authenticates the artifact / statement.
- Blob hashes authenticate the bytes.
- Storage and transport are replaceable.
- SSB may be one backend, but SSB feature parity is not the goal.

The broader project direction is sustainable, portable internet fame rather than protocol completeness for its own sake.

## Preserve legacy blobs — compatibility requirement

Ev explicitly confirmed on 2026-10-21 that legacy blob support must remain for
historical content, even when new uploads move to AndFS.

- Preserve APDS image blobs: data URLs stored by `apds.make()` and referenced by
  their original hashes in Markdown (`![](hash)`), including profile images.
- Preserve historical `blob: anblob:v1:...` audio/video and its legacy reader,
  storage, endpoints, and backups.
- Do not delete legacy readers or stored blobs as AndFS cleanup. Never rewrite
  signed historical posts or reinterpret legacy hashes as AndFS manifest hashes.
- Any future upload migration changes new writes only; verify historical image
  and audio/video reads alongside the new path.

New post image uploads in `upload.js` use AndFS through the shared signed upload
client. Multiple inline images retain Markdown `![](media_url)` references; the
signed body authenticates each manifest hash embedded in its URL. The shared
`client/ui/inline-image.js` reader verifies those blocks before display in both
website and embeds. New profile photos also use the shared AndFS upload helper:
retain the original bytes and a separate square PNG crop (up to 1024 px, without
upscaling). Signed profile metadata uses `image` for the cropped URL,
`image_original` for the original URL, and versioned `image_crop` settings.
Preserve all three when publishing later profile edits. The shared Cropper.js UI
supports drag/pinch, rotation, a circular preview and re-cropping from the original.
Historical APDS image references and anblob media remain supported.

## Audio/video architecture

New audio/video uploads use the pinned AndFS v1 implementation in `vendor/andfs/`. Keep its upstream files unchanged. Use explicit `createAndFS({ store })` instances and the `{ type, andfs, mime, media_name, media_size, media_url, media_source }` signed metadata contract. The upload endpoint requires an ANProto signature over the exact authorization JSON and persists verified blocks. Old `blob: anblob:v1:...` posts must continue to use the legacy reader; never reinterpret or rewrite their IDs.

Follow `WORK_ORDER.md` for the remaining migration and cross-client acceptance work. The Wiredove UI verifies AndFS blocks before playback. The server also provides a verified byte-range media endpoint; native storage chunks are not codec segments, and there is no transcoding or adaptive streaming.

## Mockup / image upload lesson

A generated Wiredove audio/video UI mockup exists in the ChatGPT session as the original PNG:

`dark_wiredove_feed_with_audio_and_video.png`

The intended repository location is:

`docs/wiredove-audio-video-concept.png`

### Important: do not repeat the failed upload approach

The ChatGPT GitHub connector available in this session can write UTF-8 text and can create Git blobs from supplied text/base64, but it cannot directly stream a local/conversation binary file into the repository.

Attempts to manually transfer the ~1.3 MB PNG as base64 through connector calls were blocked by tool/safety payload limits. Earlier attempts that tried to work around this produced a corrupt/truncated JPEG.

Therefore:

- Do not convert or resize the original just to get it through the connector unless the user explicitly asks for that.
- Do not claim the PNG has been uploaded unless GitHub confirms the actual repository path exists.
- Do not create a fake GitHub URL before the path exists.
- Prefer a GitHub-capable environment that can upload binary files directly (local git, GitHub CLI, Work/computer environment, or a connector/tool that explicitly accepts binary/file references).
- Preserve the original PNG byte-for-byte when it is eventually uploaded.

A `.upload-parts/` directory currently exists in the repository from a failed chunk-staging attempt. Treat it as a failed workaround, not part of the intended architecture.

## UI reference lesson

When making UI mockups for Wiredove, use an actual Wiredove screenshot as the visual basis when the user asks for fidelity to the real product. Do not invent a generic social-feed UI and call it Wiredove.

## Working style

Prefer implementation over long planning documents when the next step is clear.

For substantial code changes, inspect the current repository structure first rather than assuming how Wiredove imports ANProto or publishes artifacts.

Keep scope tight: prove the simplest working media path before adding transcoding, adaptive bitrate, live streaming, CDN logic, or a custom media stack.

## Shared UI architecture requirement

Ev requested a single shared UI implementation for the website and embeds on
2026-10-03. Follow `SHARED_UI_WORK_ORDER.md` for the restructuring.

- Both application frames must consume the same individually importable rendering
  and UI widgets. The website is the primary consumer, not a parallel renderer.
- Frames own layout, top-level navigation, adapter selection and capability settings.
  Shared widgets own message, media, feed, thread, profile, search and composer UI.
- Put fixes in shared modules. Do not copy rendering code into a frame or maintain
  separate website/embed versions of body formatting, media or composer behavior.
- Keep verification/normalization and service contracts shared; storage, identity,
  transport and moderation policy may be supplied through explicit adapters.
- Public widget imports must not boot the website, initialize its identity/storage,
  register its service worker, or require its import map.
- Preserve website features and immutable signed bytes. Migrate one vertical slice
  at a time, beginning with shared message/media widgets used by both frames.
- Ordinary website posts and public messages use `client/ui/message-view.js`.
  Website node extensions retain rich APDS controls and observer-bound content;
  edit-event summaries and services remain compatibility paths. The full shared
  widget migration and cross-client acceptance are not complete. See
  `docs/SHARED_MESSAGE_HANDOFF.md` for the current host API and limitations.
- Require cross-frame behavior checks and an observed separate-origin browser embed
  before claiming full shared-widget acceptance. Unit tests alone do not prove it.

## Production deployment (verified 2026-10-20)

- SSH: `ssh root@evbogue.com`. Read `/root/AGENTS.md` for host operations.
- Public site: `https://wiredove.net/`; backend port: `8081`.
- Service: `wiredove.service`, unit: `/etc/systemd/system/wiredove.service`.
- HTTPS uses the existing custom Deno `reverse-proxy.service`, not nginx/Caddy.
  `/root/reverse-proxy/domains.json` maps `wiredove.net` to `8081`.
  Ordinary Wiredove releases do not require proxy, DNS, or certificate changes.
- `/root/wiredove` is the original checkout and contains production-only edits.
  Preserve it; do not reset/clean it or overwrite its `serve.js`/`style.css`.
- Releases use detached Git worktrees: `/root/wiredove-release-<short-sha>`.
  Inspect `systemctl cat wiredove.service` to discover the active release;
  do not assume the newest directory is active. Last deployed application commit
  in this session: `d98b0bb`.
- Runtime configuration: `PORT=8081` and
  `VAPID_CONFIG_PATH=/root/wiredove/config.json`.
  Each release's `data` symlinks to `/root/wiredove/data` so notification state,
  subscriptions, and stored media survive release changes. Do not copy repository
  defaults over production configuration or log its secrets.

Deployment procedure:

1. Inspect local Git status and fetch origin. Preserve unfinished work. A divergent
   checkout with media edits is not automatically the release to deploy; use the
   reviewed commit. Do not resolve unrelated merge conflicts as part of deployment.
2. Run relevant checks and browser flows, commit the intended changes, and push to
   GitHub. A push alone does not deploy this server; no automatic production deploy
   workflow is configured in the repository.
3. On the host, fetch in `/root/wiredove`, then create a new detached release:
   `git worktree add --detach /root/wiredove-release-<short-sha> <full-sha>`.
   Link its `data` to `/root/wiredove/data` and run `deno check serve.js` there.
4. Back up the current service unit. Change only its `WorkingDirectory` to the new
   release, keeping the runtime environment and permissions intact. Run
   `systemctl daemon-reload` and `systemctl restart wiredove.service`.
5. Confirm `systemctl is-active wiredove.service reverse-proxy.service`, inspect
   `journalctl -u wiredove.service -n 20 --no-pager`, and check public HTTP responses.
   Compare important live JS/CSS files with the reviewed release using SHA-256;
   HTTP 200 alone does not prove the new version is deployed.
6. Smoke-test the live UI at mobile width. Retain the previous release and unit
   backup. Roll back by restoring the previous `WorkingDirectory`/unit, reloading
   systemd, restarting Wiredove, and verifying the public site again. Code rollback
   does not undo published signed updates or data migrations.

For local evaluation, run `PORT=8000 deno run --allow-net --allow-read --allow-write --allow-env serve.js` from the chosen checkout. Use another free
port and an isolated browser context when testing a fresh identity.

## Identity and profile implementation lessons

- New identities must have an editable profile before their first post. Do not
  gate the profile header on finding a rendered author message.
- `client/ui/profile-editor.js` owns shared editor fields and photo cropping;
  `client/ui/profile-links.js` owns link editing/rendering. Frames provide storage,
  signing, publication, and identity. `uploadProfilePhoto()` in `upload.js` uses the
  same AndFS uploader as post images; `profile_image.js` resolves both verified
  AndFS URLs and legacy APDS hashes for website avatars. Onboarding and later edits use the same editor.
- At the pinned APDS version, `compose()` overwrites explicit name/image metadata
  with local values. Profile updates construct the intended metadata with
  `createYaml()` and `sign()`, retaining the previous-message reference. Check the
  signed payload, not only the optimistic preview, when testing metadata changes.
- APDS normally persists hash/opened indexes on a timer. A successful profile save
  explicitly flushes them before reporting success so immediate reload is safe.
  Recheck this behavior if upgrading APDS.
- Empty bio is an explicit signed value. Distinguish missing metadata from an empty
  string, and stop searching older history once an explicit empty bio is found.
- Identity backups contain secret keys. Never commit, screenshot, or log them.
  Test import in memory/isolated contexts; validate signing against the public key
  before accepting a backup. Keep backup download accessible from Settings.

## Browser testing and UI verification

- `tests/profile-setup.browser.js` is a Playwright suite function, run through the
  browser testing tool against a local server. It uses isolated contexts so it
  cannot replace the user's active identity. See `client/README.md` for coverage.
- Localhost uses the normal network transport: publishing from a local UI can
  broadcast public signed updates. Use clearly named test identities, minimal
  fixtures, and never use the user's real identity for automated publication tests.
- Check mobile and desktop, light and dark themes, keyboard focus, empty states,
  save/cancel, invalid links, photo crop, backup import, and immediate reload.
  Review screenshots as well as accessibility snapshots: passing interactions do
  not prove the layout looks correct.
- Reset inherited flex properties when moving inputs into vertically stacked
  labels. A leftover `flex-basis: 120px/200px` made link inputs excessively tall.
- `sw.js` caches app assets with stale-while-revalidate. Account for service-worker
  cache updates when deploying UI changes; bump the shell cache version for a
  coordinated refresh. Test warm-cache upgrades as well as fresh contexts, and
  never clear browser identity storage just to refresh the application.

## Reproducible local acceptance (2026-10-29)

- The application still runs on Deno. Root npm metadata supplies pinned Playwright
  and test scripts only; it does not implement the planned Node server migration.
- Run `npm ci`, `npx playwright install chromium`, `npm run check`, `npm test`,
  `npm run test:media`, and `npm run test:browser`. CI uses Node 22 and Deno 2.7.13.
  On Linux, install browser libraries with Playwright's `--with-deps` option.
- `deno.json` uses `nodeModulesDir: none` so installing npm test tooling does not
  redirect Deno's `npm:web-push` dependency resolution into that tooling directory.
  Its import map pins explicit APDS compilation targets and the already-vendored
  ANProto revision; target-dependent CDN wrappers failed a clean-cache lock check.
  Commit both dependency lockfiles; keep node_modules out of Git and Docker context.
- The browser suite includes real website `render.meta` shells, edit summaries,
  reply previews and embed callbacks, plus separate-origin and warm-cache checks.
  Screenshot review must disable animations so fade-in does not hide layout errors.
  These checks do not establish complete shared-message feature parity.
- Website composer notifications now follow persistence and exact-content
  availability checks. One ntfy message-hash link and browser Web Push are attempted
  independently. Notification failure must not turn successful publication into a
  failed draft. Tests mock all notification/relay writes; do not publish public tests.
- `scripts/monitor-posts.js` is a read-only one-shot monitor with an atomic cursor,
  verified message-ID deduplication and an overlap lock. See NOTIFICATION_WORKFLOW.md
  for baseline, retry, retention and stale-lock behavior. State belongs under data/.
