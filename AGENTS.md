# AGENTS.md

## Purpose

This file records project context and session-specific lessons so future agents do not repeat failed work.

## Repository basics

- Repository: `evbogue/wiredove`
- Default branch: `master`
- Audio/video planning document: `AUDIO_VIDEO_PROPOSAL.md`
- The current first milestone is intentionally small:
  `record/upload → AndFS → signed ANProto artifact → fetch → verify → play`

## Current runtime — Node 22+ (2026-11-04)

`npm ci && npm start` runs the Node application; Deno is an optional launcher.
Both consume `server/handler.js`. Commands, data/config preservation and release
procedures live in [docs/RUNTIME_OPERATIONS.md](docs/RUNTIME_OPERATIONS.md).
Earlier Deno-only procedures below are historical. Last recorded Node cutover:
`0086c74`; this is dated evidence, not a fresh host observation.

## Agent publishing quick reference

Read [docs/AGENT_PUBLISHING.md](docs/AGENT_PUBLISHING.md) for the tested Node workflow,
private identity recovery, previous-message links, exact signed retries and delivery
verification. This is guidance, not authorization for public posts. Never commit
private signing keys or private backup links/identifiers.

## Product direction

Wiredove is the user-facing product layer.

ANProto should remain a small authentication/provenance layer rather than becoming “SSB 2.”

Synchronization exists so a peer can catch up on what it cares about: follow
the heads of the authors and threads it follows, walk each chain back until
reaching a post it already has, then stop. Peers hold different slices of the
network; the per-author chain is what makes each peer's slice verifiable.

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

New audio/video uploads use the pinned AndFS v1 implementation in `vendor/andfs/`. Keep its upstream files unchanged. Use explicit `createAndFS({ store })` instances and the `{ type, andfs, mime, media_name, media_size, media_url }` signed metadata contract — new writes omit `media_source` (signed URLs are `/#<AndFS manifest hash>`, origin-free). Historical signed `media_source` values remain valid for those records and take precedence when readers resolve them. The upload endpoint requires an ANProto signature over the exact authorization JSON and persists verified blocks. Old `blob: anblob:v1:...` posts must continue to use the legacy reader; never reinterpret or rewrite their IDs.

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
not just shared timeline components. Both bootstraps mount the same application runtime. See `client/README.md` for
the API and `docs/BEHAVIOR_MATRIX.md` for coverage and remaining limitations.

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
  `client/README.md` for the current widget API and `docs/BEHAVIOR_MATRIX.md`
  for observed coverage.
- Require cross-frame behavior checks and an observed separate-origin browser embed
  before claiming full shared-widget acceptance. Unit tests alone do not prove it.

## Production deployment (verified 2026-10-20) — historical, Deno-only procedure

> **Superseded 2026-11-04.** The Wiredove application service now runs Node
> (`/usr/bin/node serve-node.js`, release `0086c74`); Deno remains only for
> independent host services (reverse proxy) and optional compatibility. The
> current cutover/rollback procedure is in `docs/RUNTIME_OPERATIONS.md`
> ("Production cutover and rollback"). The host facts below (SSH, ports, data
> symlink, detached release worktrees, VAPID config path) remain valid; the
> Deno deployment steps are history.

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

> The numbered steps below are preserved verbatim as dated evidence of the
> 2026-10-20 Deno procedure and are not to be followed. The current
> cutover/rollback procedure is in `docs/RUNTIME_OPERATIONS.md`.

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
- Evidence provenance: "live 390px" in the dated release notes below means
  isolated live-site checks served to the emulated Chromium browser
  (Playwright), not a physical device or Safari run. Physical-device
  acceptance remains open — see the unchecked physical Safari/mobile item in
  `docs/BEHAVIOR_MATRIX.md`. (Audited 2026-11-04; the two
  unqualified "Live 390px" occurrences below are annotated in place.)
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

## Reproducible local acceptance (2026-10-29) — superseded

> **Superseded 2026-11-04** by the completed Node migration: the application
> server runs on Node 22+ by default (`npm ci && npm start`), with Deno
> retained as an optional compatibility launcher (`npm run start:deno`).
> The statements below about the application "still" running on Deno and the
> planned-but-unstarted Node server migration are outdated. Current
> instructions: the "Current runtime" section near the top of this file.

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
SHA-256 hashes match the release. Live 390px screenshot review (emulated
Chromium browser, not a physical device) showed the refresh
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
and renderer hashes match the release. Live 390px light/dark checks (emulated
Chromium browser, not a physical device) showed 18px
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


## Production release verified — 2026-11-01 (shared profile/settings/control widgets)

Application `2992b9d` is deployed at `/root/wiredove-release-2992b9d`, with the full
profile/settings and rich message-control widgets in client/ui and thin website
service adapters. Previous release `f634698` and unit backup
`/root/wiredove-service-before-2992b9d.service` remain for rollback. Only the unit's
WorkingDirectory changed; port 8081, VAPID configuration, shared data symlink,
original checkout edits and reverse proxy are intact. Host frozen-lock check passed;
both services are active with clean startup. Public app/sw/style, profile/settings
adapters, renderer, three widgets and distribution manifest hashes match.

Evbogue.com `65c8175` pins the same application (181 byte-identical files) and is
also deployed. Full timeline-data backup:
`/root/deploy-backups/evbogue-timeline-before-widgets-65c8175.tar.gz`. Its original
tmux command/environment and private production files are preserved. Source and
live hash verification are recorded in the site's Agents/DEVOPS.md.

Local build/check, 41 unit tests, 14 media tests, full browser suite and standalone
profile-links suite passed. Real two-origin acceptance covers photo original/crop
metadata/bytes, empty bio, history links, reload/re-crop, identity validation in memory,
scoped settings refresh, edit versions and hide/unhide without changing originals.
Reviewed local profile/message screenshots. Live public profiles at 390/1200px in
light/dark mounted without overflow or JS exceptions; reviewed site/mobile dark and
website/desktop light. HTTP writes and WebSockets were blocked, so expected sync/
missing-image statuses do not prove full live media availability. No public fixture
writes or secret downloads occurred.

Accessibility changes are deferred at Ev's request. Discovery, post-image cursor/
service fixes, a static example and the site's historical-image limit patch remain
preserved in named local Git stashes, outside this release. Restore selectively;
do not blindly reapply the old whole-batch stash over the new extraction. Full
shared-application/device/history acceptance is not claimed.


## Dual application runtimes — 2026-11-03

- `npm ci && npm start` launches Node 22+ via `serve-node.js`. Deno remains
  available through `npm run start:deno`; both consume `server/handler.js`.
- Server filesystem APIs use Node built-ins supported by both runtimes. Node
  server imports are local or npm; no Deno or runtime CDN imports are needed.
- Run `npm run check:node`, `npm test`, `npm run test:server`. The server tests
  include actual HTTP, persistence/restart, signature/media verification and
  private-path checks. Enable `TEST_DENO_PARITY=1` for Node → Deno → Node fixtures;
  `DENO_EXECUTABLE` may select the Deno binary.
- `WIREDOVE_TEST_RUNTIME=node npm run test:browser` runs the real application
  acceptance against the production Node handler; existing default uses Deno.
- Keep the same working directory, port, data and VAPID paths when switching.
  Stop the old application first: no concurrent Node/Deno writers to shared data.
  Do not rotate existing VAPID keys; malformed/incomplete config stops startup.
- Static routes no longer use deno.land. Both runtimes reject directory listings,
  dotfiles, node_modules and private/outside symlink targets, and support HEAD,
  conditional reads and single ranges. Dynamic route precedence remains shared.
- Docker, deployed services and the independent Deno reverse proxy remain as
  recorded above. A source push does not authorize or perform production cutover.

## Production release verified — 2026-11-04

Application `cf7aeba` is deployed in `/root/wiredove-release-cf7aeba`. The service
continues using Deno; Node runtime cutover was not included. Only WorkingDirectory
changed. Port 8081, VAPID configuration, shared data symlink, original checkout
production edits and reverse proxy are preserved. Previous release `2992b9d` and
`/root/wiredove-service-before-cf7aeba.service` remain for rollback. Host frozen-lock
check passed; both services are active with clean startup.

Local check, Node check, unit/media/server tests (including Node → Deno → Node
persistence parity) and the full browser suite passed. Reviewed local mobile and
live 390px dark screenshots. Public app.js, sw.js, style.css, serve.js, shared
handler/static modules, image uploader, network queue and distribution manifest
match the release byte-for-byte. Live isolated 390px light/dark checks found no
horizontal overflow or JavaScript exceptions. HTTP writes and all WebSockets were
blocked; no public test posts/uploads were sent. Evbogue.com's separate consumer
was not changed by this deployment.


## Portable signed media references — 2026-11-04

New media writes use `/#<AndFS manifest hash>` without a hostname or signed
`media_source`, including inline Markdown and profile original/crop references.
The earlier absolute `https://wiredove.net/#hash` format still coupled records to
an origin; it was not portable. Shared readers use the application's configured
mediaURL, passed as baseURL to reader adapters. Standalone HTTP-loaded widgets
fall back to their module origin. Keep historical absolute URLs/APDS/anblob
readers and signed bytes intact. Muse's separate adapter has the same write-format
fix and preserves exact historical pending signatures/references on retry.
See docs/SECOND_NODE_RECOVERY.md. Source changes do not imply deployment or storage
replication; a selected node must supply the verified blocks.

## Production release verified — 2026-11-04 (portable media)

Application `ac8fb9e` is deployed in `/root/wiredove-release-ac8fb9e`. Only the
service WorkingDirectory changed; Deno runtime, port 8081, VAPID configuration,
shared data link, original checkout production edits and reverse proxy are intact.
Previous release `cf7aeba` and `/root/wiredove-service-before-ac8fb9e.service`
remain for rollback. Host frozen-lock check passed; both services active and
startup clean.

Public app/sw/style, shared AndFS/image/gallery/media/profile modules,
composer/render/media/Markdown/profile adapters and distributed manifest/reader/
renderer files match the release byte-for-byte. Isolated live 390px light/dark
checks found no overflow or JavaScript exceptions; dark screenshot reviewed.
The live upload client with mocked persistence produced `/#hash` with no signed
media_source, and portable metadata selected an alternate configured reader
origin. HTTP writes and WebSockets were blocked; no public test posts/uploads
were sent. Pre-release check/Node check, 45 unit tests, 14 media tests, 18 server
tests including runtime restart parity and the complete browser suite passed.
Muse adapter source `6b8a178` is synchronized separately (80 tests passed);
evbogue.com's separately pinned application was not updated in this deployment.

## Empty-body profile statement rendering — 2026-11-04

The reported Muse statement `IODOsK+3+VuPx4bzmSa11w7ZC1hXC9aZWT59a1qgZ9Q=`
contains name/image metadata and no body. The website previously skipped both its
nonempty-bio and body branches, leaving Notes and never applying profile metadata.
`client/ui/profile-update.js` now supplies one shared card for website and public
message views. Name/photo-only, explicit empty bio and links-only statements render
as profile updates; body/reply/edit/media/event statements retain their own paths.
Website names apply before photo retrieval, and empty-body statements apply avatars.
Photos use the existing verified gallery and retry state; historical URLs and signed
bytes remain intact. Service-worker shell version is v34-profile-updates.

Build/frozen check, 46 unit tests, 14 media tests and browser acceptance passed
(the final application-flow test was rerun after correcting its async YAML fixture).
Separate-origin public widgets and both full application mounts cover missing-photo,
empty-bio and link handling. Disposable exact-shape signed records use only the local
archive and assert unchanged signatures/content. Reviewed 390px website/light and
embed/dark screenshots. No public fixture posts/uploads or deployment were performed.

## Production release verified — 2026-11-04 (profile update cards)

Application `837df34` is deployed at `/root/wiredove-release-837df34`. Only the
service WorkingDirectory changed. Deno runtime, port 8081, VAPID config, shared
data link, original checkout edits and reverse proxy are intact. Previous
release `ac8fb9e` and `/root/wiredove-service-before-837df34.service` remain for
rollback. Host frozen-lock check passed; both services active with clean startup.
Public app/sw/style/render, shared profile-update/message-view and corresponding
distributed modules/style/manifest match the release byte-for-byte.

Isolated live 390px light/dark checks rendered the exact reported Muse statement
as Updated profile with Display name: Muse, without overflow or JS exceptions.
The original signature/content were fetched through read-only relay hash lookups,
verified locally and supplied via a mocked archive GET in the isolated browser;
HTTP writes and WebSockets were blocked. No production post/upload was written.
Dark screenshot reviewed. Pre-release build/frozen check, 46 unit tests, 14 media
tests and browser acceptance passed, including separate-origin profile cards and
unchanged exact signed statements. Evbogue.com's separate pinned app is unchanged.

## Compact inline image status — 2026-11-04

The shared gallery collapses pending/unavailable thumbnails into Material Symbols:
progress_activity while loading/requesting, image + refresh when unavailable.
Status text remains in accessible labels/tooltips; either unavailable-image control
retries inline rather than opening an empty viewer. Loaded thumbnails keep the
normal gallery/viewer behavior. Paused requests do not spin and retain retry.
The explicit full viewer still has detailed status text. Standalone galleries
load the pinned bundled icon font without booting the application.

The existing intersection observer defers assigning src; native image loading is
eager once assigned because pending images are hidden until decoded. Native lazy
loading of a hidden pending image prevented previews from decoding. Shell cache
is v35-inline-image-status. Queue/browser checks cover compact geometry, symbol
states, retry, byte arrival, separate-origin widgets and warm-cache preservation.

Validation: build/frozen check, 46 unit tests and the complete browser suite
passed. Reviewed the mobile pending/requested symbol screenshots and missing-photo
embed/dark profile card. No public fixture writes or production deployment.

## Production release verified — 2026-11-04 (inline image symbols)

Application `a25a0be` is deployed in `/root/wiredove-release-a25a0be`. Only the
service WorkingDirectory changed; Deno, port 8081, VAPID configuration, shared
data link, original checkout edits and reverse proxy are preserved. Previous
release `837df34` and `/root/wiredove-service-before-a25a0be.service` remain for
rollback. Host frozen-lock check passed; both services active with clean startup.
Public app/sw/style, gallery JS/CSS, profile-update module, distributed gallery
JS/CSS and manifest match the release byte-for-byte.

Isolated live 390px light/dark checks used live modules and in-memory verified
AndFS fixture blocks. Missing photos showed a compact symbol row under 44px tall;
refresh click and placeholder keyboard Enter retried inline, progress_activity
appeared while held, and verified arrival expanded the photo. No overflow or JS
exceptions; dark screenshot reviewed. HTTP writes and all WebSockets were blocked,
so no production fixture uploads/posts were made. Pre-release build/frozen check,
46 unit tests and full browser acceptance passed. Evbogue.com's separate pinned
application remains unchanged.

## Node application migration completed — 2026-11-04

Wiredove application `0086c74` is deployed at `/root/wiredove-release-0086c74`.
`wiredove.service` now uses `/usr/bin/node serve-node.js` (Node 22.22.0).
WorkingDirectory and ExecStart changed; port 8081, VAPID config, shared data,
original checkout production edits and reverse proxy remain intact. Deno remains
an optional application launcher and is still required by independent host services.

Rollback release: `/root/wiredove-release-a25a0be`. Private unit and complete
persistent-data/config backup: `/root/deploy-backups/wiredove-node-0086c74/`.
Stop Wiredove, restore its saved wiredove.service to `/etc/systemd/system/`,
daemon-reload, start and verify. Keep the Deno executable. No data schema changed.

Local check, 46 unit tests, 14 media tests, 18 server tests including Node → Deno →
Node restart parity, optional Deno check/media tests and the full browser suite
with the real Node application backend passed. The monitor regression also uses
the default local pinned protocol/YAML path, without remote module imports.
Host clean production install, Node check and 17 server tests passed. Isolated
loopback staging reused a private config copy and retained keys across restart.
CI Node 22/24 and Docker image jobs passed; Docker checks non-root startup,
health and VAPID persistence across container restart.

After cutover, all 112 live persistent files matched the private backup byte for
byte. Public app/sw/style, Node entry point, handler/static and distribution
manifest SHA-256 hashes matched source. Isolated live 390px light/dark smoke found
no overflow or JavaScript exceptions; dark screenshot reviewed, historical feed
images displayed. HTTP writes and all WebSockets were blocked. No public fixture
posts/uploads or notification writes were sent. Both services active, Node startup
clean. Runtime operation and Docker commands: docs/RUNTIME_OPERATIONS.md.

DENO_TO_NODE_WORK_ORDER.md is retired. The independent multi-site TLS proxy/HTTP
redirect migration and other host Deno applications are explicitly outside the
completed application scope; see docs/HOST_PROXY_WORK_ORDER.md for observed
inventory, owner/target and separate-release requirements. They have not migrated.

## git-ssb synchronization — all projects

Ev explicitly requested on 1 November 2026 that all projects also be pushed to git-ssb. This applies to every project in this workspace, alongside the GitHub synchronization requirement above. Pushing authorized source changes to git-ssb is part of completing the work; do not wait for a separate push request.

- Inspect each project's `ssb` remote independently. If it is missing, locate the existing git-ssb repository or create one using the local sbot workflow documented in `ssbc/AGENTS.md`, then configure the remote. Do not silently skip git-ssb or create duplicate repositories when an existing one can be found.
- Use our sbot's Git-over-HTTP endpoint (`http://127.0.0.1:8989/git/%25<repo-id>.sha256`), following the current local configuration. Replace legacy `ssb://` remotes with the corresponding HTTP endpoint; do not use the legacy `git-remote-ssb` helper.
- Fetch and compare the intended branch on both `origin` and `ssb` before integrating or pushing. Preserve local work and reconcile incoming commits from either remote. Use each project's established default branch and upstream; never assume every project uses `main`, discard commits, or force-push to synchronize histories.
- Push completed source changes to both GitHub and git-ssb before finishing a change session, unless Ev explicitly asks to keep the work local. Verify the intended branch tip on each remote against local HEAD after pushing; use a fresh remote query rather than relying on stale tracking refs.
- If sbot is unavailable, follow the documented local startup workflow and retry. If repository creation, authentication, connectivity, conflicts, or checks still block synchronization, preserve the work and report the exact blocker and which remote remains unsynchronized. Do not claim completion from an attempted push.
- Report the commit, branch, checks, and synchronization status for both remotes. Keep secrets, identity backups, generated state, and private research data out of source pushes. This instruction authorizes source synchronization; existing deployment and other publication rules still apply.

### Local git-ssb workflow

- From the workspace's `ssbc` checkout, run `npm run agent:preflight` to ensure sbot is listening on port 8989. Leave sbot running.
- If the remote is missing, query sbot's `messagesByType` for `git-repo` messages and compare repository IDs, authors, names, and known remotes. Names alone are not unique. Only create a repository when no existing match is found: run `node bin.js git.create <project-name>` from `ssbc`, then configure `ssb` with the returned HTTP URL. Remove surrounding JSON quotes and preserve URL encoding.
- Fetch both remotes again before pushing. If either advanced, reconcile incoming commits and rerun affected checks before a normal push. Push the intended branch to both remotes; never use force or mirror pushes.
- Verify local HEAD against fresh `git ls-remote --heads origin` and `git ls-remote --heads ssb` results for the intended branch. Re-read HEAD and worktree status afterward to catch concurrent changes. Report any remaining changes or divergence.
