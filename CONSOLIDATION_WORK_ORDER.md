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

- [ ] Add a short current-status entry point in README, linking to runtime
  operations, shared UI ownership, portability acceptance and release evidence.
- [ ] Correct the README statement that current media changes are not deployed,
  using the dated deployment evidence and clearly separating consumer pins.
- [ ] Put current runtime/start/check instructions near the top of AGENTS.md;
  label earlier Deno-only and deployment procedures as historical/superseded.
- [ ] Reconcile old metadata examples that require signed `media_source` with the
  current origin-free new-write contract; retain historical read compatibility.
- [ ] Preserve dated evidence without leaving multiple competing current runbooks.
  Keep detailed runtime procedures in docs/RUNTIME_OPERATIONS.md.
- [ ] Link this work order from README and the relevant existing plans.

Acceptance: a new contributor can identify the default runtime, optional runtime,
data/config preservation rules, shared UI owner, last recorded deployment and
remaining acceptance work without reconstructing a chronological session log.
Any status lacking current evidence is explicitly marked unknown or unverified.

## 2. Prove recovery onto a second isolated node

Extend existing fixture/server/browser harnesses where practical. Use disposable
identities and isolated storage; block external publication, relay/WebSocket
writes and notifications. No production credentials or identity backups belong
in fixtures, logs or source.

- [ ] Inventory the required archive, AndFS manifest/chunk, APDS and anblob storage
  paths. Separate replaceable caches from required durable data. Document any
  identity/key prerequisites separately from content restoration.
- [ ] Build a deterministic fixture set with posts, replies, edits, metadata-only
  profiles (including empty bio/links), inline images, profile original/crop,
  audio/video, an APDS image and an anblob attachment.
- [ ] Persist fixtures on node A, stop it, and export/copy the documented durable
  data to an independent node B using distinct ports and directories.
- [ ] Verify node B after restart while A is unavailable. Select B via configured
  archive/media adapters in the website and a separate-origin application embed.
  Audit requests so hidden calls to A or wiredove.net cannot mask missing data.
- [ ] Assert exact signed archive content/signatures/message IDs and original
  media hashes/bytes before and after recovery. Re-crop must read the restored
  profile original; do not replace original media with a generated thumbnail.
- [ ] Exercise a missing block and a corrupt block: missing content remains
  unavailable/retryable; corrupted bytes never display or play. Restore the
  correct block and prove retry succeeds without editing the signed record.
- [ ] Classify historical absolute references explicitly. If their old origin is
  unavailable, document the existing reader/adapter recovery limit; never claim
  universal failover or rewrite history to make the test pass.
- [ ] Publish exact commands, fixture inventory, expected results and limitations
  in a concise recovery guide. Keep exports/generated storage outside source.

Acceptance: another developer can repeat the exercise from a clean checkout,
restore portable fixtures without A, and verify unchanged signed records and
media. Historical references have an observed compatibility/recovery result,
including any unresolved dependency on an old origin.

## 3. Build a behavior acceptance matrix

Maintain one compact table alongside the shared UI work order. Use one row per
observable behavior, splitting broad features when their status differs.

| Behavior | Website | Separate-origin full embed | Agent-produced fixture | Evidence / gap owner |
| --- | --- | --- | --- | --- |
| Name/photo-only profile; explicit empty bio/links | To verify | To verify | To verify | Pending |
| Post → thread → reply; immediate reload | To verify | To verify | To verify | Pending |
| Edit body, name/image metadata and version history | To verify | To verify | To verify | Pending |
| Inline upload at cursor and preview | To verify | To verify | N/A: authoring UI | Pending |
| Profile original/crop and re-crop | To verify | To verify | To verify: read contract | Pending |
| Image pending, paused, unavailable, retry and arrival | To verify | To verify | To verify: read contract | Pending |
| Verified audio/video and legacy media | To verify | To verify | To verify | Pending |
| Identity/draft recovery and exact signed retry | To verify | To verify | To verify: applicable contracts | Pending |
| Notifications after persistence; failure isolation | To verify | To verify | N/A unless adapter supports it | Pending |

These are checklist placeholders, not claims that existing tests are absent.
Populate from current tests and rerun only the checks needed to establish the
specific claim. Use Verified, Missing, Deferred, Unverified or N/A with a reason.
Agent fixtures are signed input records consumed by the same renderers, not a
third UI implementation.

- [ ] Link every Verified cell to a named assertion/command or dated observation.
- [ ] Check issue #3's edited name/image behavior against the current shared path;
  document whether it still reproduces rather than assuming an old report applies.
- [ ] Review desktop and 390/320px light/dark screenshots for the chosen flows,
  including keyboard retry and warm-service-worker upgrades without clearing identity.
- [ ] Keep physical Safari/mobile evidence distinct from desktop emulation.
  Preserve Ev's deferred accessibility scope; this order does not silently reopen it.
- [ ] Map each remaining gap to the existing shared UI milestone and next concrete
  slice. Do not claim full parity from a successful subset.

## 4. Connect release and synchronization evidence

Create a small release record/template with these fields:

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

- [ ] Keep last recorded observations distinct from newly verified host facts.
- [ ] Verify intended branch tips on both remotes after source changes, following
  AGENTS.md; report unavailable sbot/auth/network access as an explicit blocker.
- [ ] Record intentional consumer lag and its user-visible implications, especially
  today's portable media and profile-card fixes.
- [ ] Never treat GitHub/git-ssb synchronization, a CI pass or a generated artifact
  as proof of production deployment. Keep private backup/config details private.

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

- [ ] Current docs agree and historical evidence is preserved.
- [ ] Second-node recovery is reproducible with byte/signature integrity checks.
- [ ] Behavior matrix records verified results and bounded gaps.
- [ ] Release record separates source, artifacts, remotes and consumer deployments.
- [ ] Remaining work is linked to existing owners/plans; both source remotes are
  verified or their synchronization blocker is reported.

Related references: [shared application plan](SHARED_UI_WORK_ORDER.md),
[portable media](MEDIA_URL_BUG_WORK_ORDER.md),
[media acceptance](WORK_ORDER.md),
[runtime operations](docs/RUNTIME_OPERATIONS.md),
[agent publishing](docs/AGENT_PUBLISHING.md),
[host proxy scope](docs/HOST_PROXY_WORK_ORDER.md).
