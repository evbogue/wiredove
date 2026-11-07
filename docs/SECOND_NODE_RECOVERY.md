# Second-node recovery

Run from a checkout with dependencies installed:

```sh
npm run test:recovery
node tests/recovery.browser.cjs
```

The server check is also part of `npm run test:server`; the browser check is
part of `npm run test:browser`. They use disposable identities, fresh temporary
directories and loopback ports. Nothing is deployed or publicly published.

## What the test proves

`tests/fixtures/recovery-harness.mjs` imports fixture generation, ingestion and
assertion helpers directly. It writes ten signed records to A's real archive API,
a legacy anblob through its existing PUT endpoint, and AndFS blocks/media rows
to A's durable storage. It stops A, copies the stored data to a distinct B
and starts B with the production Node handler. All temporary state is cleaned up.

Direct assertions compare B's records with the fixture export, verify signatures,
authors and IDs, and check profile original/crop references. The existing vendor
disk reader and shared `readAndFSMedia()` verify restored AndFS blocks and HTTP
reads against the original bytes. The media gateway and legacy anblob reads are
also compared byte-for-byte. No test-specific chunk reconstruction is used.

The APDS regression requires B's restored raw image bytes and a working image
adapter. It fails when bytes are missing/corrupt or the adapter is wrong, then
passes after restoration, with signed archive bytes unchanged. The browser check
uses the real shared artifact reader and gallery on B and in a separate-origin
iframe: bad bytes stay unavailable; restored bytes verify and decode after retry.
Browser HTTP requests allow only GETs to the two fixture origins.

These reader/gallery checks do not establish full application parity, video
codec playback, production backup completeness or physical-device acceptance.
The tiny MP4 fixture tests byte preservation, not playable video.

## Back up the actual durable stores

Application data defaults to `./data`; respect configured overrides in
[runtime operations](RUNTIME_OPERATIONS.md) and `server/handler.js`.

| Store | Contents |
| --- | --- |
| `application/records.json` | Exact signed artifacts: IDs, signatures and content |
| `andfs/blocks/` | Content-addressed manifests and chunks |
| `media/*.json` | Upload metadata used by gateway reads and quotas |
| `blobs/` | Historical anblob bytes under their original encoded identifiers |
| `subscriptions.json`, `state.json` | Notification subscriptions/state, separate from content |
| Existing `VAPID_CONFIG_PATH` | Preserve keys for existing subscriptions; never log or commit them |
| Actual APDS browser database or historical image service | Raw image data URLs referenced by hashes in posts and profiles |

**APDS images are separate blobs.** Signed Markdown/profile metadata contains
hash references, not the image data URL bytes. Copying `records.json` alone
cannot restore them. Export raw blobs from the store that holds them, retain
their exact bytes/hashes, restore the store and configure the application's
`legacyImageURL` adapter. The shared artifact reader verifies `{source: data URL}`
responses against signed hashes before caching them.

The test's `recovery-apds-images/` companion directory and `/api/image` adapter
are fixture-only examples. They are not production Wiredove storage APIs.
Production APDS store/adapter availability must be inventoried separately.

Regenerate dependencies and build assets from the reviewed source. Browser
asset caches are replaceable; a browser blob store is not replaceable unless
another available store holds those exact bytes. Signing identities/backups are
separate from content restoration; use Settings backup/import, never source control.

Stop the application before copying durable data. Restore onto an isolated
node, keep A unavailable during validation, and select B through explicit
archive/media/image adapters. Never rewrite signed records or run concurrent
writers against shared data. Deployment/rollback procedures remain in the
[runtime runbook](RUNTIME_OPERATIONS.md).

## Historical-reference limits

| Reference | Recovery requirement |
| --- | --- |
| Origin-free `/#<AndFS hash>` | Configured media service must hold verified blocks |
| Historical absolute AndFS URLs or signed `media_source` | Existing readers retain that source; restoring another node does not provide automatic failover |
| Legacy anblob | Preserve IDs, bytes and the reader's selected source/cache |
| Legacy APDS image/profile hash | Restore the raw data URL blob and a usable image adapter |

## Evidence

- **2026-11-04:** the original exercise reported 91/91 assertions. Its APDS
  check read the source fixture rather than restored bytes, so that image
  recovery claim is superseded. Earlier full-mount/re-crop observations were
  manual harnesses, not the current reproducible reader/gallery checks.
- **2026-11-07:** checked-in server/browser regressions require restored APDS
  bytes, reject missing/corrupt bytes, and verify successful retry with A down.
  Assertions now call shared readers directly instead of interpreting CLI output.

Detailed dated observations remain in
[the prior consolidation record](https://github.com/evbogue/wiredove/blob/074d28cd9a12b88ad0c38e592ec0cd073dee6d6e/CONSOLIDATION_WORK_ORDER.md).
No new host observations or production recovery claims are made here.
