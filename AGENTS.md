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
2026-10-03, clarified on 2026-10-30 as a mountable full Wiredove application,
not just shared timeline components. Follow `SHARED_UI_WORK_ORDER.md`, the sole
application-embed plan. Both bootstraps must mount the same application runtime.

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
  at a time, beginning with a shared application instance and the real
  profile → post → thread → reply flow in both mounts.
- Ordinary website posts and public messages use `client/ui/message-view.js`.
  Website node extensions retain rich APDS controls and observer-bound content;
  edit-event summaries and services remain compatibility paths. The full shared
  widget migration and cross-client acceptance are not complete. See
  `client/README.md` for the current widget API and `SHARED_UI_WORK_ORDER.md`
  for the application migration and remaining acceptance.
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

## Git synchronization — standing instruction

Ev explicitly requested on 30 October 2026 that local work and GitHub stay synchronized. Sync is part of completing authorized work; do not wait for a separate push request.

- At session start, inspect `git status`, the current branch, remotes, and upstream. Fetch `origin` and compare local and remote commits before editing. Read incoming changes and updated agent/work-order instructions.
- Preserve uncommitted work before integrating incoming commits. Fast-forward when possible; otherwise reconcile both histories and resolve conflicts deliberately. Never discard local work, overwrite another agent's commits, or force-push to make a branch appear current.
- Use this repository's established default branch and upstream. Keep related repositories coordinated, but inspect each independently; do not blindly stage unrelated changes, secrets, identity backups, generated state, or private research data.
- Run checks appropriate to the reconciled changes and update work orders/handoffs to match observed behavior. Commit completed work in focused commits and push the intended branch to GitHub before finishing a change session, unless Ev explicitly asks to keep it local.
- Fetch again before pushing. If GitHub advanced, integrate the new commits, rerun affected checks, and retry a normal push. After pushing, verify the local HEAD equals the intended GitHub branch tip and inspect the remaining worktree status. Report the commit, branch, checks, and any remaining changes or divergence automatically.
- If authentication, network access, conflicts, failing checks, or unfinished work prevent synchronization, preserve the work and report the exact blocker. Do not claim synchronization from an attempted push or a stale remote-tracking ref. Clearly label any intentionally preserved unfinished checkpoint.
- A GitHub push is source synchronization, not permission to deploy services, publish public test messages, send email, or change production data. Existing release and publication rules still apply. Do not install background auto-pull jobs; sync at session boundaries and coordinated handoffs.

## Production release verified — 2026-10-30

Wiredove application `ce8c006` is deployed in detached worktree
`/root/wiredove-release-ce8c006`; wiredove.service retains port 8081, the existing
VAPID configuration and `/root/wiredove/data` symlink. Previous active release
`651ae37` and `/root/wiredove-service-before-ce8c006.service` are retained for
rollback. Original checkout production edits remain untouched. Server frozen-lock
check passed after pinning IDB 8.0.3 to npm and recording the pinned APDS build.
Local check, 38 unit tests, 12 media/artifact tests and the complete browser suite
passed. Public app.js, sw.js, style.css and application runtime hashes match the
release. Mobile 390px smoke showed no overflow or JavaScript exceptions. No public
fixture writes were sent. Reverse proxy unchanged and active.

Evbogue.com was already synchronized at `8690a4c` (documentation following deployed
application `2ce443b`); public timeline client/session/preview hashes match source.
No site reload was necessary. The planned replacement of its existing widget with
the full application mount remains separate unfinished work, not part of this release.

## Production release verified — 2026-10-31

Wiredove application `130420e` (refresh icon change `878d3f3`, plus the updated
warm-cache test assertion) is deployed at `/root/wiredove-release-130420e`.
Service port, VAPID configuration and shared data link are preserved. Previous
release `ce8c006` and `/root/wiredove-service-before-130420e.service` remain for
rollback. Original checkout production edits are untouched. Local build/check,
38 unit tests, 12 media tests and the full browser suite passed, including warm
cache and separate-origin application flows. Host frozen-lock check passed.
Public app.js, sw.js, style.css, navbar.js, route.js and client/application.css
SHA-256 hashes match the release. Live 390px screenshot review showed the refresh
icon and no overflow or JavaScript exceptions. Browser non-GET requests were
blocked; no public test messages were published. Both services active; proxy
unchanged. Evbogue.com post-only master `af31961` was also pulled and verified on
the public post, homepage and RSS feed without a process reload.

## Icon and card header regression — 2026-10-31

- `91c764b` changed `.message-meta` from absolute top-right positioning to a
  full-width row before `.message-main`, pushing avatars/authors below metadata.
  Its browser assertion explicitly required that new row, so passing tests
  preserved an unintended visual change.
- `471b996` introduced a 24px application icon override over the existing 18px
  default; `f97cbef` raised specificity and also displaced composer sizing.
- Restore 18px application icons and 21px composer icons. Shared message headers
  place author and metadata beside one another, wrapping when needed while keeping
  the avatar at the top. Keep layout assertions and screenshot review together;
  wait for shadow stylesheets before measuring geometry.
- Local Codex session logs associate the commits with model `gpt-6.1-sol`:
  `91c764b`: session `01a18b02-9bd5-78e1-ae44-714ceccd3953`;
  `471b996`: session `01a18dcf-13dd-7d82-93a1-6c64118b8ec4`;
  `f97cbef`: session `01a18e5f-1898-7af3-9705-ec2adba84789`.
  Git author fields alone do not identify an agent. These are session-level
  attributions from local logs, not evidence about all runs of a model.

Validation for this correction: build/frozen check, 38 unit tests, 12 media tests,
and the complete browser suite passed. Reviewed 390px website/light and 320px
embed/dark screenshots. Audio cards still expose a raw media URL and the
"Verified AndFS media" label; narrow reply previews split author/excerpt into
cramped columns. Those are separate follow-up observations, not fixed here.

## Hash-only media navigation — 2026-10-31

Ev requested ordinary hash routes for files instead of new `/media/<hash>` links.
New uploads now publish `/#<AndFS manifest hash>` URLs. The shared application
router handles these before alias lookup, verifies manifest/chunk bytes and
sniffs image/audio/video formats. Unknown formats offer a verified download;
ambiguous audio/video containers use a video player, which also supports audio.
Both application mounts use their configured media source. Preserve historical
`/media` readers, APDS image hashes, anblob readers and all signed historical bytes.
The `/api/media` upload API and `/blobs` transport remain service endpoints.
Inline/profile image resolution accepts both new hash URLs and historical URLs.
Composer draft previews resolve verified bytes rather than assigning page URLs
as native player sources.

Audio/video cards suppress only the exact generated trailing compatibility URL
from presentation and omit the technical success label. Signed content remains
unchanged. Shared reply previews wrap as text and use a font-independent arrow.
The pre-existing nested-reply indentation remains. These changes do not establish
full widget parity or update evbogue.com's separate application consumer.

## Production release verified — 2026-10-31 (hash routes and visual corrections)

Application `fcab6e8` is deployed at `/root/wiredove-release-fcab6e8`, including
icon/card corrections from `5a33892`. Previous release `130420e` and unit backup
`/root/wiredove-service-before-fcab6e8.service` remain for rollback. Only the unit's
WorkingDirectory changed; port 8081, VAPID configuration, shared data link,
original checkout edits and reverse proxy are preserved. Host frozen-lock check
passed; both services active and startup log clean.

Local build/check, 41 unit tests, 12 media tests and the full browser suite passed.
Mobile screenshot review covered website/light and embed/dark. Public app.js,
sw.js, style.css, application CSS, distributed router/AndFS/hash-media/media-render
and renderer hashes match the release. Live 390px light/dark checks showed 18px
navbar icons, avatars at header top, no overflow or JavaScript exceptions. An
existing stored WebP loaded and decoded through its `#hash` route in both themes.
Historical feed images also loaded with outgoing WebSocket traffic restricted to
hash read requests. HTTP non-GET requests were blocked; no public test posts or
uploads were sent. Warm-cache and separate-origin acceptance passed locally.

## Production release verified — 2026-11-01 (mobile composer keyboard)

Application `add5bea` is deployed at `/root/wiredove-release-add5bea`.
Previous release `fcab6e8` and unit backup
`/root/wiredove-service-before-add5bea.service` remain for rollback. Only the
unit's WorkingDirectory changed; port 8081, VAPID configuration, shared data
symlink, original checkout edits and reverse proxy are preserved. Host frozen-lock
check passed and both services are active with a clean startup.

Public app.js, sw.js, style.css, application CSS and source/distributed composer
dialog hashes match the release. Isolated 390px live light/dark browser checks
confirmed the shared composer dialog fits simulated visual-viewport keyboard
bounds (40–400px), with toolbar visible, no page overflow or JavaScript exceptions.
Reviewed the live light screenshot. HTTP non-GET and all WebSocket traffic were
blocked; no public test posts/uploads were sent. These checks simulate keyboard
geometry; real iOS/Android keyboard acceptance remains outstanding. The application
commit passed isolated build/check, 41 unit tests, 12 media tests and the complete
browser suite before deployment. Pre-existing local session/navbar edits remain
unfinished and excluded from this release.

## Production release verified — 2026-11-01 (composer image flow)

Application `cd7c09e` is deployed at `/root/wiredove-release-cd7c09e`, including
removal of the raw-text composer toggle and separate image attachment cards.
Previous release `add5bea` and `/root/wiredove-service-before-cd7c09e.service`
remain for rollback. Only the service WorkingDirectory changed; port 8081,
VAPID configuration, shared data symlink, original checkout edits and reverse
proxy are preserved. Host frozen-lock check passed; both services are active
and the startup log is clean.

Public app.js, sw.js, style.css, composer.js, application CSS, image uploader,
composer dialog and distributed composer/uploader/CSS/manifest SHA-256 hashes
match the release. Isolated 390px light/dark browser checks loaded the live shared
modules, mocked upload persistence and supplied local verified AndFS fixture
blocks. Upload inserted only the Markdown hash reference; Preview decoded the
verified image with no attachment cards, page overflow or JavaScript exceptions.
Reviewed the live dark screenshot. Non-GET HTTP and all WebSocket traffic were
blocked; no production upload/post was written. Before release, build/check,
41 unit tests, 13 media tests and the full browser suite passed, including the
new image-flow regression, separate-origin application and warm-cache upgrade.


## Production release verified — 2026-11-01 (legacy compatibility)

Application `f634698` is deployed in `/root/wiredove-release-f634698`, including
shared legacy anblob reader/service selection, cross-origin legacy blob GET/HEAD
headers and shared old compose/reply routes. Previous release `e9c11c5` and unit
backup `/root/wiredove-service-before-f634698.service` remain for rollback. Only
WorkingDirectory changed; port 8081, VAPID configuration, shared data symlink,
original checkout edits and reverse proxy remain intact. Host frozen-lock check
passed; both services are active with clean startup.

Fresh local build/check, 41 unit tests, 14 media tests and the complete browser
suite passed. Isolated actual serve.js GET/HEAD checks verified exact legacy bytes,
length and CORS headers. Public app.js/sw.js/style.css/serve.js, application CSS,
legacy reader/default session/media/render/router and distributed reader/manifest
hashes match the release. Live isolated 390px light/dark smoke showed the shared
app and refresh control with no overflow or JS exceptions; dark screenshot reviewed.
HTTP writes and all WebSockets were blocked; no public fixtures were written.
Production data/blobs was empty, so successful live stored legacy playback was not
claimed. Evbogue.com's compatibility source `59c2b67` (pin `a078b53`) still needs
its own deployment; none was performed here. Historical availability, broader
format/profile-photo and physical-device acceptance remain separate follow-up work.
