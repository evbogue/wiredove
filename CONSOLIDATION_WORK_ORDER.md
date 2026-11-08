# Consolidate and verify the portable Wiredove application

Created 2026-11-04; narrowed after review 2026-11-07.
Baseline: master `c1832c3670b8b744d253ef1bdf5e7e5c40f448f8`.

## Scope

This work consolidates runtime/status documentation, proves a bounded two-node
restore and fixes the website header regression: body edits must retain the
original name/photo. Standalone controls load the bundled icon font. Recovery
acceptance covers stored bytes and shared readers; full application restore,
re-cropping and video codec playback are outside this branch. It introduces no
production storage API or deployment.

New Timeline ordering scenarios and standalone-widget edit history are excluded.
Remaining acceptance stays in [WORK_ORDER.md](WORK_ORDER.md) and
[SHARED_UI_WORK_ORDER.md](SHARED_UI_WORK_ORDER.md), the sole application-embed plan.

## Preserve

- Exact signed records and previous-message links; no rewriting historical bytes.
- Historical APDS images, profile originals/crops, anblob IDs/readers/storage.
- Origin-free new media writes; service selection through explicit adapters.
- Existing identity, draft, outbox and notification-failure behavior.
- Existing VAPID keys and persistent state; no concurrent runtime writers.

## Deliverables and evidence

- [x] Runtime and current-status entry points agree. README links to the single
  [runtime runbook](docs/RUNTIME_OPERATIONS.md), [behavior matrix](docs/BEHAVIOR_MATRIX.md)
  and [release record](docs/RELEASE_RECORD.md). Historical observations remain dated.
- [x] Deterministic disposable fixtures and a real A → stop → copy → B restore.
  The [recovery guide](docs/SECOND_NODE_RECOVERY.md) owns storage requirements,
  runnable commands and historical-reference limits. Legacy APDS bytes require a
  separate blob backup; signed records contain their hash references only.
- [x] Recovery rejects missing/corrupt bytes and verifies unchanged signed records.
  Server checks use existing verified AndFS readers; the browser checks APDS
  recovery through the shared artifact reader/gallery on two origins.
- [x] Header correction retains original name/photo after body edits; regression
  coverage lives in `tests/image-gallery.browser.cjs`. The shell cache is bumped.
- [x] Remaining acceptance gaps are mapped to existing shared-UI milestones in the
  behavior matrix. Full parity, physical devices and production media inventory
  remain open; this order does not replace those plans.

## Validation and synchronization

Run `npm run check`, `npm test`, `npm run test:media`, `npm run test:server`,
`npm run test:recovery` and `WIREDOVE_TEST_RUNTIME=node npm run test:browser`.
Review screenshots for affected UI. Optional Deno parity remains appropriate for
runtime changes; this slice does not change runtime/storage implementations.

Commit focused source changes and verify the intended branch tip on GitHub and
git-ssb. Report the commit, checks, remaining work and exact sync blockers.
Production and independent consumer deployment require their own release evidence.
No public test messages, uploads or notifications are authorized by this order.

## Evidence ownership

- [Behavior matrix](docs/BEHAVIOR_MATRIX.md): coverage and remaining acceptance.
- [Recovery guide](docs/SECOND_NODE_RECOVERY.md): storage, commands, limits and the
  corrected November 4 APDS recovery claim.
- [Release record](docs/RELEASE_RECORD.md): dated source and deployment evidence.

Related: [media acceptance](WORK_ORDER.md), [portable media](MEDIA_URL_BUG_WORK_ORDER.md),
[agent publishing](docs/AGENT_PUBLISHING.md), [host proxy scope](docs/HOST_PROXY_WORK_ORDER.md).
