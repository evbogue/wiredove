# Mountable Wiredove application work order

Updated 2026-10-30 following Ev's request for a full Wiredove JavaScript embed.
Status: architecture and implementation plan; the mount API below is not implemented.
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

- `app.js` initializes APDS, mounts into document.body, starts networking/sync and
  registers a service worker. It is a website bootstrap, not an application factory.
- `route.js` owns route panels, feed orchestration and scroll state through module
  globals, document selectors, window hash routing and global feed controllers.
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

All milestones below are open. Complete vertical slices on both surfaces and record
observed results here. Do not finish every component extraction before proving a
mountable application. Do not claim a declaration, mock callback or screenshot proves
runtime parity.

### 1. Extract the application instance and prove the first real flow

- [ ] Inventory current website routes/actions and global dependencies, including
  home, author, alias/community feeds, search, thread, edit, profile, settings,
  moderation, notification and sync behavior. Record ownership and parity below.
- [ ] Extract explicit startup/disposal from app.js. Introduce root refs, instance
  route state and navigation/services dependencies. Adapt route panels, feed storage
  and orchestration; remove global selectors across this boundary.
- [ ] Switch the website bootstrap to the extracted application while preserving
  existing routes, cached panels, scroll restoration and all unmigrated features.
- [ ] Mount that same application in a separate-origin plain HTML host via Shadow DOM.
  Supply real local test services, not host-created posts or a simulated publisher.
- [ ] Prove profile → post → thread → reply in both mounts, including identity setup,
  verified retrieval, reload, durable drafts, media and delivery status. Keep mounted
  playback/focus stable during updates. Include replies from a second author.

Acceptance: both mounts use the same application flow and services, with public writes
blocked and disposable identities. The host supplies configuration only. Existing
website behavior remains available; unfinished routes are tracked, not removed.

### 2. Complete application features through the same boundary

- [ ] Move remaining feed queries/discovery, pagination, subscriptions and search into
  shared services/screens; handle cancellation, stale responses and offline retry.
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
