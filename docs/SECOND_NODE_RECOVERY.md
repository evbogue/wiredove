# Second-node recovery guide

Status: complete — section 2 of CONSOLIDATION_WORK_ORDER.md (boxes 1–8 done
2026-11-04; committed locally, not pushed).
Goal: restore a Wiredove application node from durable data alone, proving
that portable fixtures (signed content + media bytes) recover on an isolated
second node without the first node available.

Synchronization is per-interest: a peer follows the heads of the authors and
threads it cares about and walks each chain back until it reaches a post it
already has. This guide restores one node's own durable slice — the records
and blocks it holds — not a canonical copy of the whole network, because
peers hold different slices and there is no single state to converge on. The
per-author chain is what makes the restored slice verifiable.

Rules: use disposable identities and isolated storage, ports and directories.
Block external publication, relay/WebSocket writes and notifications.
Never use production credentials or identity backups. Never rewrite signed
historical records or regenerate signatures during restore.

## Storage inventory (section 2, box 1)

All server paths below live under `DATA_DIR` (default `./data` in the
checkout root). Overrides: `APPLICATION_DATA_DIR`, `BLOB_DIR`,
`MEDIA_DATA_DIR`, `VAPID_CONFIG_PATH` (see `server/handler.js`).

### Required durable data — copy this to node B

| Path | Contents | Why required |
| --- | --- | --- |
| `data/application/records.json` | Append-only archive of signed artifacts (`{id, signature, content}`); each record verified with `an.open` on write | The signed content itself. IDs and signatures are checked byte-exact before/after restore. |
| `data/andfs/blocks/<hash>` | Content-addressed AndFS store: manifests and chunks share one flat namespace keyed by block hash | Manifest hash in signed content authenticates the bytes; without the blocks, media is unreadable. |
| `data/media/*.json` | Per-upload metadata rows (`andfs`, `mime`, `media_size`, `media_url`, author upload counters) | Map from manifest hash to served metadata, range requests and quota accounting. |
| `data/blobs/<encodeURIComponent(anblob:v1:raw\|chunked:sha256:…)>` | Legacy `anblob:v1` blobs (PUT/GET/HEAD over `/blobs/`) | Historical audio/video/image content; readers still serve them. |
| `data/subscriptions.json`, `data/state.json` | Web Push subscriptions and notification state | Required to keep notifications working after restore; separable from content. |
| `config.json` (`VAPID_CONFIG_PATH`, default `./config.json`) | VAPID keypair for Web Push | Without it, existing push subscriptions are unusable. Keep existing keys; never rotate during recovery. |

APDS image blobs are **not** a separate server store: they are data URLs
embedded in signed content (references `![](hash)`), so they restore as part
of `records.json`.

### Replaceable caches — do not copy, regenerate locally

- Server: `node_modules/` (from `npm ci`), `dist/` build artifacts (from
  `npm run check`), `.upload-parts/` (failed workaround, ignore),
  `test-results/`, leftover `<file>.<uuid>.tmp` upload temporaries
  (PUT cleans these on completion; crashed writes can leave orphans).
- Client: service-worker asset caches (sw.js shell cache, bump to force a
  refresh), `feed_row_cache.js` IndexedDB feed cache, the browser AndFS
  block store (`andfs-v1` IndexedDB — verified bytes are re-fetchable),
  profile/photo caches.

### Identity and key prerequisites — separate from content restoration

- Signing keys live **client-side** (browser storage), never on the server
  and never in `data/`. Export/import identity only through the Settings
  backup download (`identity_backup.js`).
- For the recovery exercise: use **disposable test identities**, exported and
  imported into an isolated browser context on node B. Never use production
  identities or real backup files.
- Identity backups contain secret keys: never commit, screenshot or log them.
  Restore must not require any server-side secret; content restore is the
  public records + blocks above, independent of which identity reads them.

## Fixture set (section 2, box 2)

`tests/fixtures/build-recovery-fixtures.mjs` builds the deterministic fixture
set: posts, replies, edits, metadata-only profiles (empty bio/links), inline
images, profile original/crop, audio/video, a legacy APDS image and a legacy
anblob attachment.

```
node tests/fixtures/build-recovery-fixtures.mjs [--out <dir>]   # default: OS temp dir
```

Determinism: both disposable identities derive from fixed SHA-256 seeds,
`Date.now` is pinned during signing (fixed instant 2026-11-04T12:00:00Z),
media bytes are fixed literals and AndFS/anblob hashes are content-addressed.
Two runs with the same `--out` produce byte-identical trees. Generation makes
no external publication, relay writes or notifications. `inventory.json`
documents ids, hashes, sizes and expectations.

Fixture inventory (identities: alice `7N5fTOwYn3ZF73hi6IBYcecmZfSbra2BfruUTEClzUM=`,
bob `xbZ6l+08R9ny/VDlq06lQowLUoq/OqMsxY65ZYDDmV4=`):

| Kind | Record id (prefix) | Author | Expectation |
| --- | --- | --- | --- |
| profile-metadata-only-empty | `gosB7EzMlXGB` | alice | Empty bio and empty links are explicit signed values; body empty |
| profile-original-crop | `siGflWN0vvGR` | alice | Re-crop must read the restored original bytes, never a generated thumbnail |
| post-inline-image | `CvdRTQL+wi7G` | alice | Inline AndFS image, origin-free `/#<manifest>` reference |
| post-edit | `D6jC7XuHMIG6` | alice | Edit references `edit=<post id>`; original record bytes unchanged |
| post-apds-image | `USvqVr1QbnUk` | alice | Reference is the 44-char hash of the APDS data URL (hash `dVJbDoJydbF4FA2r40EbkvDVa01XeTxQkyn6DU7DPXw=`) |
| post-anblob-audio | `K7eec0PyIwBa` | alice | Legacy `anblob:v1:raw:sha256:bt6m2jQAiXoero3t4HwThDz_0CqR3DWZzR9UKpqIi-U`, 52 bytes; corrupted bytes must never display or play |
| post-andfs-audio | `ONvQ3ZrBgWsl` | alice | AndFS WAV (8kHz 8-bit mono), manifest `2SPYuMz1PjVHa2jWW1InUY9r_xcUUD9jevG3WJFSG1Y` |
| post-andfs-video | `devDrg2Lm/i/` | alice | AndFS MP4 (ftyp only), manifest `OGB0yIEG_u2HufvRM76H6JbjzI90NDXvY96iusu3rrk` |
| profile-metadata-only-empty | `WBrgdTFLoMKk` | bob | Second identity's empty metadata-only profile |
| reply | `55mckYbyhtEB` | bob | Reply to the inline-image post |

AndFS media manifests: inline image `Lir9zPtV9EUD3wZzRk-Mg2OO0ttOXVd933XTje7zeLA`
(70B), profile original `c_GbZcm8Eh2E3S3WiPNdLxKWi_pLP2WQ3QYZqEmmuI4` (70B),
profile crop `QVs4NLnPSHLlvgV0WDs9gFoHywUoaBx6X258MmaRhRQ` (40B).

## Restore and restart (section 2, boxes 3–4)

`tests/fixtures/ingest-recovery-fixtures.mjs` persists fixtures on a node
through its own APIs (records POSTed to `/api/application` with server-side
signature verification, anblob PUT to `/blobs/<id>`, AndFS blocks byte-copied
into `data/andfs/blocks/`, media rows written per the server schema) and
verifies the serve path. Environment overrides: `FIXTURES_DIR`, `NODE_URL`,
`NODE_DATA_DIR`.

Exact exercise commands (observed 2026-11-04):

```
# 1. Fixtures (byte-identical every run).
node tests/fixtures/build-recovery-fixtures.mjs --out /tmp/recovery-a

# 2. Node A on an isolated loopback port with an isolated data dir.
mkdir -p /tmp/recovery-node-a/data /tmp/recovery-node-b/data
cd <checkout> && HOST=127.0.0.1 PORT=8121 DATA_DIR=/tmp/recovery-node-a/data \
  VAPID_CONFIG_PATH=/tmp/recovery-node-a/config.json node serve-node.js &

# 3. Ingest on A (exits non-zero on any failure). Media rows are loaded at
# server startup, so the first run's /media checks 404 — that is expected.
# Restart A so it loads the new rows, then re-run the script: duplicate
# record POSTs are accepted, and the /media reads then pass.
FIXTURES_DIR=/tmp/recovery-a NODE_URL=http://127.0.0.1:8121 \
  NODE_DATA_DIR=/tmp/recovery-node-a/data \
  node tests/fixtures/ingest-recovery-fixtures.mjs
# (First run: 10 FAILURES, all on /media reads.)
kill <node-A pid>
cd <checkout> && HOST=127.0.0.1 PORT=8121 DATA_DIR=/tmp/recovery-node-a/data \
  VAPID_CONFIG_PATH=/tmp/recovery-node-a/config.json node serve-node.js &
FIXTURES_DIR=/tmp/recovery-a NODE_URL=http://127.0.0.1:8121 \
  NODE_DATA_DIR=/tmp/recovery-node-a/data \
  node tests/fixtures/ingest-recovery-fixtures.mjs
# Expected: INGEST COMPLETE — 10 records POSTed (server verified each
# signature), anblob PUT 204, 5 media rows written, 10 records + 5 /media
# reads all 200 with reassembled sizes matching manifests.

# 4. Snapshot A's durable files, stop A, export to B (sha256-verified copy).
kill <node-A pid>
cd /tmp/recovery-node-a/data && find . -type f \
  \( -path "./application/*" -o -path "./andfs/blocks/*" \
     -o -path "./media/*" -o -path "./blobs/*" \) | sort | xargs sha256sum > /tmp/snapshot-a.txt
(cd /tmp/recovery-node-a/data && tar cf - application andfs media blobs) | \
  tar xf - -C /tmp/recovery-node-b/data
# Expected: 17 durable files; sha256 of each file identical to the snapshot.
# (subscriptions.json/state.json absent: separable from content; no real
# subscriptions in this exercise.)

# 5. Node B on a distinct port with A down.
cd <checkout> && HOST=127.0.0.1 PORT=8122 DATA_DIR=/tmp/recovery-node-b/data \
  VAPID_CONFIG_PATH=/tmp/recovery-node-b/config.json node serve-node.js &
# Expected: B serves all 10 records and all media with A unavailable.
```

Website and separate-origin selection (observed 2026-11-04, A down): the
website frame mounted from B via
`startWebsiteApplication({network:false, services:{backendURL, mediaURL}})` and
a separate-origin (127.0.0.1:8130) embed mounted with explicit
`{backendURL, mediaURL}` to B. Both rendered the fixture feed from B's
archive; the profile-crop bytes arrived verified from B. Request audit (223
requests, 2 mounts): zero to node A or wiredove.net, no page errors, no
publication/relay/notification writes.

## Integrity assertions (section 2, box 5)

`tests/fixtures/assert-recovery-integrity.mjs` (requires `SNAPSHOT_FILE`;
overrides `NODE_A_URL` — must be down, `NODE_B_URL`, `FIXTURES_DIR`,
`NODE_B_DATA_DIR`). Observed 2026-11-04: **91/91 checks pass**.

```
SNAPSHOT_FILE=/tmp/snapshot-a.txt node tests/fixtures/assert-recovery-integrity.mjs
```

Asserts, per record: served id/signature/content byte-identical to the fixture
export; id recomputed as `hash(signature)`; signature opens and authenticates
the exact content; author bound to alice or bob; B's on-disk `records.json`
byte-identical. Per AndFS media: chunk bytes reassembled from B's disk
sha256-match the node-A snapshot; `/media/<hash>` and `/blobs/<manifest>` +
chunk fetches serve identical bytes (the exact reader contracts). anblob on
disk and served byte-identical; APDS data-URL hash matches the signed
reference; original hash differs from crop hash and the profile record
references both (`image_original`, `image`).

UI spot checks (observed 2026-11-04, node B only, node A down): the real
shared `createProfileEditor` mounted from B with the fixture photoState —
clicking "Adjust crop" handed the cropper the restored original bytes (70B,
sha256 `a86fc9c7b91d…`, matching the fixture original, not the crop
thumbnail); "Original kept at 1 × 1". Request audit clean.

## Missing/corrupt block exercise (section 2, box 6)

Observed 2026-11-04 on node B, node A down; `records.json` sha256
(`5333206c27…`) identical before and after — signed records never edited.

- **Missing block**: deleted the inline-image chunk. `/blobs/<chunk>` → 404
  (manifest intact, 200). The real shared `createImageGallery` tile landed in
  `image-unavailable` ("Image unavailable", retry button visible); no image
  source ever assigned. Restored the chunk byte-identical; retry loaded it
  verified (70B, sha256 `c414cd0e20…`, matching the snapshot).
- **Corrupt block**: flipped a byte in the video chunk. The server verifies
  blocks before serving, so `/blobs/<chunk>` → 404 — corrupted bytes never
  leave the server. The raw corrupted bytes fed straight into the real
  client-side vendor verifier were also rejected ("No verified source for
  blob") — corrupted bytes never display or play. Restored byte-identical;
  retry reassembled the video verified (24B, sha256 `c1ff6974ed…`).

## Historical references (section 2, box 7)

Grounding: `client/andfs.js` (`andfsSource`, `andfsImageMetadata`),
`client/ui/legacy-media.js` (`readLegacyMedia`), AGENTS.md (APDS/anblob
compatibility contract). No reader does silent failover; an old origin is
either reachable (blocks load) or not (unavailable/retryable).

| Kind of historical absolute reference | How the current reader resolves it | Recovery limit if the old origin is unavailable |
| --- | --- | --- |
| Absolute AndFS fragment `https://<old-origin>/#<hash>` (inline Markdown, profile `image`/`image_original`) — written during the brief origin-hardcoded window | `andfsImageMetadata` extracts the manifest hash and pins `media_source` to the signed URL's origin (hash stripped); `andfsSource` gives the signed `media_source` precedence over the configured adapter `baseURL` | Blocks are read from the old origin only; the configured media adapter does **not** fail over to a second node's store. Unavailable origin → image unavailable/retryable on the new node. Never rewrite the signed record to "fix" it. |
| Legacy `/media/<hash>` gateway URLs (`https://<old-origin>/media/<hash>`) | Same resolver: matches `^(.*)/media/<hash>$`, sets `media_source` to origin + path prefix; `andfsSource` strips the `/media/<hash>` pathname for transport | Same as above: pinned to the old origin, no failover to the configured mediaURL. |
| Signed `media_source` on AndFS audio/video metadata (pre-portability writes) | `andfsSource`: signed `media_source` takes precedence over adapters | Old origin down → verified fetch fails; unavailable/retryable. No failover. |
| Signed `media_source` on legacy `blob: anblob:v1:...` records | `readLegacyMedia` tries the local cache, then `new HttpBlobStore((media_source || page origin) + '/blobs')`; signed source takes precedence | Records with a signed source to a dead origin stay unavailable. Records **without** a signed source fall back to the current page origin, so re-hosting the blobs on the new node recovers them. |
| APDS image data URLs embedded in signed content (`apds.make()` blobs, profile images, `![](hash)` in Markdown) | Self-contained: restored with `records.json`; readers decode the embedded bytes | No origin dependency; restore content and they recover. |
| Legacy avatar hashes served only over Trystero gossip (31 profile-avatar refs) | Relay-side concern, not the reader path above | Some blobs exist in the relay store but only via the old direct path; the new `/blobs/<hash>` handler serves only hashes without `/` (19 of 30 contain `/`). Unreachable over HTTP until the relay redeploys — an explicit known gap, not a claim of recovery. |

Observed exercise (2026-11-04, node B on :8122, node A down, node B holding
the exact fixture bytes): mounting the real shared `andfsImageMetadata` /
`readAndFSMedia` from node B,
`http://127.0.0.1:8121/#<fixture inline-image manifest>` resolved
`media_source` pinned to `http://127.0.0.1:8121` and the read failed ("No
verified source for blob"); the legacy `http://127.0.0.1:8121/media/<manifest>`
form behaved identically. Request audit: the two pinned `/blobs` fetches went
only to the dead origin — zero `/blobs/<manifest>` requests to node B during
the pinned cases (observed no-failover), while the origin-free `/#<manifest>`
control served and verified from B (sha256 matching the snapshot). Signed
records untouched; zero requests to wiredove.net, no page errors, no
publication/relay/notification writes.

## Limitations

- Exports and generated storage stay outside source control (fixtures and
  node data live under `/tmp` in this exercise).
- The browser spot checks (website/separate-origin mount, re-crop click,
  missing/corrupt phases, historical-ref pins) are Playwright harnesses
  recorded in the goal's hidden_files for this run (`select-node-b-browser.cjs`,
  `recrop-node-b-browser.cjs`, `missing-corrupt-block-browser.cjs`,
  `historical-refs-browser.cjs`); the node-side fixture builder, ingest and
  assertion scripts live in `tests/fixtures/` and are the repeatable contract.
- No host/SSH observations are recorded here; if sbot/host access is
  unavailable when evidence is needed, record the blocker explicitly.
