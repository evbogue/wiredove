# Shared Wiredove application: closeout

Updated 2026-11-07. Implementation is in use; two closeout checks remain.
This is the sole shared application work order. API details live in
[client/README.md](client/README.md), coverage in the
[behavior matrix](docs/BEHAVIOR_MATRIX.md), and dated deployment evidence in the
[release record](docs/RELEASE_RECORD.md). Earlier plans and session logs remain
in Git history.

## Required result

The website and full JavaScript embeds mount the same application. Hosts supply
configuration and services; shared modules own screens and interactions. Keep
public widget imports inert and application state, routing and cleanup scoped.

The local suites already cover real website ↔ separate-origin application flows,
profiles/photos, posts, threads/replies, body edits and version navigation,
search/pagination, uploads, drafts, exact signed retry, multiple mounts, disposal,
mobile layouts and warm-cache upgrades. These are implemented behaviors, not a
new extraction backlog. See the behavior matrix for the limits of each check.

## Remaining checks

- [ ] **Identity backup import:** use a disposable identity to exercise the actual
  import UI in both full application mounts. After reload, confirm the same public
  key and a valid signature. Reject an invalid backup without replacing the active
  identity. Keep secret backup material out of logs, screenshots and source.
- [ ] **Release verification:** when a release is authorized, deploy the reviewed
  application and update the independently pinned evbogue.com consumer. Verify
  running revisions and public asset hashes, then smoke-test both surfaces. Record
  exact source/deployed pins and rollback information in the release record.
  Source synchronization alone does not complete this check.

Close this order when those checks have evidence. Fix concrete regressions exposed
by them; do not expand this into full feature parity across every browser/backend.

## Scope limits

No discovery redesign, global relay search, advanced query adapters, speculative
service extraction, standalone-widget edit-history feature, static-host demo,
new notification implementation or general accessibility project is required here.
Embeds default to notifications disabled; do not imply unsupported capabilities
succeeded. Existing behavior and public APIs remain supported.

The site's historical-image size limit, production legacy blob inventory and
broader media/device testing belong to [media work](WORK_ORDER.md), not this
application closeout. Physical-device coverage remains unverified; Chromium tests
do not substitute for it. Full application recovery is outside this order.

Preserve exact signed bytes/IDs and reply/edit links, historical APDS images and
anblob readers/storage, verified AndFS reads, profile original/crop metadata,
explicit empty fields, identities, drafts and exact outbox retry. Keep pinned
vendor files unchanged. Remove compatibility code only when its replacement has
observed coverage and preserves those contracts.

This order does not authorize production deployment or public test publication.
