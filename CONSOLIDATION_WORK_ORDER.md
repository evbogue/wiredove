# Consolidate and verify the portable Wiredove application

Created: 2026-11-04
Status: Open — planning only; creating this order does not complete its checks.
Baseline: Wiredove master `1e9544eca2723e213ea8eb89ac8ef7d2f0e21c33`.
Owner: next Wiredove implementation session; Ev / host operator for production observations.

## Outcome

Bring the November 4 work together into one understandable, recoverable application:
signed content identifies immutable records and bytes; shared widgets interpret
them; configured services supply storage and delivery; Node and optional Deno
serve the same application contracts.

Completion means a current architecture/status entry point, a reproducible
second-node restore exercise, an evidence-backed behavior matrix, and a release
record that distinguishes source synchronization from consumer deployment.

This order coordinates consolidation and verification. It does not replace
[SHARED_UI_WORK_ORDER.md](SHARED_UI_WORK_ORDER.md), which remains the sole
application-embed implementation plan. Record newly discovered feature gaps there
and link them here rather than starting a competing rewrite.

## Baseline and evidence limits

Repository records on November 4 report:

- Origin-free new media references (`/#<AndFS manifest hash>`) and configured
  media readers, preserving historical URLs and exact pending signatures.
- Shared empty-body profile-update cards and compact image loading/retry states.
- Node application release `0086c74`, with Deno retained for optional application
  compatibility and independent host services.
- Separate application pins for consumers such as evbogue.com; a Wiredove release
  does not update those pins automatically.
- Required synchronization to both GitHub and git-ssb.

These are repository-recorded observations, not new host verification by this
order. Full shared-application parity and physical-device acceptance remain open.
Portable references do not imply that a second service holds the required blocks.

## Preserve these choices

- ANProto authenticates statements; AndFS hashes authenticate media bytes.
- Synchronization follows interest: a peer syncs from the heads of the authors
  and threads it cares about and stops at the first post it already has. Each
  peer holds its own slice of the network; the per-author chain verifies the
  slice it holds.
- New writes remain origin-free. Keep service selection in adapters/configuration.
- Never rewrite signed historical records or regenerate signatures during restore.
- Preserve APDS images, profile images and anblob readers/identifiers/bytes.
- Keep rendering fixes in shared modules and frames thin. Public widget imports
  must remain inert with respect to website boot, identity and service workers.
- Preserve profile original/crop metadata, explicit empty values, draft recovery,
  exact-byte retries and independent notification failure handling.
- Keep existing VAPID keys and persistent state. Never run two runtime writers
  against the same writable data directory.

## 1. Reconcile current documentation

- [x] Add a short current-status entry point in README, linking to runtime
  operations, shared UI ownership, portability acceptance and release evidence.
- [x] Correct the README statement that current media changes are not deployed,
  using the dated deployment evidence and clearly separating consumer pins.
- [x] Put current runtime/start/check instructions near the top of AGENTS.md;
  label earlier Deno-only and deployment procedures as historical/superseded.
- [x] Reconcile old metadata examples that require signed `media_source` with the
  current origin-free new-write contract; retain historical read compatibility.
  (Done: AGENTS.md audio/video contract no longer lists `media_source` for new
  writes; historical signed `media_source` values stay valid and take precedence
  in readers.)
- [x] Preserve dated evidence without leaving multiple competing current runbooks.
  Keep detailed runtime procedures in docs/RUNTIME_OPERATIONS.md.
  (Done: docs/RUNTIME_OPERATIONS.md now declares itself the single current
  runbook and points to where dated evidence lives — AGENTS.md session entries,
  SHARED_UI_WORK_ORDER.md historical notes, HOST_PROXY_WORK_ORDER.md for
  independent host services. Fixed its relative links to ../AGENTS.md and
  ../HOST_PROXY_WORK_ORDER.md. AGENTS.md's 2026-10-20 Deno deployment steps are
  preserved verbatim and explicitly marked not to be followed.)
- [x] Link this work order from README and the relevant existing plans.
  (Done: README already linked it (release-record bullet); added links from
  SHARED_UI_WORK_ORDER.md, WORK_ORDER.md, MEDIA_URL_BUG_WORK_ORDER.md and
  docs/RUNTIME_OPERATIONS.md. AGENT_PUBLISHING.md and HOST_PROXY_WORK_ORDER.md
  skipped — not consolidation-relevant.)

Acceptance: a new contributor can identify the default runtime, optional runtime,
data/config preservation rules, shared UI owner, last recorded deployment and
remaining acceptance work without reconstructing a chronological session log.
Any status lacking current evidence is explicitly marked unknown or unverified.

## 2. Prove recovery onto a second isolated node

Extend existing fixture/server/browser harnesses where practical. Use disposable
identities and isolated storage; block external publication, relay/WebSocket
writes and notifications. No production credentials or identity backups belong
in fixtures, logs or source.

- [x] Inventory the required archive, AndFS manifest/chunk, APDS and anblob storage
  paths. Separate replaceable caches from required durable data. Document any
  identity/key prerequisites separately from content restoration.
  (Done: docs/SECOND_NODE_RECOVERY.md "Storage inventory" — server paths
  `data/application/records.json`, `data/andfs/blocks/<hash>`,
  `data/media/*.json`, `data/blobs/<anblob id>`,
  `data/subscriptions.json`/`state.json`, `config.json` VAPID keys;
  APDS images ride inside signed records; replaceable caches listed
  (node_modules, dist, SW caches, feed/AndFS browser stores);
  identity keys are client-side-only, disposable test identities for fixtures.)
- [x] Build a deterministic fixture set with posts, replies, edits, metadata-only
  profiles (including empty bio/links), inline images, profile original/crop,
  audio/video, an APDS image and an anblob attachment.
  (Done: tests/fixtures/build-recovery-fixtures.mjs. Fixed seeds for two
  disposable identities (alice 7N5fTOwY…, bob xbZ6l+08…), Date.now pinned
  during signing, fixed media literals, content-addressed AndFS/anblob hashes.
  10 signed records (2 metadata-only profiles with explicit empty bio/links,
  profile original/crop, inline-image post + reply + edit, APDS legacy image,
  anblob audio, AndFS audio/video). Two runs produce byte-identical trees;
  self-verification checks signature opens, id recomputation, author binding
  and manifest resolvability. Exports land outside source via --out;
  inventory.json documents ids/hashes/sizes and expectations. No external
  publication, relay writes or notifications during generation.)
- [x] Persist fixtures on node A, stop it, and export/copy the documented durable
  data to an independent node B using distinct ports and directories.
  (Done: fixtures persisted on A via the node's own APIs — 10 records POSTed to
  /api/application with server-side signature verification, anblob PUT to
  /blobs/<id>, AndFS blocks byte-copied into data/andfs/blocks/, media metadata
  rows in data/media/<hash>.json per server schema. A stopped; all 17 durable
  files sha256-copied to node B; B on a distinct port serves all 10 records,
  5 AndFS media and the legacy anblob with A stopped. sha256 snapshot in goal
  hidden_files for the box-5 assertions.)
- [x] Verify node B after restart while A is unavailable. Select B via configured
  archive/media adapters in the website and a separate-origin application embed.
  Audit requests so hidden calls to A or wiredove.net cannot mask missing data.
  (Done 2026-11-04 ~20:45 CST: server-side verified earlier — B restarted with A
  down, all 10 records and all AndFS/anblob bytes byte-identical to the node-A
  snapshot. This run: website frame mounted from B via
  startWebsiteApplication({network:false, services:{backendURL, mediaURL}}) and a
  separate-origin (127.0.0.1:8130) embed mounted via mountWiredove with explicit
  backendURL/mediaURL to B. Both rendered the fixture feed from B's archive;
  AndFS profile-crop bytes arrived verified from B. Request audit (223 requests,
  2 mounts): zero to 127.0.0.1:8121 or wiredove.net, no page errors, no
  publication/relay/notification writes. Browser check in goal hidden_files:
  select-node-b-browser.cjs. Detail in docs/SECOND_NODE_RECOVERY.md.)
- [x] Assert exact signed archive content/signatures/message IDs and original
  media hashes/bytes before and after recovery. Re-crop must read the restored
  profile original; do not replace original media with a generated thumbnail.
  (Done 2026-11-04 ~20:55 CST: server-side 91/91 assertions in
  `assert-recovery-integrity.mjs` (goal hidden_files) — 10/10 records
  byte-identical, ids recomputed, signatures open and authenticate content,
  authors bound; all 5 AndFS media sha256-match the node-A snapshot with
  /media + /blobs manifest/chunk contracts verified; anblob + APDS legacy
  preserved. UI: `recrop-node-b-browser.cjs` mounted the real shared
  `createProfileEditor` from node B with the fixture photoState and clicked
  "Adjust crop" — the cropper received the restored original bytes (70B,
  sha256 a86fc9c7b91d…, not the crop thumbnail); dialog reported the original
  kept dimensions; request audit clean (zero to A/wiredove.net, no page
  errors). Detail in docs/SECOND_NODE_RECOVERY.md "Integrity assertions".)
- [x] Exercise a missing block and a corrupt block: missing content remains
  unavailable/retryable; corrupted bytes never display or play. Restore the
  correct block and prove retry succeeds without editing the signed record.
  (Done 2026-11-04 ~21:05 CST, node B only, node A down. Deleted the fixture
  inline-image chunk: `/blobs/<chunk>` 404 while `/blobs/<manifest>` stayed
  200; the real shared `createImageGallery` tile showed "Image unavailable"
  with the retry button visible and no image bytes ever assigned. Restored the
  chunk byte-identical; retry loaded it verified (70B, sha256 c414cd0e20…
  matching the node-A snapshot). Flipped a byte in the video chunk: the
  server itself verifies blocks before serving, so `/blobs/<chunk>` 404s —
  corrupted bytes never leave the server; the raw corrupted bytes fed
  straight into the real client-side vendor verifier were also rejected.
  Restored the chunk byte-identical; retry reassembled the video verified
  (24B, sha256 c1ff6974ed…). `records.json` sha256 identical before and
  after (5333206c27…); all 17 durable files re-verified against the node-A
  snapshot. Zero requests to node A or wiredove.net, no page errors in any
  phase. Browser check: `missing-corrupt-block-browser.cjs` phases A–D
  (goal hidden_files); detail in docs/SECOND_NODE_RECOVERY.md
  "Missing/corrupt block exercise".)
- [x] Classify historical absolute references explicitly. If their old origin is
  unavailable, document the existing reader/adapter recovery limit; never claim
  universal failover or rewrite history to make the test pass.
  (Done 2026-11-04 ~21:35 CST: six-kind classification table in
  docs/SECOND_NODE_RECOVERY.md, plus an observed exercise on node B with node A
  down — absolute `http://127.0.0.1:8121/#<manifest>` and legacy
  `/media/<manifest>` references resolve media_source pinned to the dead origin;
  reads fail ("No verified source for blob"), audit shows the /blobs fetches went
  only to the dead origin with zero failover to node B (which holds the bytes);
  origin-free control served+verified from B. `historical-refs-browser.cjs` in
  goal hidden_files.)
- [x] Publish exact commands, fixture inventory, expected results and limitations
  in a concise recovery guide. Keep exports/generated storage outside source.
  (Done 2026-11-04 ~21:45 CST: docs/SECOND_NODE_RECOVERY.md rewritten as the
  repeatable guide — storage inventory, exact build/ingest/snapshot/export/start
  commands with expected results, full fixture inventory table (10 records,
  5 AndFS manifests, APDS hash, anblob id), the 91-check integrity contract,
  and the missing/corrupt + historical-ref observed results with limitations.
  Node-side helpers ported into the repo as tests/fixtures/
  ingest-recovery-fixtures.mjs and assert-recovery-integrity.mjs (env-configurable;
  both validated end-to-end this run: INGEST COMPLETE, 91/91 assertions pass
  with A down. Fixtures regenerate byte-identically. Browser harnesses remain
  recorded in the goal's hidden_files as observed evidence.)

Acceptance: another developer can repeat the exercise from a clean checkout,
restore portable fixtures without A, and verify unchanged signed records and
media. Historical references have an observed compatibility/recovery result,
including any unresolved dependency on an old origin.

## 3. Build a behavior acceptance matrix

Maintain one compact table alongside the shared UI work order. Use one row per
observable behavior, splitting broad features when their status differs.

The current matrix lives in [docs/BEHAVIOR_MATRIX.md](docs/BEHAVIOR_MATRIX.md)
(created 2026-11-04 ~21:50 CST): statuses, named assertions/commands and dated
observations are recorded there. Rows already Verified with evidence links:
name/photo-only profile, post→thread→reply, inline upload, profile original/crop,
image status/retry, verified audio/video + legacy media, and draft/retry
(notifications on website; backup import, body-edit version history, embed-side
notifications, and physical-device evidence remain To verify / gaps). Section-3
boxes 2–5 are done (issue #3 check, screenshot review, evidence provenance,
gap→milestone mapping); section 3 is complete.

- [x] Link every Verified cell to a named assertion/command or dated observation.
  (Done 2026-11-04 ~22:00 CST: every Verified cell in docs/BEHAVIOR_MATRIX.md
  links a named harness assertion (grep-verified in its harness file) or a dated
  release/fixture observation, and the full `npm run test:browser` suite passed
  fresh with `WIREDOVE_TEST_RUNTIME=node` — application-flow 21:50, image-upload,
  image-gallery, composer-notifications, shared-message, application-state and
  application-shadow ~22:00. Rows still To verify (body-edit version history,
  backup import, embed-side notifications) stay honestly marked To verify rather
  than claimed; they are the subject of boxes 2–5, not of this box.)
- [x] Check issue #3's edited name/image behavior against the current shared path;
  document whether it still reproduces rather than assuming an old report applies.
  (Done 2026-11-04 ~22:07 CST; corrected 2026-11-05: issue #3, closed
  2026-10-23, was "edited posts not updating displayed name/image". Its
  premise is superseded by the snapshot semantics Ev stated 2026-11-05: old
  posts keep the name/photo they were posted with; a new post carries the
  current profile. The shared widget keeping the old header was correct; the
  legacy website path was the defect — `render.js` `refreshEdits` merged
  `{...baseYaml, ...currentEdit.yaml}` and `applyProfile` rewrote the
  original's name/image DOM. Fixed 2026-11-05: `refreshEdits` now applies only
  the original record's yaml; browser check
  `edit-header-keeps-original-browser.cjs` (goal hidden_files) passes
  (original keeps Old Name/old avatar, body updates to the edit) and fails on
  pre-fix code; shell cache bumped to v36-edit-header. Remaining gap is
  body-edit version history in the shared widget only. Next slice: a shared
  edit-version lookup showing version history, never merging name/image, to be
  recorded in SHARED_UI_WORK_ORDER.md rather than a competing rewrite.)
- [x] Review desktop and 390/320px light/dark screenshots for the chosen flows,
  including keyboard retry and warm-service-worker upgrades without clearing identity.
  (Done 2026-11-04 ~23:25 CST: warm-SW slice closes the box. Persistent
  browser profile, disposable apds identity (key 8yJtG1E5…, profile_photo refs,
  localStorage marker), real website mount from node B, node A down. Shell cache
  v35-inline-image-status → v36-warm-sw-test via a temporary sw.js version bump
  and same-port/same-data node B restart; registration.update() replaced the
  old cache, reload re-rendered the feed, and pubkey/profile_photo/marker were
  byte-identical after the upgrade. Before/after shots at desktop-light and
  390-dark reviewed, no overflow or page errors; request audit clean (252
  requests, zero to node A/wiredove.net). sw.js reverted, node B restarted
  pristine (10 records). Harness: `warm-sw-upgrade.cjs` in goal hidden_files.
  Earlier slices in this box: feed shots 22:15/22:25; DOM probe 22:35; profile-card
  shots 22:45; thread probe 22:55; title-link thread shots 23:05; keyboard retry
  + 320px 23:15, including the focus-loss note — activating retry drops focus
  to BODY, so a second keyboard retry needs a re-Tab first.)
- [x] Keep physical Safari/mobile evidence distinct from desktop emulation.
  Preserve Ev's deferred accessibility scope; this order does not silently reopen it.
  (Done 2026-11-04 ~23:45 CST: docs/BEHAVIOR_MATRIX.md evidence-provenance
  preamble — all Verified cells are Chromium Playwright emulation or isolated
  live-site checks in that emulated browser; physical-device class empty and
  cross-linked to the unchecked SHARED_UI_WORK_ORDER.md §4 item. AGENTS.md
  release notes audited: 2 unqualified "Live 390px" occurrences annotated in
  place, 6 "Isolated live 390px" occurrences covered by a new provenance note
  in its Browser testing section. Accessibility still deferred, no new claim.)
- [x] Map each remaining gap to the existing shared UI milestone and next concrete
  slice. Do not claim full parity from a successful subset.
  (Done 2026-11-04 ~23:55 CST: gap → milestone mapping table in
  docs/BEHAVIOR_MATRIX.md — all seven remaining gaps (shared-widget edit
  name/image + version history, backup import, embed-side notifications,
  physical-device evidence, legacy stored media on production, historical
  absolute-reference failover, keyboard-retry focus loss) map to existing
  unchecked SHARED_UI_WORK_ORDER.md milestone 2/3/4 items with a named next
  concrete slice; the issue #3 shared-widget gap is now recorded in
  SHARED_UI_WORK_ORDER.md. No row promoted to Verified; accessibility stays
  deferred.)

## 4. Connect release and synchronization evidence

Create a small release record/template with these fields (kept in
[docs/RELEASE_RECORD.md](docs/RELEASE_RECORD.md), created 2026-11-05):

| Field | Required evidence |
| --- | --- |
| Reviewed source | Repository, branch, full commit and check results |
| Distributed embed | Source pin, generated manifest/artifact hashes, build check |
| GitHub | Fresh observed branch tip and time |
| git-ssb | Repository ID, fresh observed branch tip and time |
| Wiredove production | Observed service runtime/revision and public asset hashes |
| Separate consumers | Each consumer's source pin, deployed pin or Unknown |
| Compatibility | Fixture/matrix result and explicit deferred gaps |
| Recovery | Backup/rollback procedure reference and observed restore result |

- [x] Keep last recorded observations distinct from newly verified host facts.
  (Done 2026-11-05 ~00:05 CST: docs/RELEASE_RECORD.md created with a
  three-label provenance rule — Last recorded / Newly verified / Unknown —
  applied to every field. Newly verified this run, read-only: GitHub master tip
  c1832c3 via ls-remote; local HEAD ae50685 is 31 commits ahead, unpushed.
  git-ssb Unknown (no ssb remote configured, no sbot query). Production
  0086c74 and evbogue.com pin remain Last recorded, explicitly not re-verified.)
- [x] Verify intended branch tips on both remotes after source changes, following
  AGENTS.md; report unavailable sbot/auth/network access as an explicit blocker.
  (Done 2026-11-05 ~01:25 CST: GitHub master freshly verified via ls-remote —
  c1832c3, unchanged; local HEAD 7be86b2 is 32 commits ahead, unpushed per Ev's
  instruction. git-ssb repo located in the sbot log (git-repo
  %Nt7ziOIyUsdpFl865jpnstgZsDXYM+asm/jTjw/wmuc=.sha256); latest replicated
  git-update (seq 282, 2026-11-01) sets master = f634698, 53 commits behind
  local HEAD. sbot was down at run start — stale lock from a VM replacement —
  and was restarted via agent:preflight; the sbot git-over-HTTP endpoint still
  returns "Not found" for the repo id, so the git-ssb tip is log-observed, not
  ls-remote-verified. No ssb remote configured yet. Detail in the 01:25 entry
  of docs/RELEASE_RECORD.md. Neither remote carries the intended tip, by Ev's
  no-push instruction — verification, not synchronization.)
- [x] Record intentional consumer lag and its user-visible implications, especially
  today's portable media and profile-card fixes.
  (Done 2026-11-05 ~01:35 CST: "Consumer lag" section in docs/RELEASE_RECORD.md.
  evbogue.com pin newly verified read-only — `2992b9d` (pinned by `65c8175`,
  origin/master tip `d16c5d5`) — 14 commits behind production `0086c74`, which
  contains all three Nov 4 fixes. Visitor-visible on evbogue.com: stuck-image
  behavior (pre-`2434ba9`), blank "Notes" for name/photo-only profile updates
  (pre-`837df34`), old image status/retry (pre-`a25a0be`), images appended not
  cursor-inserted (pre-`9b180e6`), origin-coupled media writes/reads
  (pre-`ac8fb9e`, diff-verified). Production itself has no lag on these fixes;
  source HEAD is 36 commits ahead but docs/recovery only. Closing the
  evbogue.com lag = pin `0086c74`+ via pin-wiredove.js and deploy; Ev's call,
  not scheduled here.)
- [x] Never treat GitHub/git-ssb synchronization, a CI pass or a generated artifact
  as proof of production deployment. Keep private backup/config details private.
  (Done 2026-11-05 ~01:35 CST: "Deployment proof rule" section in
  docs/RELEASE_RECORD.md — proof of deployment = host-observed service
  revision + public asset hashes; GitHub/git-ssb tip = source sync only
  (neither remote currently carries the intended tip), CI pass = checks on
  reviewed source (workflow is `contents: read`, no deploy step), generated
  artifact = built-from-source proof only. Privacy audit this run: grep of the
  work-order docs found no secret material — backup/config paths only, no key
  values or identity backups; future entries must keep it that way.)

Acceptance: a reviewer can determine exactly which revision each consumer runs,
which observations remain unverified, and what was actually restored/tested.

## Execution and validation

1. Refresh both remotes and inspect current instructions; reconcile documentation
   and add the status/matrix/release structure first.
2. Add the bounded second-node recovery exercise and reuse existing signed fixtures.
3. Run relevant checks, fill the evidence cells, and prioritize the smallest
   remaining shared-UI slice revealed by the results.
4. Commit focused changes, synchronize both remotes and report exact blockers.
   Production or consumer release is a separate action under existing release rules.

For implementation changes use the applicable current commands:
`npm ci`, `npm run check`, `npm test`, `npm run test:media`,
`npm run test:server`, and browser acceptance with the actual Node application
backend. Use optional Deno parity checks when runtime/storage code changes.
Review browser screenshots; retain physical-device gaps explicitly.
For documentation-only changes, verify links and consistency; no application
test run is required merely to create this work order.

## Scope and completion

Excluded: host proxy migration, removal of Deno from unrelated services, protocol
redesign, a new replication network, rich-text editor replacement, transcoding,
adaptive streaming and broad feature expansion.

- [x] Current docs agree and historical evidence is preserved.
  (Done 2026-11-05 ~09:05 CST: verification pass over README, AGENTS.md,
  docs/RUNTIME_OPERATIONS.md, docs/SECOND_NODE_RECOVERY.md,
  docs/BEHAVIOR_MATRIX.md and docs/RELEASE_RECORD.md. Runtime (Node 22+,
  Deno optional), origin-free media contract, single runbook, consumer-pin
  separation and release pins all agree; every commit count in the release
  record re-verified against git (GitHub 35 behind HEAD, git-ssb 56 behind,
  14 commits 2992b9d→0086c74, f634698 21 behind the GitHub tip). Dated
  AGENTS.md evidence and the verbatim superseded Deno procedure are intact.
  One fix: README now links docs/RELEASE_RECORD.md directly instead of only
  via this work order.)
- [x] Second-node recovery is reproducible with byte/signature integrity checks.
  (Done 2026-11-05 ~11:05 CST: full exercise re-run from the guide's exact
  commands on a clean slate. Two fixture builds byte-identical
  (determinism); ingest on A, export of 17 durable files sha256-verified,
  node B on :8122 with A down serves all 10 records and media; integrity
  assertions 91/91, 0 failures — ids recomputed, signatures re-verified,
  media sha256-match the node-A snapshot. Fixture inventory (identities,
  record ids, manifest hashes, APDS hash, anblob id) matches the guide.
  The pass found two guide gaps, both fixed in docs/SECOND_NODE_RECOVERY.md:
  step 3 omitted the node-A restart the ingest script needs before its
  /media checks pass (first run: 10 FAILURES, all /media 404s; after
  restart: INGEST COMPLETE), and step 4's tar extract failed because
  /tmp/recovery-node-b/data did not exist (step 2 now creates both data
  dirs). Sync-philosophy intro added 2026-11-05 is consistent with the
  work order's preserved choices — no contradiction.)
- [x] Behavior matrix records verified results and bounded gaps.
  (Done 2026-11-05 ~12:05 CST: verification pass over docs/BEHAVIOR_MATRIX.md
  plus the fix it prompted. Every Verified cell links a named harness
  assertion or dated observation; the three To-verify cells are genuinely
  bounded (row 3 shared-widget body-edit version history only, row 8 identity
  backup import with no named harness, row 9 embed-side notifications pending
  a capability decision); all seven remaining gaps map to shared-UI
  milestones with a next concrete slice and no row is promoted by the mapping.
  Evidence provenance stays honest: emulated-browser only, physical-device
  class empty. The pass found the row-3 framing backwards per Ev's snapshot
  semantics (old posts keep their posted name/photo) — fixed the same day:
  legacy `render.js` `refreshEdits` no longer merges an edit's name/image
  into the original header, verified by `edit-header-keeps-original-browser.cjs`
  with a negative control failing on pre-fix code; shell cache v36-edit-header;
  matrix, work order and SHARED_UI_WORK_ORDER.md corrected to match.)
(Discarded 2026-11-05 per Ev: the final two sign-offs — "Release record
separates source, artifacts, remotes and consumer deployments" and "Remaining
work is linked to existing owners/plans; both source remotes are verified or
their synchronization blocker is reported" — were dropped. The work order
stands complete with sign-offs 1–3 checked.)

Related references: [shared application plan](SHARED_UI_WORK_ORDER.md),
[portable media](MEDIA_URL_BUG_WORK_ORDER.md),
[media acceptance](WORK_ORDER.md),
[runtime operations](docs/RUNTIME_OPERATIONS.md),
[agent publishing](docs/AGENT_PUBLISHING.md),
[host proxy scope](docs/HOST_PROXY_WORK_ORDER.md).
