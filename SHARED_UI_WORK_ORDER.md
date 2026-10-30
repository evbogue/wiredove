# Wiredove shared UI migration: work order and inventory

Updated 2026-10-30 against source revision `4e56893`. This is the single authoritative
shared UI task list and feature inventory; it replaces `docs/SHARED_UI_INVENTORY.md`
and the historical S01–S08/C01–C05 checklists. Historical implementation details and
host API examples remain in `docs/SHARED_MESSAGE_HANDOFF.md`; that handoff is supporting
evidence, not a second task list. Documentation changes do not complete implementation.

## Muse handoff

Ev plans to pass this document to **Muse**, which will try to finish the shared UI
migration in the background. This records the intended handoff; Muse has not been
started or assigned through this documentation update.

Muse should read `AGENTS.md`, this document, and `docs/SHARED_MESSAGE_HANDOFF.md`,
inspect current source and Git state, and work through the remaining tasks in
reviewable vertical slices. After each slice, update this document with the actual
behavior, checks, remaining gaps and commit. Follow the standing Git synchronization
instructions; preserve other work and keep sibling repositories coordinated without
silently editing them. Production deployment and public test publication remain
separate authorization steps under the repository instructions. Do not bundle the
Node migration into this handoff.

## Current implementation inventory

- Individually importable widgets live in `client/ui/`; `client/ui.js`, `embed.js`
  and `client/index.js` remain public compatibility entry points. Imports must stay inert.
- `client/ui/message-view.js` is the canonical ordinary-message view used by website
  `render.meta` and the `wiredove-message` wrapper. It owns metadata/main/body/action
  layout, author/timestamp defaults, parent context, body/media, action gating and disposal.
- Website extensions still own rich APDS controls, timestamp observers, reply hydration,
  raw/QR controls, author editing and moderation. Edit-event summaries remain a
  compatibility rendering path. Full message feature parity is unfinished.
- Body/gallery, image viewer, verified AndFS image/audio/video helpers and composer/profile
  subcomponents are shared. Historical APDS images and anblob readers remain supported.
  Public legacy audio/video requires a host `renderLegacyMedia` adapter; otherwise it
  shows unavailable content. A signed URL alone does not verify media bytes.
- `client/ui/message-list.js` reconciles by ID and occurrence, retaining unchanged
  message elements, media and focus. Explicit content/presentation changes can rebuild.
- Widget reply/compose capabilities require a functional publisher. Navigation, publisher
  results, local-versus-relayed status, failed publication/retry and in-memory draft
  retention have shared behavior; callback results are not automatically trusted posts.
- `client/runtime/browser-store.js`, `publishing-session.js` and `ui/identity-panel.js`
  add opt-in identity create/import/backup, IndexedDB File drafts and exact signed outbox
  retry. Publishing preserves signed profile fields and author-chain linkage. This is
  an interactive embed slice, not complete website composer/service convergence.
- Website `app.js`, `route.js`, `composer.js`, APDS, FeedStore/FeedOrchestrator and network
  modules still own substantial application behavior. `client/core/contracts.js`
  documents target boundaries; declarations alone are not working APDS adapters.
- The public author-feed path verifies bounded previous-message history (default 40),
  not global reply discovery or complete profile history. Hosts supply verified records,
  bounded replies, uploads, persistence, transport and durable navigation.

### Feature ownership and preservation

The table maps existing behavior to its shared owner and remaining adapter boundary;
it is an inventory, not a declaration that every target is implemented.

| Existing owner | Behavior to preserve | Target shared owner | Frame/adapter responsibility |
| --- | --- | --- | --- |
| render.js, client/ui.js | Message DOM, author, body, metadata, reply actions | ui/message.js | Supply verified post and action handlers |
| markdown.js, client/ui/message.js | Ordered Markdown, hashtags, links, image galleries and unavailable tiles | ui/body.js, ui/image-gallery.js | APDS image resolution and host actions |
| APDS, client/render.js | Name/time/avatar fallbacks | ui/format.js | Provide profile updates; deduplicate APDS helper usage later |
| media.js | Legacy anblob playback, loading/failure, downloads | ui/media.js | Legacy blob resolution and verified storage |
| client/render.js | AndFS gateway image/audio/video, safe URLs, lazy load | ui/media.js, ui/media-render.js | Supply gateway/byte-verification adapter; URL signing is not byte verification |
| render.js | Raw data, QR/share, edit history and edit-event display | Shared message controls | Capabilities, identity and resolved edit provenance |
| moderation.js, render.js | Hidden/muted/blocked state, stubs and actions | Shared message presentation | Website/host moderation policy |
| reply_index.js, render.js | Reply previews/counts and live refresh | Shared thread/feed | Query index and report completeness |
| feed_store.js, feed_orchestrator.js, route.js | Incremental insertion, ordering, paging, caches | Shared feed | Existing local-first adapter and request coordination |
| profile_header.js, profile.js, render.js | Profile fields/updates and author feed | Shared profile | Profile data resolution |
| route.js | Search results and route panels | Shared search/feed | Website hash routes; embed-local navigation |
| composer.js, client/ui.js | Drafts, reply/edit context, errors and success state | Shared composer | Publish service; no success without publisher |
| media.js, composer.js | Recording/upload previews, discarded-resource cleanup | Shared composer/media controls | Recording permission, storage and upload durability |
| send.js, network_queue.js, websocket.js, gossip.js | Delivery, confirmation/retry, networking | Service contracts | Website transport/storage implementation |
| route.js, app.js | Scroll restoration, popovers, panels, navigation | Website frame | Website lifecycle and navigation policy |
| client/feed.js | Verified bounded author history, refresh/error/loading | Public-relay adapter | No global/thread completeness claim |

The split preserves existing widget behavior rather than replacing the website's richer
renderer. No feature in this table is approved for deletion by this inventory.

## Outcome and architectural requirement

Wiredove's website and embeds must depend on the same rendering and UI modules.
The website is the primary consumer of the shared widgets, not a separate implementation
that the embed periodically copies. A fix to a shared message, attachment, thread,
profile, search, or composer must apply to both frames without a second UI patch.

Each widget lives in an individually importable module. Frames arrange widgets,
configure capabilities, select adapters, and own top-level navigation. Shared widgets
own the corresponding DOM, interaction, accessibility, and lifecycle behavior.

Both frames use the same service contracts for verified posts and user actions.
Adapters may differ for storage, identity, and transport. An embed need not initialize
the website's IndexedDB databases, identity, service worker, global router, WebRTC,
notifications, or moderation settings merely to display public posts.

This work preserves existing website behavior. Do not replace the website with the
current simplified embed UI and call the migration complete.

## Remaining tasks, in implementation order

Each unchecked item remains open even when a supporting subcomponent already exists.
Finish a vertical slice in the website and embed, verify it, then retire its bridge.
The original S/C ticket references are retained for orientation only.

### 1. Complete the canonical message component (S03/C01)

Completed sub-slice 2026-10-30: raw-data + QR + permalink right-meta cluster migrated
into shared components (`client/ui/raw-controls.js`, `client/ui/qr.js`,
`client/ui/message-meta.js`). The website's `buildRawControls`, `buildRightMeta`
and `render.qr` are deleted; both `render.meta` paths (ordinary and edit-event)
now build the cluster through one website glue helper (`buildMetaCluster`) from
the shared modules, and the canonical view's default metadata/raw slot uses the
same components (replacing the divergent `<details>` raw fallback). The
`getElementById('qr-target'+hash)` fallback is gone; the QR target is passed by
ref. Behavior preserved: toggle lazy-build, dark-mode QR colors, failure clears
the target, permalink `#<signature>` navigation, `.message-meta`/`.message-raw`/
`.qr-target` classes kept for `extractMetaNodes`. Checks: `npm run check`,
`npm test` (30/30), `npm run test:media` (10/10), `npm run test:browser` (all
pass, incl. shared-message runtime at 1200/390/320px light/dark and the
site-surface raw toggle), plus focused toggle/failure/order checks on the new
modules. Remaining in this section: edit summaries/navigation, moderation
controls/stub, async profile updates, reply counts, timestamp observer (see
SLICE1_AUDIT.md mapping). Checkboxes stay open until the full section is done.

- [ ] Audit website extensions and edit-event summaries against the canonical view;
  move reusable edit/history, moderation, raw-data, QR/share and author controls into
  shared components without losing existing website behavior.
- [ ] Share async profile/reply-count/edit updates, loading/unavailable/error states
  and action gating. Preserve mounted media, focus and existing observer integration.
- [ ] Replace document selector dependencies with explicit refs/events/public APIs
  where migration crosses widget boundaries. Preserve the current open-shadow public
  wrapper and explicit website node extensions until their replacements are verified.
- [ ] Remove parallel message paths only after equivalent browser behavior is observed.

### 2. Unify verified records and services (S01/S04/C02)

- [ ] Audit APDS/cache provenance end to end; keep discovery rows distinct from
  authenticated content. Normalize only after checking signature/content/hash identity.
- [ ] Implement shared website APDS/FeedStore/FeedOrchestrator, public-relay and media
  adapters; preserve exact signed YAML, IDs, authors, previous/reply links and timestamps.
- [ ] Define and implement snapshots, updates, pagination, completeness, missing content,
  verification errors and unsupported capabilities across both adapters.
- [ ] Exercise cancellation, stale responses, cached/remote races, retry and disconnect
  cleanup. Keep authentication separate from rendering and attachment-byte verification.

### 3. Complete shared feeds and threads (S05/C03)

- [ ] Share reply indexing/discovery, ordering, pagination, incremental insertion and
  loading/error/empty states through the service boundary.
- [ ] Preserve website route panels, cached state, scroll, focus, conversation state and
  active playback during refresh; retain bounded-history honesty in embeds.

### 4. Complete shared profiles (S05/C03)

- [ ] Consolidate profile header/name/bio, author feed/history and editing under shared UI.
- [ ] Supply a profile/history adapter so older metadata remains available beyond the
  feed limit; preserve absent-versus-explicit-empty bio/links behavior.
- [ ] Preserve existing photo original/crop metadata, re-cropping, profile links,
  immediate reload durability and save/cancel/failure behavior.

### 5. Complete shared search (S05/C03)

- [ ] Share search controls, query/results behavior and route intents, preserving website
  behavior and explicitly describing bounded/unsupported embed results.

### 6. Finish the website composer migration (S06/C03)

- [ ] Consolidate website and embed text/reply/edit context, validation, attachments,
  recording, previews and progress/errors into shared composer UI.
- [ ] Bind both frames to injected identity/signing/publishing services, retaining exact
  author-chain and reply/edit metadata, durable uploads, persistence and outbox retries.
- [ ] Preserve drafts through identity setup, route changes, reload and network failure;
  retain inline-at-cursor images, gallery placement and failed-upload publication blocking.
- [ ] Dispose recording streams, object URLs, listeners and abandoned uploads correctly.
- [ ] Keep local save, relay confirmation and optional notification delivery distinct;
  prevent duplicate publication via callbacks/events or false success without a publisher.

### 7. Finish frame composition and retire bridges (S07/C03)

- [ ] Make website and embed assemble the shared widgets through explicit adapters,
  capabilities, appearance and navigation; keep host routing and CSS isolated.
- [ ] Preserve public imports, element names, callbacks/events and documented payloads;
  imports must not boot identity/storage, global routing, network or service workers.
- [ ] Remove obsolete frame-owned renderers and compatibility bridges once parity passes.
- [ ] Add a structural dependency guard against duplicate message/body/media renderers
  and widgets importing application frames.

### 8. Close cross-frame and cross-client acceptance (S08/C04)

- [ ] Run common signed fixtures through both full website and separate-origin embed for
  edits/history, moderation, profiles, search, composer and all supported controls.
- [ ] Complete the real interactive Wiredove ↔ evbogue.com post/reply/retrieve/reload loop
  with disposable identities and isolated local services, beyond callback-only mocks.
- [ ] Cover previous links, duplicate/reverse-order delivery, relay outage/retry,
  unavailable content and edit/profile compatibility; coordinate with `WORK_ORDER.md` W05.
- [ ] Verify legacy APDS images/anblob and new AndFS images/audio/video/profile photos,
  corruption/retry, upload failures and separate-origin display without changing old IDs.
- [ ] Complete physical Safari/mobile recording/playback acceptance. Track production
  legacy-blob inventory/backups separately in `WORK_ORDER.md` W04.
- [ ] Cover desktop and 390/320px layouts, light/dark, keyboard/focus, multiple widgets,
  unmount/remount, navigation races, denied permissions and warm-cache upgrades.

### 9. Documentation and coordinated release (C05)

- [ ] Update this inventory, README, client docs, examples and API handoff after each
  completed slice; remove stale claims and record evidence and remaining limitations.
- [ ] Record intended Wiredove/site source revisions and actual deployed revisions
  separately. Prepare release/rollback notes and coordinated service-worker updates.
- [ ] When separately authorized, deploy reviewed revisions and verify served asset
  hashes, service health and browser smoke tests under `AGENTS.md`.

## Existing acceptance evidence and limits

Recorded evidence through 2026-10-30 includes Node tests, Deno media/client/monitor/session
checks, frozen server checking, website/embed browser suites, separate-origin rendering
and warm-cache upgrades. Signed-fixture checks cover tampered records, capability gating,
retained message/media identity, failed publisher/retry and local-versus-relayed status.
Screenshots were reviewed at desktop and narrow widths in light/dark themes.

The site handoff additionally records separate-origin identity create/import, owner
publication, image draft reload, failed-save/outbox retry and conversation reload with
public traffic blocked, plus a read-only actual-owner legacy-image review. These checks
supersede older notes saying no browser or identity UI acceptance occurred. They do not
prove full website feature parity, full interactive cross-client relay acceptance,
physical Safari/mobile recording or current production deployment. Consult
`docs/SHARED_MESSAGE_HANDOFF.md` and the site's `timeline/SHARED_WIDGET_HANDOFF.md` for
the exact integration evidence; recheck current source rather than assuming deployment.

For implementation changes run the relevant focused checks and the repository commands
`npm run check`, `npm test`, `npm run test:media` and `npm run test:browser` as appropriate.
Review screenshots for layout changes. Use isolated fixtures/local services; public test
posts require explicit instruction. Record new results here rather than treating past
checks as validation of future changes.

## Contracts and implementation constraints

### Post records and provenance

Use the existing verified record as the base: `id`, `signature`, `content`, `author`,
`timestamp`, `contentHash`, and `parsed`. Normalize APDS records (`hash`, `sig`, `text`,
`ts`, `opened`) through one bridge. Preserve exact `signature` and `content` strings.
Do not reserialize YAML to obtain a record or recompute a message ID from YAML.

Treat cache/server feed rows and previews as discovery hints, not verified message
content. The service must retrieve and authenticate bytes before presenting them as
verified. When using existing APDS storage, document and check its verification
boundary instead of assuming every cached row is trusted. Retain authentication tests
for mismatched hashes, invalid signatures, future timestamps, and linked-message IDs.

Keep signed parsed metadata separate from derived view fields: profile name/avatar,
reply count, moderation state, resolved edits, loading state, and local capabilities.
Support `reply` and historical `replyHash` where existing readers do; preserve `replyto`.
An edit is a signed event with provenance, not a mutation of original signed content.
Define stable record and update shapes in JSDoc; a TypeScript conversion is unnecessary.

### Services and updates

Define adapter operations for loading feeds, obtaining a post, getting replies,
loading profiles, searching, subscribing to updates, and publishing. Implement only
operations each adapter actually supports. Unsupported discovery/search features must
have explicit capability/status results, never fabricated completeness.

Define initial snapshot, incremental updates, pagination/cursor meaning, loading,
empty, unavailable, verification failure, and retry states. Every async request accepts
cancellation or otherwise suppresses stale completion. Subscriptions return an
unsubscribe function. Frames cancel old route work; disconnected widgets clean up
listeners, observers, timers, media resources, and outstanding view work.

An author-history limit is a fetch bound, not a claim that a thread is complete.
Separate message authentication from attachment-byte verification. A signed media URL
proves the author's reference; gateway playback alone does not prove browser-verified
media bytes. Surface accurate status for each supported media adapter.

### Capabilities and actions

Default to read-only. Define capabilities for reply/compose, media attachment,
editing, moderation, raw-message inspection, and QR/share controls. Require both an
enabled capability and its functional service/action handler before exposing it.
Never show a successful publish state when no publisher was provided.

Use shared action payloads: navigate `{type, id?, author?, query?}`, reply `{postId,
author}`, publish `{body, file?, replyTo?, editTarget?}`, and moderation `{action,
postId?, author?}`. Finalize names against existing callbacks before implementing.
Preserve `wiredove-routechange`, `wiredove-reply`, `wiredove-compose`,
`wiredove-published`, `wiredove-loaded`, and `wiredove-error` through documented
bridges where their current payloads differ. Avoid double delivery through callbacks
and events; select and document the ownership of each action.

Shared UI validates drafts and displays progress/errors; publishing services perform
signing, attachment durability checks, storage, delivery/retry, and confirmation.
The website adapter supplies the existing identity and local-first publishing policy.
Embeds remain read-only unless a host explicitly provides a working publishing adapter.

### Styling and navigation

Use the same message structure, body renderer, media widgets, and base styles in both
frames. Frames may supply documented CSS variables, layout classes, and optional
controls. Do not maintain separate website/embed copies of body markup or CSS.
Presentation overrides remain supported but must not become the default alternate
renderer for one frame.

Evaluate shadow DOM compatibility before adopting it throughout the website.
`render.js` currently uses document-level IDs and selectors; `route.js` observes
`[data-author]` descendants. A shadow boundary changes those contracts. Replace such
cross-boundary lookups with references, public widget methods, or explicit events.
Choose a consistent widget boundary and document it. Do not disable encapsulation in
one frame as an undocumented workaround.

Website navigation maps shared route intents to existing hash routes; the embed uses
local widget state or configured external URLs. Links retain usable destinations for
keyboard access and opening in a new tab. Embed navigation must not unexpectedly take
over the host page's hash/router. Keep timestamp refresh, scroll preservation, focus,
image popovers, and modal behavior owned by explicit lifecycle contracts.

## Required fixture and regression matrix

| Case | Website expectation | Embed expectation |
| --- | --- | --- |
| Verified text, multiline body, Markdown links/hashtags | Existing behavior retained | Same shared body renderer |
| Missing name/avatar/profile updates | Existing fallbacks and update behavior | Same primitives; available profile data only |
| Invalid signature/content or unverified preview | Rejected or explicit unavailable state | Same authentication boundary |
| Reply and historical replyHash | Existing thread/index behavior | Loaded replies; limited discovery explicitly stated |
| Edit event and edit history | Existing provenance/history controls | Same shared presentation when supported |
| Hidden/muted/blocked content | Website moderation policy applied | Host-configured policy; no website settings assumed |
| Raw, QR, share and author-only edit controls | Preserved supported controls | Capability-controlled shared controls |
| HTTP(S) image and unavailable legacy image | Existing safe display/fallback | Same supported rendering/fallback |
| Legacy anblob and AndFS media | Both explicit supported adapters | Availability reflects selected adapter |
| Media-only post, failure, download, lazy loading | No eager whole-feed downloads | Same media widget/lifecycle |
| Feed ordering, pagination, new posts | Existing local-first behavior | Adapter's bounded author history |
| Route switch and return | Hash navigation and scroll restoration | Local routes without host hash takeover |
| Publish failure/retry, reply/edit metadata | Existing signing/storage contracts | Disabled unless real adapter supplied |
| Disconnect/reconnect and source change | No leaked resources/stale updates | Same lifecycle guarantees |

## Completion criteria

- [ ] Both frames use the same canonical message/body/media/composer and applicable
  feed/thread/profile/search components, with existing website features preserved.
- [ ] Shared verified-record/service contracts have working adapters and honest status.
- [ ] Public imports remain independent of website boot and all lifecycle resources clean up.
- [ ] Duplicate production renderers/temporary bridges are retired and guarded against.
- [ ] Cross-frame fixtures and real local cross-client acceptance pass, with device/media
  limitations explicitly resolved or recorded rather than concealed.
- [ ] Docs and examples match implementation; deployment evidence is recorded separately.

## Related work outside this migration

- `WORK_ORDER.md`: AndFS compatibility, production blob backups and media acceptance.
- `DENO_TO_NODE_WORK_ORDER.md`: separate planned runtime/proxy migration; npm currently
  supplies test tooling, not a Node application server.
- `PROFILE_LINKS_WORK_ORDER.md`: optional bio polish, service icons, ownership proofs and
  editing enhancements; existing behavior must be preserved during profile migration.
- Review of the previously noted OpenClaw/CLI PR #4 requires checking its current GitHub
  status; an agent publishing client is separate from browser UI convergence.
- The sustainable-internet-fame research purpose remains portable authorship and
  accessible conversations on Ev's own domain. Coordinate observations with
  `../anproto-fame/WORK_ORDER.md`; sibling paths are workspace references, not runtime imports.
