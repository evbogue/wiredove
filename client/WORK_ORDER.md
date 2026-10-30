# Wiredove widget parity work order

Status: historical planning notes from the original local widget checkout.
The checkout was committed and reconciled with upstream on 2026-10-29.
Use `../SHARED_UI_WORK_ORDER.md` and `../WORK_ORDER.md` for current architecture
and acceptance status; the starting-point inventory below predates that merge.

## Outcome

The embeddable widget can perform every user-facing Wiredove action supported by the full app, subject to explicit browser permissions and host configuration. A change to a Wiredove feature should normally be made once and reach both surfaces. The widget may use a compact layout, but it must use the same post semantics, validation, storage, publishing, media, and moderation behavior as the app.

## Starting point

- The widget lives in `client/` in `/Users/evbogue/Code/wiredove`. That directory is currently untracked in this checkout. The active `/Users/evbogue/wiredove` checkout has newer AndFS work but no widget directory. Preserve both checkouts' uncommitted work and reconcile them before moving widget code.
- `client/ui.js` independently implements message display, a small feed, search, threads, and a composer. `client/embed-demo.js` supplies sample posts and a simulated publish callback. These do not establish feature parity.
- The app already imports `client/render.js` for avatars and `client/andfs.js` through its media adapter in the widget checkout. This is partial sharing, not a shared application runtime.
- The widget renderer uses `media_url` directly. The current app's AndFS path verifies blocks before playback. Bring the widget onto that verified path; do not treat a signed URL as proof of media bytes.

## Architecture decision

Use one Wiredove application core with two mount points: full app and widget. Keep ANProto and AndFS implementations pinned and unchanged. Put Wiredove-specific adapters and feature logic in shared modules. Each mount point supplies a container, navigation adapter, and layout options; neither reimplements post rules.

```
full app shell ─┐
                ├─ shared Wiredove runtime ─ APDS / ANProto / AndFS / transports
widget shell ───┘             │
                             └─ shared post, thread, composer, profile,
                                search, settings, and moderation components
```

The shared runtime owns identity, local data, sync, retrieval, signature verification, publishing, media verification, moderation decisions, and feed queries. Shared components own behavior and accessible controls. Shells own only layout, available space, host navigation, and embedding configuration. Pass dependencies explicitly to a `createWiredoveApp(...)` or equivalent factory; avoid new `window` globals. Do not make the widget fetch arbitrary unverified post objects merely because a host supplied them.

Keep the existing low-level `client/index.js` exports if other pages use them. Add the application mount API separately; do not silently change a UI-free protocol helper into a full app bootstrap. Avoid a filesystem symlink, copied source tree, or versionless remote module import between the two checkouts. They are temporary workspaces, not the production dependency graph.

## W01 — Reconcile the source tree

- [ ] Inventory commits and dirty files in both Wiredove checkouts. Save a diff or patch for each before moving code. Do not reset either checkout or overwrite the newer media implementation.
- [ ] Bring `client/` into the checkout that will hold the current AndFS implementation. Compare `client/andfs.js`, `client/render.js`, `andfs_media.js`, `media.js`, `render.js`, and `serve.js` against that implementation.
- [ ] Ensure the served module paths and import map work from the consolidated tree. Update `client/README.md` to distinguish protocol helpers, widget UI, and the new app mount API.

Acceptance: one checkout contains both the widget and the latest Wiredove media path, with no lost local changes. The full app still starts and the existing widget demo still loads.

## W02 — Define the shared feature contract

- [ ] Inventory all current Wiredove actions from the app, not just visible buttons: home and author feeds, alias/community feeds, search, post and reply threads, composing, media recording/upload/playback, profiles and profile editing, identity import/export, settings, edit history, sharing, moderation, notifications, and sync/publish status.
- [ ] Create a feature matrix in this folder with columns for app, widget, shared module, and acceptance check. Mark an item complete only after both surfaces use the same behavior.
- [ ] Define the public mount API and lifecycle (`mount`, route/navigation, updates, `destroy`). Decide which browser capabilities need host permission, and show a clear unavailable state when permission is denied.

Acceptance: every user-facing app feature has a named widget route/control or an explicit browser capability limitation, and each has an owner module and verification method.

## W03 — Extract runtime services

- [ ] Move app bootstrap work from `app.js` into an idempotent runtime factory. Initialize APDS, identity, sync, connection, feed storage, and publish status once per app instance. Dispose listeners, timers, subscriptions, media streams, and observers on unmount.
- [ ] Adapt `route.js` and feed orchestration to take a route value and container instead of reading `window.location.hash` or writing to `document.body` internally. Keep URL hash behavior in the full app's navigation adapter.
- [ ] Route compose, reply, edit, profile update, moderation, and settings actions through shared services. Keep exact signed YAML bytes and existing ANProto message IDs. Preserve `reply`, `replyto`, `previous`, and edit semantics.
- [ ] Keep the verified AndFS v1 path shared for new media. Preserve the legacy `blob: anblob:v1:...` reader for historical posts; never reinterpret or rewrite old IDs. Use explicit `createAndFS({ store })` instances and the existing signed upload authorization contract.

Acceptance: the app uses the extracted runtime with unchanged behavior. A second mount can start, navigate, and dispose without duplicate subscriptions or changing the app's global route.

## W04 — Share the feature UI

- [ ] Make the full app and widget use the same message and thread renderer. Remove the widget's parallel Markdown formatter, reply lookup, search filtering, and media renderer once replacements are in place. Rendering must include edits, reply counts/previews, profile data, moderation state, and verified media.
- [ ] Make both surfaces use the same composer logic for text, replies, edits, image/audio/video upload, and recording. Preserve publish confirmation and error states. The widget must publish a real signed post or clearly require a configured identity/transport; the demo's simulated publishing is not production behavior.
- [ ] Share profile and settings behavior, including identity management and moderation controls. Widget layout can be compact, but controls and outcomes must match.
- [ ] Keep styling scoped so embedding does not alter the host page. Ensure keyboard access, focus restoration after navigation, and small-screen layout.

Acceptance: changing a shared component or action is visible in both the app and widget without a second implementation. Widget media is verified before playback and old anblob media remains readable.

## W05 — Wire a real widget and verify parity

- [ ] Replace the sample-data path in `client/embed-demo.js` with a local test runtime using a disposable identity and local relay. Keep a fixture-only example separately if useful.
- [ ] Exercise every row in the feature matrix on both mount points. Include refresh, two simultaneous widgets, unmount/remount, offline/retry, duplicate delivery, corrupt media blocks, denied microphone/camera permission, and a host page with unrelated CSS and hash navigation.
- [ ] Test a signed post, reply, edit, profile update, moderation action, image, audio, and video across app and widget in both directions. Confirm the same IDs, verified bytes, and visible state after reload. Run existing unit tests and add integration tests only for behavior that could diverge between mounts.
- [ ] Document the supported embed API, required origin/CORS and browser permissions, and how to update both surfaces from one code change.

Acceptance: the feature matrix is complete; both surfaces pass the same end-to-end scenarios. Public test posts or deployment require Ev's explicit instruction.

## Implementation rule

Complete one vertical slice at a time: extract a feature, switch the full app to it, switch the widget to it, then run its shared acceptance check. Start with post rendering and navigation, then composing/publishing, then media, profiles/settings/moderation, and finally notifications and sync status. Do not add new widget-only behavior that duplicates an app module.
