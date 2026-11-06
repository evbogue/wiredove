# Wiredove release record

Created: 2026-11-05. Part of
[CONSOLIDATION_WORK_ORDER.md](../CONSOLIDATION_WORK_ORDER.md) §4.

## Provenance rule

Every cell carries one of three labels — this is the rule §4 box 1 exists to
enforce:

- **Last recorded** — a dated observation copied from an earlier session
  (source named). It is *not* a claim about the present.
- **Newly verified** — observed in this entry's run, with the method and time
  named. Only these cells describe current host/remote state.
- **Unknown / not verified** — nobody has observed it; do not read it as a fact.

A GitHub/git-ssb sync, a CI pass, or a generated artifact is never proof of
production deployment. Private backup/config details stay private; this record
names paths only, never secrets or keys.

## Deployment proof rule (§4 box 4)

Only one thing proves a production deployment: a **Newly verified** entry
whose Wiredove production field was observed on the host — the service's
running revision (unit `WorkingDirectory` / release worktree) **plus** public
asset SHA-256 hashes matching the reviewed release. An HTTP 200 alone does
not prove it (AGENTS.md, deployment procedure step 5). Everything else proves
something narrower:

- **GitHub / git-ssb tip** — source synchronization only. A tip says which
  commit a remote holds, not what any host serves. Neither remote currently
  carries the intended tip anyway (GitHub `c1832c3`, git-ssb `f634698`,
  both behind local HEAD — see the 01:25 entry), and even a fully synced tip
  would prove nothing about the host.
- **CI pass** — checks on the reviewed source only. The workflow
  (`.github/workflows/media-prototype.yml`) runs with `contents: read` and has
  no deploy step; it builds a test image, runs the suites and compares a
  public VAPID key across a container restart. README already states passing
  checks do not deploy production; RUNTIME_OPERATIONS.md states CI does not
  deploy services.
- **Generated artifact** (distribution manifest, pinned embed, Docker image)
  — proves the artifact was built from a given source revision. It says
  nothing about what wiredove.net or any consumer actually serves; a pin
  only takes effect when the consumer deploys it (see "Consumer lag" above).

**Privacy.** This record names backup/config *paths* only — release
worktrees, service units, `/root/deploy-backups/...`, `VAPID_CONFIG_PATH` —
never key values, identity backups, or backup contents. Audit 2026-11-05
~01:35 CST: a grep of the work-order docs found no secret material, only
path references and "never log/commit secrets" instructions. Future entries
keep it that way: paste no config contents, key material, or private
identifiers here, even to "prove" a deployment.

## Current entry — 2026-11-05 ~01:25 CST (§4 box 2: remote-tip verification)

| Field | Status | Evidence |
| --- | --- | --- |
| Reviewed source | **Newly verified** 2026-11-05 ~01:25 CST | Repository `evbogue/wiredove`, branch `master`, local HEAD `7be86b26621ca32b1d5c065307f615ae43241f34` ("Consolidation section 4 (box 1 complete)"). No full check run in this entry — verification-only change. |
| Distributed embed | **Last recorded** 2026-11-04 | Release `0086c74` distribution manifest hashes matched source at deploy time (AGENTS.md, "Node application migration completed"). No new artifact hashes generated or verified in this entry. |
| GitHub | **Newly verified** 2026-11-05 ~01:25 CST | Fresh `git ls-remote --heads origin`: `master` = `c1832c3670b8b744d253ef1bdf5e7e5c40f448f8` (unchanged since 00:05). Local HEAD is 32 commits ahead and **not pushed** — push held at Ev's instruction ("push later"). GitHub tip is an ancestor of local HEAD. |
| git-ssb | **Newly verified from replicated log** 2026-11-05 ~01:25 CST | Repository `wiredove` found in the local sbot log: git-repo `%Nt7ziOIyUsdpFl865jpnstgZsDXYM+asm/jTjw/wmuc=.sha256`, author `@i7QTqNGYi4C50vrM5Ued//J2Ovj65sagIWv67s0h72U=.ed25519`. Latest git-update in the log (seq 282, 2026-11-01T20:59:29Z, `%h/+2yl732kjgTimLza07Ws4vq1RoV30fj3mzmhJuzdQ=.sha256`): `refs/heads/master` = `f634698253096a66d5da75aa56977d84d9296c85` — the 2026-11-01 legacy-compatibility release, 53 commits behind local HEAD and ~21 behind the GitHub tip. Caveats: the local sbot's git-over-HTTP endpoint returns "Not found" for this repo id, so `git ls-remote ssb` did not work — the tip above comes from replicated log messages, not a live endpoint query, and reflects only what this sbot has replicated. sbot was down at run start (stale `~/.ssb/server.lock`, pid 1795, from a VM replacement; uptime 1 min) and was restarted via `npm run agent:preflight` in `~/workspace/ssbc` before the query. No `ssb` remote is configured in this checkout yet; the repo id above is the one to use. **Not pushed** — push held at Ev's instruction. |
| Wiredove production | **Last recorded** 2026-11-04, **not re-verified** in this entry | Last recorded deployment: application `0086c74` at `/root/wiredove-release-0086c74`, Node 22.22.0 via `/usr/bin/node serve-node.js`, port 8081, shared `/root/wiredove/data`, existing VAPID config. Rollback release `/root/wiredove-release-a25a0be`; backup `/root/deploy-backups/wiredove-node-0086c74/`. No host observation (SSH/systemd/public hashes) was made in this entry, so nothing here claims the current live revision. |
| Separate consumers | **Last recorded** 2026-11-01–04, current pin **Unknown** | evbogue.com: last recorded `65c8175` pinning application `2992b9d` (2026-11-01); the 2026-11-04 releases explicitly did not update its separate pin. Its *current* deployed pin was not observed in this entry. |
| Compatibility | **Last recorded** 2026-11-04 | Fixture/matrix result: second-node recovery verified on isolated node B (SECOND_NODE_RECOVERY.md, 91/91 integrity assertions); behavior matrix in BEHAVIOR_MATRIX.md with deferred gaps (shared-widget edit name/image + version history, backup import, embed-side notifications, physical-device evidence, legacy stored media on production, historical absolute-reference failover, keyboard-retry focus loss). |
| Recovery | **Last recorded** 2026-11-04 | Backup/rollback procedure: RUNTIME_OPERATIONS.md ("Production cutover and rollback"). Observed restore: deterministic fixtures restored onto isolated node B with node A down, byte/signature-verified (SECOND_NODE_RECOVERY.md). |

## Consumer lag — 2026-11-05 ~01:35 CST (§4 box 3)

Intentional by design: a Wiredove release never updates a consumer's pin
automatically (work-order baseline; every 2026-11-04 release note repeats that
the separate pin was not changed). Closing lag is a separate deliberate action:
run `scripts/pin-wiredove.js` in evbogue.com at a chosen Wiredove revision,
verify the manifest hashes, then deploy evbogue.com. Nothing in this section
was deployed or re-pinned — it records the lag as observed.

The pin script copies only `client`, `vendor`, `style.css` and `LICENSE`, so
only client-side changes reach a consumer through a pin. Server/runtime
changes (Node migration, agent-publishing docs) do not reach evbogue.com
that way.

| Consumer | Deployed pin | Lag | User-visible implications |
| --- | --- | --- | --- |
| wiredove.net (production) | **Last recorded** `0086c74` (2026-11-04 15:13 CST; not re-verified in this run) | None on the fixes below — `0086c74` contains `ac8fb9e`, `837df34` and `a25a0be` (verified ancestors). Source HEAD `97b6916` is 36 commits ahead, but all 36 are consolidation docs/recovery work with no application behavior change, so there is no user-visible lag between production and source. Source-sync lag is separate: GitHub tip `c1832c3`, 33 commits behind local HEAD; git-ssb 53+ behind (see §4 box 2 entry above). | — |
| evbogue.com timeline | **Newly verified** `2992b9d4a9a7726f35e788ebe2df8d8bf2a14611` (2026-11-05 ~01:30 CST, read-only fetch of origin/master; manifest `timeline/wiredove-client.json`, pinned by `65c8175` "Pin shared profile settings and message-control widgets from Wiredove 2992b9d", 2026-11-01; origin/master tip `d16c5d5`, 2026-11-04 15:26 CST) | 14 Wiredove commits, `2992b9d` (2026-11-01 16:03) → `0086c74` (2026-11-04 15:13). The local evbogue.com clone was stale at `af31961` (2026-10-31) and was not updated — only `origin/master` was fetched, read-only. | Visitors to the evbogue.com timeline see the 2026-11-01 client: (1) **Stuck images** — predates `2434ba9`: an image request can stick on "Waiting to request image…" (reported Firefox Android); no 45s queued timeout and paused requests never resume. (2) **No profile-update cards** — predates `837df34`: name/photo-only, empty-bio and links-only statements render as blank "Notes" and do not apply the new name/avatar (e.g. the Muse statement `IODOsK+3+VuPx4bzmSa11w7ZC1hXC9aZWT59a1qgZ9Q=`). (3) **Old image status** — predates `a25a0be`: pending/unavailable images show full text status instead of compact symbols, and retry can open an empty viewer instead of retrying inline. (4) **Composer images append** — predates `9b180e6`: uploaded images go to the end of the post, not the cursor. (5) **Origin-coupled media** — predates `ac8fb9e` (verified diff): uploads via the shared client still sign absolute `<origin>/#<hash>` URLs plus signed `media_source`, and readers resolve through that pinned origin with no configured-mediaURL selection — so media stays coupled to the origin that served the composer, and historical absolute references have no failover (see SECOND_NODE_RECOVERY.md box 7). The `cd7c09e` hash-only navigation is already in `2992b9d`, so `/#hash` routes themselves work. Record-only commits in the range (`cf7aeba`, `ebe6538`, `0d170c2`, `cb5337f`, `da8adce`, `3db063a`, `583f197`) change no visitor behavior. |

Closing the evbogue.com lag means pinning `0086c74` or later (once the
intended revision is pushed — GitHub currently stops at `c1832c3`) and
deploying evbogue.com. That is Ev's call; this record does not schedule it.

## Current entry — 2026-11-05 ~00:05 CST

| Field | Status | Evidence |
| --- | --- | --- |
| Reviewed source | **Last recorded** 2026-11-04; local HEAD newly verified | Repository `evbogue/wiredove`, branch `master`, local HEAD `ae50685e7b0842dda08f8572afa7818688c57aa2` (verified 2026-11-05 ~00:05 CST, `git log`). Last full check results recorded 2026-11-04: build/frozen check, 46 unit tests, 14 media tests, 18 server tests, full browser suite with the real Node backend. No full check run in this entry — documentation-only change. |
| Distributed embed | **Last recorded** 2026-11-04 | Release `0086c74` distribution manifest hashes matched source at deploy time (AGENTS.md, "Node application migration completed"). No new artifact hashes generated or verified in this entry. |
| GitHub | **Newly verified** 2026-11-05 ~00:05 CST | `git ls-remote --heads origin`: `master` = `c1832c3670b8b744d253ef1bdf5e7e5c40f448f8`. Local HEAD `ae50685` is 31 commits ahead of that tip and **not pushed** — push held at Ev's instruction ("push later"). GitHub tip is an ancestor of local HEAD. |
| git-ssb | **Unknown / not verified** | No `ssb` remote is configured in this checkout (`git config --get remote.ssb.url` empty, checked 2026-11-05 ~00:05 CST). No sbot query was made in this entry. Repository ID and branch tip are therefore unknown here, not merely stale. |
| Wiredove production | **Last recorded** 2026-11-04, **not re-verified** in this entry | Last recorded deployment: application `0086c74` at `/root/wiredove-release-0086c74`, Node 22.22.0 via `/usr/bin/node serve-node.js`, port 8081, shared `/root/wiredove/data`, existing VAPID config. Rollback release `/root/wiredove-release-a25a0be`; backup `/root/deploy-backups/wiredove-node-0086c74/`. No host observation (SSH/systemd/public hashes) was made in this entry, so nothing here claims the current live revision. |
| Separate consumers | **Last recorded** 2026-11-01–04, current pin **Unknown** | evbogue.com: last recorded `65c8175` pinning application `2992b9d` (2026-11-01); the 2026-11-04 releases explicitly did not update its separate pin. Its *current* deployed pin was not observed in this entry. |
| Compatibility | **Last recorded** 2026-11-04 | Fixture/matrix result: second-node recovery verified on isolated node B (SECOND_NODE_RECOVERY.md, 91/91 integrity assertions); behavior matrix in BEHAVIOR_MATRIX.md with deferred gaps (shared-widget edit name/image + version history, backup import, embed-side notifications, physical-device evidence, legacy stored media on production, historical absolute-reference failover, keyboard-retry focus loss). |
| Recovery | **Last recorded** 2026-11-04 | Backup/rollback procedure: RUNTIME_OPERATIONS.md ("Production cutover and rollback"). Observed restore: deterministic fixtures restored onto isolated node B with node A down, byte/signature-verified (SECOND_NODE_RECOVERY.md). |

## How to add an entry

Copy the table above, date it, and re-label every cell. A cell keeps its
**Last recorded** label (with its original date and source) until a new
observation replaces it — never silently promote an old observation to
current fact by re-dating it. If a remote or host cannot be reached, record
the blocker in the cell (e.g. "Blocked: sbot unavailable") instead of
leaving the old value to look current.
