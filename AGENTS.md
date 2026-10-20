# AGENTS.md

## Purpose

This file records project context and session-specific lessons so future agents do not repeat failed work.

## Repository basics

- Repository: `evbogue/wiredove`
- Default branch: `master`
- Audio/video planning document: `AUDIO_VIDEO_PROPOSAL.md`
- The current first milestone is intentionally small:
  `record/upload → blob → ANProto artifact → fetch → verify → play`

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

## AndFS migration work order

Ev requested new media use AndFS on 2026-09-17. Follow `WORK_ORDER.md` for this migration. The architecture below describes the existing anblob implementation, which must remain readable for old signed posts; it is not the target for new writes.

## Audio/video architecture

ANProto now has content-addressed blob support in the ANProto repository.

Relevant concepts:

- Small blobs are raw SHA-256-addressed blobs.
- Large blobs are deterministic 1 MiB chunks plus a hashed manifest.
- `putBlob()`, `getBlob()`, `verifyBlob()`, `downloadBlob()`, and `streamBlob()` exist.
- Media artifacts should contain references such as:
  `{ type: "video", blob: "...", mime: "video/webm" }`
- The media artifact still needs to go through Wiredove's existing ANProto signing/publishing path. The helper that constructs a media artifact does not itself sign it.
- Do not rely on ANProto's demo in-memory HTTP blob endpoint for production storage; it is ephemeral.
- Do not overclaim universal progressive browser playback. Arbitrary 1 MiB storage chunks are not guaranteed to be valid MediaSource segments.

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
- Current code is not yet compliant: website rendering and client widget rendering
  are separate. Do not describe the planned restructuring as completed.
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
  signing, publication, and identity. Onboarding and later edits use the same editor.
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
