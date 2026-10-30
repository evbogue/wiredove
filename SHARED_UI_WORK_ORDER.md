# Mountable Wiredove application work order

Updated 2026-10-30 following Ev's request for a full Wiredove JavaScript embed.
Status: milestone 1 implemented and accepted locally: shared application mount,
default verified archive/identity session, durable drafts/outbox and real two-author
website ↔ separate-origin embed flow. Milestone 2 is in progress with shared
cache/archive feed queries and refresh; milestones 3–4 remain open. Not deployed.
Source-review baseline: `6f8d213`. This is the sole shared UI/application-embed work
order. It replaces the earlier component-first plan, `client/WORK_ORDER.md`, and
`docs/SHARED_MESSAGE_HANDOFF.md`; historical evidence remains in Git history.
Existing widget API documentation lives in `client/README.md`.

## Outcome

Run the same Wiredove application on wiredove.net and inside another website's
DOM, without an iframe. The embed should provide Wiredove's experience, including
navigation, feeds, threads, profiles, search, composing, media, identity and settings.
Hosts select configuration and capabilities; they should not assemble application
behavior, calculate reply counts, coordinate publication, or reconstruct threads.

Use the full website's behavior as the baseline. Preserve useful shared widgets,
but do not reduce the website to today's smaller widget or build a third renderer.
Individually importable widgets remain supported for hosts that want only a piece.

## Diagnosis and starting points

- `app.js` calls `website-application.js`, which starts the shared APDS session and
  mounts the shared application with its default verified archive/identity session.
  Service-worker registration and legacy transport stay explicit website choices.
  The real first-flow acceptance is recorded in the final checkpoint below.
- `route.js:createRouter` now owns panels, feed orchestration and scroll state per
  application through root/navigation/scroll/controller dependencies. The website
  supplies a window-hash adapter; internal navigation has no host hash effects.
- `composer.js`, settings, profile and rendering paths still contain application
  behavior and global DOM dependencies. Audit their imports before moving code.
- `client/ui/widget.js` assembles a smaller application. Its default feed loader
  follows bounded author history; it cannot establish complete reply discovery.
- `client/ui/message-view.js`, body/gallery/media, profile editor, browser store and
  publishing session are reusable foundations. Website extensions and edit summaries
  retain richer behavior. `client/core/contracts.js` describes boundaries but does
  not implement the required website/backend adapters.
- evbogue.com's `timeline/client.js` and `session.js` supply routing, reply counts,
  refresh, identity and publication wiring. They also select publication appearance.
  Replacing that application glue with a mount call is a completion criterion.

## Target architecture and public boundary

Website bootstrap and JavaScript embed bootstrap both call one application factory.
That application owns shared screens, navigation state, subscriptions, drafts,
publication status and lifecycle. Services own verified data, identity/signing,
queries, storage, delivery, uploads and moderation. Adapters configure those services;
frames supply the mount root, URL policy, appearance and browser capabilities.

Proposed API (design target, not an existing export):

```js
import { mountWiredove } from 'https://wiredove.net/app-embed.js';
const app = await mountWiredove(document.querySelector('#wiredove'), {
  initialRoute: { type: 'profile', author: 'PUBLIC_KEY' },
  navigation: 'internal',
  theme: 'auto',
});
app.navigate({ type: 'post', id: 'MESSAGE_ID' });
await app.destroy();
```

The default is the Wiredove experience. Compact layout and restricted capabilities
are configuration, not alternate feature implementations. Publish a versioned,
self-contained module dependency graph with explicit asset URLs; do not require a
host import map or load the website bootstrap as an embed dependency. Imports are
inert; mounting explicitly starts the selected services.

Use an application Shadow DOM root to contain styles and DOM. Scope fonts, resets,
modals, popovers, focus handling and scrolling to the application. Do not modify the
host's body styles, global hash handlers, service worker or navigation by default.
Website URL routing and service-worker registration remain explicit bootstrap options.
Internal embed routing is the default; offer opt-in namespaced URL integration with
back/forward and reload restoration. Define durable canonical share/QR destinations
separately from the host's current URL.

State belongs to an instance. Audit APDS and other singleton dependencies; wrap or
refactor them explicitly rather than assuming a factory makes them independent.
If instances intentionally share storage or transport, use an explicit session with
reference-counted ownership, serialized signing and safe disposal. Namespaced storage
must preserve existing website identities and data. Never clear storage to migrate UI.

## Identity and backend boundary

A JavaScript embed executes under its host origin. Shadow DOM is not a security
boundary. It cannot read wiredove.net's stored identity, and host scripts share its
execution/storage context. Support explicit local identity creation/import/backup
with clear origin ownership. Automatic cross-origin identity continuity is not part
of the initial milestone; it needs a separate authorization/signing design.

Ship a working default backend adapter, not a requirement that every embedding site
implement `/timeline/api`. Inventory current relay/server capabilities and implement
missing endpoints or adapters for verified feeds, threads, profiles, search,
publication and media. Define query scope, pagination, subscription updates, missing
content and completeness honestly. An author-history walk is not global reply search.
An unsupported operation must not appear as successful empty results.

Expose backend/storage/identity overrides for advanced hosts. Verify signed records
before normalization or rendering; callback results are not automatically trusted.
Keep exact signed bytes and IDs. Separate local persistence, relay confirmation and
optional notification delivery; retry exact signed outbox entries without duplicate
publication. Browser recording and notifications require explicit capability handling.
Do not silently register a service worker on someone else's origin.

## Implementation sequence

Milestone 1 is complete within the explicit backend-archive scope below. Milestones
2–4 remain open. Complete vertical slices on both surfaces and record
observed results here. Do not finish every component extraction before proving a
mountable application. Do not claim a declaration, mock callback or screenshot proves
runtime parity.

### 1. Extract the application instance and prove the first real flow

- [x] Inventory current website routes/actions and global dependencies, including
  home, author, alias/community feeds, search, thread, edit, profile, settings,
  moderation, notification and sync behavior. Record ownership and parity below.
- [x] Extract explicit startup/disposal from app.js. Introduce root refs, instance
  route state and navigation/services dependencies. Adapt route panels, feed storage
  and orchestration; remove global selectors across this boundary.
- [x] Switch the website bootstrap to the extracted application while preserving
  existing routes, cached panels, scroll restoration and all unmigrated features.
- [x] Mount that same application in a separate-origin plain HTML host via Shadow DOM.
  Supply real local test services, not host-created posts or a simulated publisher.
- [x] Prove profile → post → thread → reply in both mounts, including identity setup,
  verified retrieval, reload, durable drafts, media and delivery status. Keep mounted
  playback/focus stable during updates. Include replies from a second author.

Acceptance: both mounts use the same application flow and services, with public writes
blocked and disposable identities. The host supplies configuration only. Existing
website behavior remains available; unfinished routes are tracked, not removed.

### 2. Complete application features through the same boundary

- [x] Share cache/archive home, author and search queries, live invalidation, cached
  route refresh and existing 25-row pagination; handle cancellation, stale snapshots
  and explicit offline refresh/retry in both mounts.
- [ ] Finish community directory/discovery and legacy backfill service boundaries,
  broader discovery/subscription semantics and advanced backend query adapters.
  Cache/archive queries do not establish global relay search or completeness.
- [ ] Consolidate composer reply/edit/text/image/audio/video/recording workflows,
  cursor image placement, upload failures, previews and cleanup. Preserve draft and
  outbox recovery across navigation, reload and identity setup.
- [ ] Complete profiles and history resolution, editing, links, original/cropped photo
  metadata, explicit empty fields and immediate reload durability.
- [ ] Complete edit summaries/history, moderation/stubs, async profiles/reply counts,
  timestamp updates, raw data, sharing/QR and author controls in shared modules.
- [ ] Complete identity import/export, settings, sync/delivery status and supported
  notifications. Document browser/host capability restrictions per feature.
- [ ] Retire website/widget bridges only after replacement behavior passes in both
  mounts. Keep existing public widget imports, elements and callbacks compatible.

Carry forward the outstanding raw/QR review: use native keyboard-accessible buttons,
accurate expanded state and instance-unique control IDs; resolve QR URLs explicitly
from the same canonical destination as permalinks. Commit coverage of exact encoder
input, loading failure/retry and repeated instances, across website and embed.

### 3. Replace the evbogue.com integration

- [ ] Independently inspect/sync the site repository and preserve its unfinished work.
- [ ] Replace timeline application glue with the mount API and configuration. Move
  reusable services upstream; keep only genuine site/backend policy in adapters.
- [ ] Preserve existing timeline links, owner-only compose policy, visitor replies,
  historical content and identity/draft storage with an explicit compatibility path.
- [ ] Pin coordinated source revisions. Provide a minimal static-host example that
  works without the site's custom server or application glue.

Acceptance: evbogue.com does not assemble screens, count replies, manage conversation
state or orchestrate publication refresh. Both it and wiredove.net consume the same
application release. Deployment is a separate authorized operation.

### 4. Acceptance and coordinated release

- [ ] Run common signed fixtures through both mounts: posts/replies/edits/profiles,
  ordering, duplicate delivery, missing content, moderation and verification failure.
- [ ] Exercise real local website ↔ embed publish/retrieve/reply/reload loops through
  isolated services, including outage, failed persistence and exact outbox retry.
- [ ] Test legacy APDS images/profile images and anblob audio/video alongside verified
  AndFS images/audio/video/profile photos, corrupt blocks and upload failures.
- [ ] Test desktop and 390/320px, light/dark, keyboard, focus, touch, denied permissions,
  unrelated host CSS/hash navigation, two instances, unmount/remount and route races.
- [ ] Inspect screenshots with animations disabled. Observe an actual separate-origin
  non-iframe embed. Test warm-cache upgrades without clearing identity storage.
- [ ] Track physical Safari/mobile recording/playback evidence separately; do not
  substitute Chromium automation for device acceptance.
- [ ] Run npm run check, npm test, npm run test:media and npm run test:browser, plus
  focused lifecycle and cross-repository integration checks appropriate to changes.
- [ ] Document mount API, versioning, backend/CORS/CSP requirements, identity origin
  behavior, capability limits and rollback. Add dependency checks against duplicated
  application/rendering paths and accidental website bootstrap imports.
- [ ] Commit/push coordinated source changes; record source and deployed revisions
  separately. When authorized, follow AGENTS.md release and asset-hash verification.

## Preservation and scope

Preserve immutable signed history, ANProto IDs and previous/reply/edit semantics.
Keep pinned vendor files unchanged. Preserve APDS data-URL images and original hashes,
legacy anblob readers/storage/endpoints/backups, and verified AndFS v1 uploads and
reads. New uploads must not rewrite historical content. Retain profile image,
image_original and image_crop metadata and explicit empty bio/links semantics.

The media work order (`WORK_ORDER.md`), gallery/profile feature documents and Node
migration plan remain separate scoped work. They must consume this application
boundary. Do not bundle transcoding, adaptive streaming, protocol expansion or the
Node migration into this effort. No public test publication or production deployment
is authorized by this work order.

## Evidence and ongoing status

Earlier shared-message, gallery, identity/outbox and browser suites demonstrate useful
components, not a mountable full application. Historical details are available in Git
history and current API behavior in client/README.md. No full-app embed acceptance has
been established by this document change.

For each implementation slice, append its commit, shared application/service owners,
website and embed checks, observed screenshots/flows, remaining feature gaps and any
site coordination requirements here. Keep one current task list; do not create another
parallel shared UI work order or rolling handoff document.

### 2026-10-30 startup extraction checkpoint (milestone 1 remains open)

The website bootstrap now calls `client/runtime/website-application.js` for its
existing startup sequence. Service-worker registration stays in `app.js`. This is
an intentionally limited document-owning startup seam, not `mountWiredove`, and has
no disposal or instance isolation yet. No public embed API or full-flow acceptance
is claimed by this checkpoint.

Current ownership/dependency inventory:

| Behavior | Current owner | Isolation work remaining |
| --- | --- | --- |
| Home, author, alias/community, search and thread panels | route.js, FeedStore, FeedOrchestrator | Module-level panel/cache/controller state, window hash/scroll, global feed enqueue/controller, origin-relative queries |
| Reply/edit/new composition and drafts | composer.js, navbar.js | Global hash, document ID lookups, session storage and feed enqueue |
| Profile setup/edit/history | profile_header.js, shared profile editor, APDS | Explicit instance identity/storage and navigation |
| Settings, identity import, moderation | settings.js, moderation.js | Window navigation/status, queue timer disposal, singleton storage |
| Notifications and publication | composer.js, send.js | Instance service/capability contract; preserve persistence-before-notification semantics |
| Sync/transport | sync.js, connect.js, gossip.js, websocket.js | Timer/socket ownership and disposal; public transport must be disabled in acceptance |
| Media/popovers | shared media widgets, createImagePopover | Root-scoped delegates and stable mounted nodes |

Existing website routes remain available. The existing widget browser tests use
host publication callbacks and therefore do not prove the real application flow.
Remaining milestone-1 requirements include root-scoped rendering/navigation,
instance route/cache state, explicit service/session lifecycle, a self-contained
import graph, Shadow DOM styling, real isolated local publication/retrieval and the
separate-origin profile → post → thread → reply acceptance with reload and media.
No production changes were made.

Checkpoint validation: `npm run check`, `npm test`, `npm run test:media` and
`npm run test:browser` passed. Browser coverage reported desktop/mobile light/dark,
320px shared messages, queue/gallery, separate-origin iframe and warm-cache tests.
These are regression checks, not the requested non-iframe full-app acceptance;
no new screenshots or full-app flow were observed in this checkpoint.


### 2026-10-30 application UI ownership extraction

This completes item 1 from the follow-up breakdown (instance-owned UI state), not
all of milestone 1. `client/runtime/application.js:createApplication` now creates
one router, feed controller, renderer and settings UI per root. The website starts
that application through `website-application.js`; its URL and window scrolling
are explicit adapters. Internal navigation is available through `createNavigation`.

- `route.js:createRouter` owns route runs, abort controllers, orchestrators, panel
  caches, scroll restoration and delayed route work. Importing it no longer
  installs a hash handler. Navigation subscriptions are removed on UI disposal.
- `adder.js:createFeedController` owns feeds, pagination/render queues, observers,
  status banners and timers. FeedStore receives an enqueue function. There are no
  production `window.__feed*` hooks; composition, moderation and incoming records
  use the application controller explicitly.
- `render.js:createRenderer` owns render/edit/reply-preview caches, timestamp state
  and observers. Its selectors and composer placement resolve within its root.
  The existing `render` export remains a compatibility object for direct imports;
  application instances never use it. Network delivery uses an explicit renderer
  subscription in the website bootstrap, removed on application UI disposal.
- Navbar, composer, profile-header avatar updates, identity dialogs and settings
  receive application/root/navigation references. Composer dialog focus, inert
  siblings, keyboard listeners and scroll restoration are root-owned. UI disposal
  removes subscriptions, timers, panels and application dialogs.

Acceptance evidence: `tests/application-state.browser.cjs` runs the real application
factory, router, feed controller, renderer and composer with an offline APDS stub.
It blocks external network requests and mocks website connection/sync startup.
Two roots in the same module graph prove independent navigation, cached panels,
scroll restoration, duplicate message IDs, feed enqueue/status, composer sibling
isolation, destroy/navigation-after-destroy and remount. The actual `app.js`
bootstrap also passes offline startup → hash search → home. Existing delayed
profile-header route tests now exercise `createRouter` and still pass.

The ownership screenshot at `test-results/application-state.png` was inspected.
It is a structural offline fixture, with external icon fonts blocked and existing
website-global CSS; it does not establish embed layout fidelity or Shadow DOM
style isolation. Full browser regression checks cover the existing mobile/desktop,
light/dark, gallery, shared-message and warm-cache paths. The shell cache version
is now `v16-application-state` and its upgrade assertion was updated.

Remaining service ownership (follow-up item 2): APDS identity/storage, reply index,
feed-row cache, profile helpers, publishing/queue status, sync, sockets and media
storage are still shared services. UI destroy does not stop the website's shared
transport session. Draft storage retains its existing identity/target keys. Service
session isolation/reference counting, signing serialization, backend URL policy
and capability handling must be completed before promising independent identities
or a safe public embed. Shadow DOM styling, self-contained dependency graph and
real two-author publish/retrieve flow remain open. No public writes or deployment.

Validation for this extraction: `npm run check`, `npm test` (30 tests),
`npm run test:media` (10 tests) and `npm run test:browser` passed. Focused router
and application-ownership checks also passed after the final lifecycle changes.
Source revision is the commit containing this entry; no deployed revision changed.


### 2026-10-30 shared website service lifecycle

`client/runtime/website-session.js` now explicitly owns the existing page-wide
APDS identity/storage adapter and transport/sync services. The database name stays
`wiredovedbversion1`; no identity/data migration or clearing occurs. Applications
receive a lease and `await app.destroy()` releases it. Concurrent acquisition
starts storage/services once; only the final release drains outstanding writes,
stops network work and flushes APDS hash/opened indexes. Reacquisition restarts
services without calling `apds.start()` again. Different database names are rejected.

The pinned APDS browser implementation was inspected: `start()` creates two
intervals and exposes no close method. Its handle and persistence timers therefore
remain page-lifetime resources, as do the existing shared data caches and media
stores. This is an explicit shared-session policy, not independent identity support.
A failed storage startup is latched rather than risking duplicate background timers.
The website bootstrap releases its lease if UI startup fails.

`sync.js:stopSync`, `websocket.js:stopNetwork` and `gossip.js:stopRoom` stop the
owned sync interval, HTTP polling, pending fetches, open/connecting sockets,
reconnect timers and peer room. Generation checks prevent canceled startup or old
poll/reconnect callbacks from restarting services. Network queue pause/resume
retains exact pending bytes in memory; teardown does not discard queued publication
payloads. A durable website outbox across reloads remains open.

Post composition, profile signing (including previous-reference reads and local
profile metadata updates), identity setup/import and settings identity mutations
share an ordered write queue. A rejected operation does not poison later writes;
a released lease rejects new writes. This prevents concurrent UI roots from racing
the existing shared author's publication chain. Existing signed bytes, legacy blob
readers, AndFS vendor files and identity backup format are unchanged.

Evidence: service-session unit tests cover concurrent leases, last-release ordering,
reacquisition, database mismatch, released writes, concurrent publication-chain
operations, failure recovery, exact queue bytes across pause/resume, and canceled
sync startup/stale ticks. Browser ownership acceptance also exercises the real
WebSocket/HTTP lifecycle using local HTTP responses and fake sockets: a connecting
socket closes, a scheduled reconnect stays canceled, and a subsequent start works.
External requests remain blocked; the actual website bootstrap still passes its
offline startup/search/home checks. The shell cache is `v17-service-session`.

Remaining before the public full-application embed: selectable backend/storage/
identity adapters throughout legacy reads, explicit browser capability and URL
policy, Shadow DOM style/asset isolation, inert self-contained imports and the real
isolated two-author publish/retrieve/reply/reload flow. This lifecycle slice does
not establish full milestone-1 acceptance. No production deployment or public test
publication occurred. Source revision is the commit containing this entry.

Validation: `npm run check`, `npm test` (35 tests), `npm run test:media`
(10 tests) and `npm run test:browser` passed. Focused application/transport
ownership acceptance passed again after the final stale-callback guards.


### 2026-10-30 shared Shadow DOM mount and browser distribution

The website now calls `client/runtime/mount.js:mountApplication`, the same function
exported by `/app-embed.js` as `mountWiredove`. Both use the extracted application;
no new renderer or smaller widget application was introduced. Each mount owns an
open Shadow DOM root, shared application stylesheet, navigation, scroll surface,
focus handling and dialogs. Destroy releases its session and clears the shadow;
remount reuses a Wiredove-owned root. Existing foreign shadow roots are rejected.
Website URL integration is explicit and its identity database name is unchanged.

`client/application.css` consumes the website stylesheet with root layout rules.
Navbar placement, scroll bounds and composer viewport sizing are application-owned.
Identity and photo-crop dialogs use a shared scoped-dialog helper; gallery viewers
are keyed to the containing application shadow root, including nested message
shadows. Keyboard close/focus return stay in the application. Highlight styles
also load within their rendering root. Fonts use an explicitly named application
font; source-relative image and stylesheet URLs resolve from module locations.

`npm run build:embed` emits `dist/app-v1` from the reachable source graph, preserving
relative module/asset paths and replacing APDS/h bare imports with their pinned
explicit URLs. A SHA-256 manifest covers emitted files. The public root entry
forwards to this graph; no host import map is needed. The build rejects unexpected
bare dependencies and website bootstrap inclusion. Generated vendor copies retain
their original code and licenses; pinned vendor sources were not edited.
`serve.js` enables read CORS for the versioned graph and public entry. Nothing has
been deployed. Rebuild after edits; never maintain distribution copies by hand.

Import inertness: legacy/AndFS media databases now open on first use, and the
profile image cache expires lazily rather than starting a timer on import. The
application distribution does not initialize APDS, register service workers or
open media stores merely by importing it. The website retains explicit service
startup and service-worker registration, including when startup finishes after
window load. Shell cache version: `v18-shadow-application`.

Observed acceptance: `tests/application-shadow.browser.cjs` serves the public entry
and versioned assets on one localhost origin and a plain HTML host on another.
It observes two actual JavaScript application mounts, with zero iframes and zero
host import maps. Offline APDS/session fixtures and blocked non-font external
requests prevent public publication. Checks cover host CSS resistance, independent
navigation, unchanged host hash/body style, identity/composer/gallery/crop dialog
placement, Escape behavior, host-control usability, disposal/remount and zero
IndexedDB opens on import. The real Cropper.js dialog was opened and canceled.
The matrix passes at 1200, 390 and 320 px in both light/dark schemes.

Screenshots in `test-results/application-shadow-*.png` were inspected, including
320px light and 1200px dark. Review exposed a mobile icon font issue; explicit
namespaced font loading fixed it. These screenshots show the empty offline app
shells and host CSS separation, not populated-feed or real-publication parity.
The existing actual website-bootstrap offline search/home check still runs through
the shared mount. Existing gallery/message/media compatibility suites remain
required; this change does not establish complete shared-feature acceptance.

Current API limitations are explicit in `client/README.md`: a compatible initialized
APDS session lease is required, the graph still uses its pinned APDS singleton,
and the complete default backend/storage/identity adapter is not implemented.
Identity/settings host reload actions, capability restrictions (including recording
and notifications), canonical URL/backend/media policy, durable website outbox and
real two-author profile → post → thread → reply/reload acceptance remain open.
The proposed initialRoute/theme object API remains a design target; current routes
are website strings and theme follows browser preferences. Milestone 1 stays open.

Validation for this slice: `npm run check` (including generated graph build),
`npm test` (35 tests), `npm run test:media` (10 tests), and `npm run test:browser`
passed. Focused separate-origin shadow, website ownership/bootstrap and composer
notification acceptance passed after final mount/dialog changes. The 320px light
composer screenshot was also inspected: host controls retain their own style and
the composer fits its application scroll surface. Repeated destruction of an old
instance is checked after remount and cannot clear the newer instance. The
committed distribution contains 81 copied source/asset/license files plus its
entry wrapper and manifest; pinned APDS/h remain explicit CDN dependencies.


### 2026-10-30 milestone 1 acceptance — real default application services

Milestone 1 is complete for the first real vertical slice. Source revision: the
commit containing this entry. This is local source acceptance, not deployment,
full feature parity, or completion of milestones 2–4.

Implemented owners:

- `client/runtime/default-session.js` selects the APDS identity/database, verified
  backend archive, media source, canonical URL and capabilities. Plain hosts call
  `mountWiredove(element)`; they do not create posts, sign, count replies or supply
  publication callbacks. The source module origin is the default backend/media
  origin. Multiple mounts in one graph share a reference-counted service session;
  incompatible database/backend/capability selections are rejected. Last disposal
  aborts/drains archive work and stops polling. APDS's existing persistence timers
  remain page-lifetime resources, as explicitly accepted in the earlier checkpoint.
- `application_backend.js`, mounted by `serve.js` at `/api/application`, stores exact
  signature/content pairs only after ANProto and content-hash verification. Atomic
  writes precede acknowledgement; duplicate concurrent retries are idempotent.
  Sequence-cursor pages describe this backend's archive, independently of author
  timestamps. State lives under `data/application` (or `APPLICATION_DATA_DIR`).
- `client/runtime/artifact-session.js` verifies every retrieved artifact before
  APDS ingestion/rendering. A durable IndexedDB outbox precedes author-chain state,
  local ingestion and transmission. New signing is blocked while a record is
  pending. Reload repairs pending local ingestion; retry preserves the exact ID,
  signature and body. Failed outbox persistence leaves the draft and chain intact.
- `composer.js` persists text/attachment metadata in localStorage, retaining the
  prior sessionStorage draft reader. Open draft targets restore after reload;
  closing keeps the saved draft available when that composer is reopened. Delivery
  failure after durable signing becomes a locally saved pending publication, with
  a navigation-bar retry action, rather than a second unsigned draft. Unuploaded
  file selections are not claimed durable; media metadata is saved after upload.
- Identity setup refreshes the mounted navbar/profile without reloading the host.
  Settings identity actions refresh the application. The first profile can be
  edited before any post; first-save missing photo metadata no longer throws.
  Profile writes use the same session/outbox and preserve signed photo metadata.
- Known message-hash routes open threads instead of being mistaken for authors.
  Canonical share/QR destinations use configured application URLs. Media upload
  URLs resolve against the configured media source, with signed CORS upload support.
  Compose/reply/upload/recording/notification capability gates apply to this slice;
  embeds default recording/notifications off and never register a service worker.
  Website legacy transport and publication notification paths remain enabled by
  its bootstrap. Historical image/blob readers and signed bytes are preserved.
- Screenshots exposed duplicate AndFS audio rendering; the website now invokes the
  shared AndFS renderer once and falls back to its legacy media reader. Icon font
  bytes/license are bundled so Shadow DOM icons do not rely on remote font timing.
  Shell cache is `v19-application-flow`.

Observed acceptance: `tests/application-flow.browser.cjs` uses the real pinned
APDS implementation, real vendored ANProto cryptography, disposable persistent
browser contexts, and real local archive/AndFS HTTP services. One surface calls
`startWebsiteApplication({network:false})`; the plain host on another origin calls
`mountWiredove(element)` with no injected session or publisher, no iframe and no
import map. All public writes are blocked. Test-only dependency routing supplies
unaltered pinned APDS source from GitHub and its real IndexedDB helper, avoiding an
unreliable esm.sh compilation response; signing/storage are not mocked.

The observed flow creates two identities and saves their profiles, publishes a
website post with uploaded WAV audio, retrieves and verifies it in the embed,
opens its thread, publishes a second-author reply, retrieves it on the website,
and restores it after embed reload. It checks focus and playing-node retention
across refresh, open-draft reload recovery, POST failure, pending state after
reload, exact-byte retry and one backend record for the original ID. Populated
website/embed screenshots are captured at desktop, 390 and 320px in light/dark.
See `test-results/application-flow-*.png` (generated, not committed). Existing
structural suites cover two instances, host CSS/hash isolation, dialogs and remount.

`tests/application-artifacts.test.js` additionally proves backend restart/concurrent
retry durability, signature/content tampering rejection, failed local persistence,
new-signature blocking, retry after session recreation and corrupt retrieval
rejection before ingestion. It is included in `npm run test:media`; the real flow
suite is included in `npm run test:browser`.

Scope and remaining work: archive queries/search/replies cover verified locally
cached and selected-backend records, not all public relays or global reply search.
The website retains its existing legacy discovery transport. Backend-unavailable
startup reports that local content is being shown. Global discovery, subscriptions,
advanced storage/protocol overrides, all settings/moderation/edit parity, the
object-shaped route/theme API, evbogue.com replacement, and broader device/release
acceptance remain milestones 2–4. The pinned singleton is shared deliberately;
independent identity namespaces in a single graph are not claimed. Embedding hosts
share their origin's keys/storage and must be trusted. No identity storage migration,
production deployment, public test publication or related-site change occurred.


Final validation for this checkpoint: `npm run check`, `npm test` (35 tests),
`npm run test:media` (12 tests), and `npm run test:browser` passed. The populated
320px light embed and 390px dark website screenshots were inspected after the
font/media fixes, as well as the desktop website. The real flow additionally
checks immediate profile reload durability and reply-target draft restoration.
Focused archive tests passed again after final retrieval-size bounds. GitHub
synchronization is recorded by the containing commit; no deployment was performed.

### 2026-10-30 composer symbol-font correction

The bundled icon font was registered as `Wiredove Symbols`, but the more specific
`.composer-icon .material-symbols-outlined` rule still selected only the Google
family. Composer controls now select the bundled family first, retaining the Google
fallback for standalone legacy surfaces. The generated embed stylesheet is rebuilt;
the coordinated shell cache is `v20-symbol-font`. The separate-origin application
suite now asserts every composer icon selects the loaded bundled font at desktop,
390px and 320px in both themes. This closes the visual gap missed in milestone-1
review; it does not change milestone scope or deploy production.

Validation: `npm run build:embed`, all six separate-origin application-shadow
variants, and the gallery/website/browser warm-cache upgrade suite passed. A fresh
headed two-origin demo passed the real signed flow with both composers opened;
the populated embed screenshot was inspected and its upload/raw/close icons render
correctly. No identity storage was cleared.


### 2026-10-30 milestone 2 — shared cache/archive feed queries

The first milestone-2 feed slice is complete. `client/runtime/feed-queries.js`
owns home/author/search snapshots, deterministic ordering/deduplication,
subscription disposal and coalesced explicit archive refresh. APDS's source index
is not sorted in place. Each application creates its query service; the existing
shared `FeedOrchestrator` uses it for these routes. Query snapshots remain scoped
to the verified local cache and selected backend archive.

`artifact-session.js` notifies subscribers after a newly verified artifact has
been ingested/persisted and delivered. Duplicate retrieval and rejected tampering
do not notify. The legacy renderer also invalidates queries on signed arrivals.
The shared router merges query results into the existing feed controller rather
than rebuilding message nodes. Active searches gain matching records, revisited
cached feeds requery, and route generation/abort checks discard late snapshots.
The same 25-row rendering pagination, pending-new-post banner and mounted playback
remain in place. Snapshot queries read the full local index; this is not server-side
search pagination or a new global discovery protocol.

Home, author and search screens have a shared **Refresh feed** control with scope,
loading and offline/retry status. A failed refresh retains verified rows. A refresh
shares the session's archive pull; navigation cancels application of obsolete query
results without aborting another mount's shared transport. Query listeners are
removed on destruction. Shell cache is `v21-feed-queries`, including the new module;
the versioned embed graph is rebuilt from source.

Acceptance: the real two-origin browser flow now publishes 28 disposable signed
local fixtures, observes live/cached search updates in both mounts, excludes an
unrelated record, exercises a fresh 25-row page followed by the remaining rows,
delays a snapshot across navigation, and tests backend failure/refresh retry without
losing content. Public writes remain blocked. Unit tests cover cancellation,
disposal, ordering, deduplication and coalesced refresh failure/retry; artifact tests
cover post-verification notification, duplicate suppression and unsubscribe.

Mobile screenshot review exposed a pre-existing application icon selector issue:
Google's later stylesheet could replace the bundled font outside the composer.
The application-root selector now wins for navigation/message icons too. The real
flow asserts all application icon nodes select the bundled font, and generates
`test-results/application-query-{website,embed}-320-light.png` with animations off.
Both screenshots were inspected after the fix. Existing desktop/mobile light/dark,
Shadow DOM, warm-cache, media and signed two-author regression flows still pass.

Validation: `npm run check`, `npm test` (38 tests), `npm run test:media` (12 tests)
and the full `npm run test:browser` passed. After final race/screenshot/font checks,
the real application flow, six application-shadow variants and gallery/warm-cache
suite were rerun. This does not complete milestone 2: community directory/legacy
backfill, broader discovery, the remaining feature-parity items, evbogue.com
replacement and device/release acceptance remain open. No production deployment,
public publication, identity migration or related-repository change occurred.
Source revision is the commit containing this entry.
