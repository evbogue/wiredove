# Wiredove shared widgets and application frames

Requested by Ev, 2026-10-03. Status: planned; this document does not implement the restructuring.
Baseline: master at `bd62381` (public author-feed embed).

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

## Current state, confirmed in the repository

- `app.js` boots the website; `route.js` coordinates route panels, scroll restoration,
  `FeedStore`, and `FeedOrchestrator`.
- `render.js` builds website messages and also coordinates moderation, edit history,
  timestamps, profile updates, raw-message controls, QR controls, and reply indexing.
- `composer.js` builds the website composer and owns several publishing and media
  integration steps. `media.js` renders legacy anblob media and records attachments.
- `client/ui.js` separately implements message, composer, thread-feed, thread, and
  widget custom elements. It imports `client/render.js` and the root stylesheet.
- `client/render.js` has its own name/time helpers, an avatar encoder copied from
  APDS, and an AndFS gateway-media renderer. Its comment describes shared primitives,
  but the website does not currently import these helpers.
- `client/feed.js`, `client/protocol.js`, and `client/relay.js` form the embed's
  verification and author-history path. The website uses APDS and its existing
  sync/network infrastructure instead.
- `embed.js` registers the widget elements. `client/network-demo.html` loads a live
  author feed; `client/embed-demo.html` is a fabricated local UI demo.
- The public-feed adapter follows one author's signed `previous` links, with a default
  limit of 40. It does not discover all replies by other authors or a global feed.
- `serve.js` supplies public CORS for `/client/`, `/embed.js`, and `/style.css`.
- `WORK_ORDER.md` is the separate AndFS migration order. Its planned features must
  not be described as completed by this restructuring.

## Scope and exclusions

Include shared rendering, widget decomposition, post normalization, capability/action
contracts, website/embedding frames, compatibility bridges, lifecycle cleanup, and
cross-frame verification. Extract shared behavior from current implementations.

Do not change ANProto signature envelopes, serialized signed bytes, message IDs,
previous/reply semantics, media identities, database formats, or relay wire protocols.
Do not bundle the AndFS storage migration, new authentication scheme, global discovery,
new CRDT/wave features, or visual redesign into this work. Support both existing media
paths through explicit adapters; do not silently migrate old signed posts.

## Target module layout

Use browser-native ES modules and the existing custom-element approach. The following
paths are the intended starting layout; adjust names only when current code warrants it,
and update this document and public exports together.

```text
client/
  core/
    posts.js             verified-record normalization and derived view data
    capabilities.js      common capability defaults and validation
    actions.js           shared action names and payload contracts
  services/
    feed-service.js      feed/thread/profile/search contract and request lifecycle
    publish-service.js   shared draft/publish result contract
  adapters/
    apds.js              existing website storage, identity and networking bridge
    public-relay.js      public author-history adapter using existing feed/relay code
    media.js             explicit legacy/AndFS media-resolution contracts
  ui/
    format.js            shared name/time/avatar primitives
    body.js              canonical message-body and link rendering
    styles.js            shared stylesheet attachment/tokens
    message.js           wiredove-message
    media.js             wiredove-media
    composer.js          wiredove-composer
    feed.js              wiredove-feed
    thread.js            wiredove-thread
    profile.js           wiredove-profile
    search.js            wiredove-search
    register.js          convenience registration of the complete widget set
  frames/
    website.js           website widget composition and navigation wiring
    embed.js             configurable embed composition and navigation wiring
  index.js               stable client exports
  ui.js                  compatibility re-exports for existing consumers
embed.js                 stable public bootstrap
```

Widgets import other widgets/helpers, not either frame. Core/services must not import
UI or frames. Adapters implement contracts, not UI markup. Frames depend on shared
widgets/services and their selected adapters. Keep APDS bare-specifier/import-map
requirements inside the website adapter so public widgets work without an import map.

Do not introduce a new framework, build system, or dependency-injection package simply
to accomplish this split. Each widget module exposes its element class and an idempotent
registration function. Dependencies are registered explicitly. Preserve the existing
`defineWiredoveElements()` convenience API without an import that boots the website.

## Contracts to establish before migration

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

## Ordered implementation tickets

### S01 — Inventory and lock contracts

- [ ] Map every user-visible message/composer feature in `render.js`, `composer.js`,
  `media.js`, `markdown.js`, `profile_header.js`, and `client/ui.js` to its target owner.
- [ ] Record APDS verification boundaries and normalized record mappings.
- [ ] Define JSDoc service, capability, action, lifecycle, and update contracts.
- [ ] Capture website/embed fixtures and relevant screenshots before changes.
- [ ] Identify document selectors, globals, and side effects that cannot cross widgets.

Acceptance: a reviewed feature inventory covers edits, moderation, profile updates,
reply counts, raw/QR/share controls, links, and media; no existing behavior disappears
without an explicit recorded decision. The first implementation remains small.

### S02 — Extract individually importable widget modules

- [ ] Move current custom-element classes from `client/ui.js` into individual modules.
- [ ] Extract common formatting, body rendering, and style attachment helpers.
- [ ] Keep old public imports, element names and callback properties working.
- [ ] Make registration idempotent and dependency registration predictable.
- [ ] Ensure importing the message widget does not load the website frame, identity,
  relay polling, notification registration, or composer/media-recording code.

Acceptance: existing demos still render; importing and registering an individual
message or media widget works independently. This ticket reorganizes code without
claiming the website is already migrated.

### S03 — Shared message and media, first vertical milestone

- [ ] Extract the website's richer message behavior into the canonical message widget.
- [ ] Move body rendering to one shared implementation, preserving supported Markdown,
  hashtags, images, safe links, and historical attachment captions.
- [ ] Extract attachment UI into the media widget; inject legacy and AndFS resolution
  adapters with accurately described verification/playback behavior.
- [ ] Preserve edit views, author profiles, moderation stubs/actions, reply controls,
  raw data, QR/share controls and live timestamps through shared subcomponents or
  configured shared controls.
- [ ] Replace website message construction with mounting/updating the shared widget.
- [ ] Switch the embed message path to that exact widget and media/body modules.
- [ ] Preserve website cache/incremental update integration with a temporary bridge.

Acceptance: the same real shared message/media modules render the same verified
fixture in the website and a separate-origin embed. Website behavior remains intact;
embed capabilities may hide controls, but cannot supply a parallel message renderer.
Old message markup is deleted from production paths. Stop and review this milestone
before migrating every remaining screen.

### S04 — Shared data/services and adapter boundaries

- [ ] Normalize APDS records and public-relay records through common post contracts.
- [ ] Wrap existing `FeedStore`, `FeedOrchestrator`, reply index, local storage and
  network queue behind website adapter operations without rewriting their algorithms.
- [ ] Move existing public author-history loading behind the public-relay adapter;
  retain `loadWiredoveFeed()` as a compatibility export.
- [ ] Centralize authentication/normalization policy where currently duplicated;
  transport-specific details and storage policy remain adapter responsibilities.
- [ ] Implement cancellation, incremental updates, retry, and disconnect cleanup.
- [ ] Distinguish unavailable content, empty feed, limited history and incomplete replies.

Acceptance: identical verified input produces the same normalized message data through
both adapters. Invalid bytes cannot enter verified views. Network requests from a
read-only embed send only public keys/hash lookups and never create/sign public posts.
Changing routes/feed keys cannot let old requests overwrite the active view.

### S05 — Feed, thread, profile and search widgets

- [ ] Extract shared list reconciliation and feed state rendering.
- [ ] Migrate reply/thread UI using the existing index through the service contract.
- [ ] Extract profile header/body/feed widgets and route intent mapping.
- [ ] Extract search controls/results while preserving the website's supported behavior.
- [ ] Retain website incremental insertion, timestamp ordering, cached panels,
  pagination, subscriptions, scroll restoration and reply-count updates.
- [ ] Expose only supported embed search/reply discovery features and label limited results.

Acceptance: both frames import the same relevant widgets. New posts and replies update
without rebuilding unrelated messages. Returning to a website route restores expected
scroll position; repeated navigation does not leak observers or subscriptions.

### S06 — Composer and publishing bridge

- [ ] Extract shared draft/reply/edit/attachment UI from both composer implementations.
- [ ] Move signing, previous linkage, persistence, relay confirmation and retry policy
  behind a publishing service backed by the website's current implementation.
- [ ] Keep identity selection and storage in the frame/adapter, outside the widget.
- [ ] Preserve website recording/upload previews, draft validation, progress, failures,
  author-only editing, and immediate local publication behavior.
- [ ] Disable unsupported actions and prevent success reporting without a publisher.
- [ ] Preserve signed reply/edit metadata and media durability prerequisites.

Acceptance: website compose/reply/edit use the shared widget with existing valid
contracts. A read-only embed cannot publish. A supplied disposable local-test publisher
can exercise success/failure without silently accepting absent handlers or duplicating
submissions. Attachment previews and recording streams are released when discarded.

### S07 — Assemble the two frames and retire bridges

- [ ] Make the website frame compose shared widgets inside existing app navigation.
- [ ] Make `<wiredove-widget>` delegate to the embed frame rather than defining its
  own copies of profile, search, thread, feed and compose screens.
- [ ] Keep `feed`, `relay`, `limit`, `interactive`, `posts`, `onPublish`, `presentation`
  and `refresh()` supported or explicitly documented with migration bridges.
- [ ] Keep `embed.js`, `client/ui.js`, and `client/index.js` stable public entry points.
- [ ] Delete obsolete production renderers and documented temporary bridges.
- [ ] Update client/root README and demos to describe actual supported behavior.

Acceptance: website and embed contain frame layout/adapter wiring, with all migrated
content UI coming from shared widget modules. No legacy renderer remains in a hidden
active path. Website boot side effects never occur from a public widget import.

### S08 — Cross-frame acceptance and architecture guard

- [ ] Exercise a common fixture suite through both website and embed compositions.
- [ ] Add a focused dependency check for direct frame imports of obsolete renderers,
  widget imports of frames, and application-specific imports inside public UI modules.
  Keep the check small; do not rely solely on brittle markup-string searches.
- [ ] Run meaningful browser behavior checks through both frames, including keyboard
  navigation, safe URLs, focus, disconnect/reconnect, retries and stale requests.
- [ ] Verify public module/CSS CORS from a separate-origin host without an import map.
- [ ] Observe a real read-only feed load; use local relays/disposable identities for writes.
- [ ] Record which browser/media acceptance checks ran and which remain unverified.

Acceptance: a targeted shared message rendering change is exercised by both frames
without changing either frame's renderer. Authentication, lifecycle and website feature
checks pass. Cross-origin browser loading is observed, not inferred from unit tests.

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

## Delivery, verification and rollback

Deliver small coherent commits in ticket order. Each implementation commit documents
which shared path is active, which bridge remains, and which acceptance checks passed.
Use existing project tooling; Node/Deno authentication tests are already available.
Add browser coverage for actual frame integration rather than tests that only repeat
individual helper outputs. Keep static import checks complementary to behavior checks.

The initial embed change passed six unit tests and loaded 40 verified live posts, but
full browser verification was not completed because Chromium installation failed.
Treat separate-origin browser acceptance as outstanding until actually observed.

Do not remove a legacy rendering path until its replacement passes feature checks.
Temporary bridges must have named removal tickets and may delegate to shared UI, not
keep a second implementation indefinitely. Revert an individual migration commit if
website behavior regresses; retain protocol/data formats so rollback requires no
signed-message rewriting or database migration. Do not force-push shared history.

Follow the session's branch/push authorization. This order creates no blanket permission
to deploy later runtime changes or publish test posts. Public test writes still require
explicit authorization under the existing project instructions. Never report planned,
mocked, or skipped acceptance checks as observed success.

## Completion checklist

- [ ] All content widgets are individually importable and used by both applicable frames.
- [ ] Website and embed use one canonical message/body/media/composer implementation.
- [ ] Differences are explicit capabilities, adapters, and frame layouts.
- [ ] Existing website features and public client entry points remain supported.
- [ ] Verification/provenance and immutable signed bytes are preserved.
- [ ] Public imports are independent of website boot, identity and storage globals.
- [ ] Cross-origin embed and website integration have observed browser acceptance.
- [ ] Obsolete production renderers and temporary bridges are removed.
- [ ] Instructions, examples, architecture checks and validation record agree with code.

## Implementation checkpoint — 2026-10-03

First implementation extracts the existing client widget classes into individual
`client/ui/` modules and preserves `client/ui.js`/`client/render.js` compatibility
entry points. It adds an individually registered AndFS gateway media wrapper,
shared helper modules, target JSDoc contracts, and a feature/DOM-boundary inventory.

- S01: partial. Inventory and target contracts recorded in
  `docs/SHARED_UI_INVENTORY.md` and `client/core/contracts.js`; full APDS cache
  verification audit, baseline screenshots and browser checks remain outstanding.
- S02: structural extraction implemented. Existing behavior tests and registration/
  dependency checks cover compatibility; actual browser demo verification is pending.
- S03–S08: not implemented. The website still uses its original renderer, composer,
  media and transport paths. No shared-website acceptance claim is made.

Next: close the S01 verification/DOM-boundary checkpoints, then wire canonical
message/media widgets into a website message slice while retaining richer features.
