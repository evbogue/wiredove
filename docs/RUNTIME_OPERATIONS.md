# Wiredove runtime operations

This file is the single current runbook for Wiredove runtime operations: the
default Node server, checks, Docker, and production cutover/rollback. Detailed
procedures live here so there is exactly one current authority; other documents
only point here. Dated deployment evidence stays where it was recorded: the
"Production release verified" session entries in [../AGENTS.md](../AGENTS.md),
whose older Deno-only deployment procedure is preserved verbatim and labeled
historical, and [HOST_PROXY_WORK_ORDER.md](HOST_PROXY_WORK_ORDER.md) for the independent
host services, which are outside the application runtime. Completed consolidation evidence lives in the [recovery guide](SECOND_NODE_RECOVERY.md),
[behavior matrix](BEHAVIOR_MATRIX.md), and [release record](RELEASE_RECORD.md).

Wiredove's default server is Node.js 22+ (`npm ci && npm start`). Both Node and
optional Deno (`npm run start:deno`) use `server/handler.js`, identical routes and
disk formats. Keep the Deno launcher and lockfile for compatibility and rollback.
Browser CDN imports are browser dependencies, not Node server dependencies.

## Low-bandwidth local testing

1. Keep a persistent local test dataset outside disposable checkouts. Start
   Wiredove with `HOST=127.0.0.1 PORT=8000 DATA_DIR=/absolute/path/to/test-data npm start`
   after installing dependencies with `npm ci`. Use the same URL and dedicated
   browser profile across manual runs so IndexedDB survives. Keep that profile
   separate from your everyday Wiredove identity.
2. Before testing, verify that the local dataset serves the latest post hashes
   needed for the test and that their referenced media loads. Keep a known-good
   local snapshot for reseeding. When a newer dataset is needed, catch up on
   Wi-Fi by fetching missing posts and media incrementally. On a hotspot, use
   the existing snapshot or local fixtures.
3. For sync testing, start a separate, persistent local APDS relay seeded with
   the relevant posts, heads and legacy image blobs. In a local-only checkout,
   point `makeWs` in [connect.js](../connect.js) at the loopback relay and
   disable the public `makeRoom('wiredovev1')` connection. Set
   `FEED_ROWS_UPSTREAM` to the local HTTP upstream serving feed rows. The Node
   server's feed setting only affects server-side feed requests. Browser alias
   lookups and Settings' remote log can still call the public relay directly.
   Block external data requests and WebSockets in the test browser, then verify
   in its Network panel that sync and feed requests stay local before opening
   a fresh profile. Keep local endpoint edits out of source commits.
4. For a clean browser state or when a seeded relay is unavailable, use local
   fixtures. For example, run
   `WIREDOVE_TEST_RUNTIME=node node tests/application-flow.browser.cjs` for
   a local archive/media test with website relay sync disabled. Its browser
   dependencies can still require small CDN or GitHub downloads. Use the
   [second-node recovery fixtures](SECOND_NODE_RECOVERY.md) when historical
   image and media coverage is needed.

## Verification and route inventory

`npm run check`, `npm test`, `npm run test:media`, `npm run test:server` and
`WIREDOVE_TEST_RUNTIME=node npm run test:browser` require no Deno for application
execution. Some browser fixture servers still use Deno; the full application flow
selects the actual Node handler. `npm run check:deno`, `npm run test:media:deno` and
`TEST_DENO_PARITY=1 npm run test:server` verify optional Deno compatibility.

`tests/server.test.js` exercises real listeners and disk reopen, not just handlers:

| Routes | Contract |
| --- | --- |
| `/`, static JS/CSS, `/client/*`, `/vendor/*`, `/embed.js`, `/app-embed.js`, `/dist/app-v1/*` | MIME, GET/HEAD, conditional reads, ranges, public module CORS |
| `/api/application` | Exact signed archives, validation, duplicate retry and durable retrieval |
| `/api/media`, `/blobs/<AndFS hash>`, `/media/<hash>` | Signed authorization, verified blocks, limits, ranges/HEAD, corruption and restart |
| `/blobs/anblob:v1:…` | Historical PUT/GET/HEAD, unchanged identifiers and bytes |
| `/vapid-public-key`, `/subscribe`, `/unsubscribe`, `/push-now` | Existing keys, persistent subscriptions, injected delivery and expired pruning |
| `/feed-rows/home`, `/feed-rows/author/*`, `/feed-rows/alias/*` | Upstream feed contract and error responses |
| Private paths and malformed URLs | Reject data/config, dotfiles, node_modules, traversal, private/outside symlinks; malformed escapes return 400 |

Route precedence is archive, AndFS, legacy blobs, notifications/feed, then static.
The browser suite verifies website and separate-origin application behavior,
identity/profile/draft recovery, media, exact retries and warm-cache upgrades with
public fixture writes blocked. This is runtime acceptance, not full shared-UI parity.

The read-only monitor uses Node filesystem APIs and local pinned ANProto/YAML:
`node scripts/monitor-posts.js data/monitor.json`. It preserves atomic cursor
updates and the exclusive overlap lock. Browser imports remain unchanged.

## Docker

`docker compose up --build -d` starts Node on port 8000 with a persistent named
volume. The image runs as UID 1000 (`node`); fresh named volumes inherit writable
ownership. VAPID config lives inside the volume at `/app/data/config.json` and is
retained across recreation. Never overwrite existing keys when migrating data.
For an existing bind mount, ensure UID 1000 can write it and set
`VAPID_CONFIG_PATH` to the existing config (mount it privately). Back up data first;
do not switch an existing bind deployment to a new empty named volume.

Only production npm dependencies are installed from the lockfile. Private config,
data, keys, environment files and local tooling are excluded from the build.
CI builds the image, verifies non-root startup and health, and compares the public
VAPID key across restart with the same volume. CI does not deploy services.

## Production cutover and rollback

Read `/root/AGENTS.md` and `systemctl cat wiredove.service` before operating the
host. Preserve `/root/wiredove` and its production-only changes. Fetch source,
create a detached release worktree at the reviewed commit, install production npm
dependencies and link `data` to `/root/wiredove/data`. Keep port 8081 and
`VAPID_CONFIG_PATH=/root/wiredove/config.json`.

Stage Node on another loopback port with a separate data directory and a private
copy of the existing config. Never run concurrent Node/Deno writers on live data.
Back up the service unit, data and config with private permissions. Stop Wiredove,
then change only WorkingDirectory and ExecStart (`/usr/bin/node serve-node.js`),
reload systemd and start it. Verify service logs, public asset SHA-256, media and
isolated read-only browser smoke. Retain the old release and Deno executable.

Rollback: stop Wiredove, restore the saved unit (old WorkingDirectory and Deno
ExecStart), daemon-reload and start; verify public assets and service health. No
schema conversion occurs. Code rollback does not undo signed public writes.

## Independent host services

The shared TLS proxy and HTTP redirect are separate releases. Other hosted apps
are outside Wiredove's migration. See
[HOST_PROXY_WORK_ORDER.md](HOST_PROXY_WORK_ORDER.md); keeping Deno
installed is deliberate, not an application dependency. Production status and
observed validation are recorded in [../AGENTS.md](../AGENTS.md).

## Verified application release — 2026-11-04

Production runs Node 22.22.0 from `/root/wiredove-release-0086c74`. Previous Deno
release `a25a0be` and private unit/data/config backup at
`/root/deploy-backups/wiredove-node-0086c74/` are retained. All 112 persisted files
matched backup after cutover; public source hashes and read-only mobile browser
smoke passed. See [../AGENTS.md](../AGENTS.md) for checks and scope. The independent proxy remains Deno.

## Shared application closeout release — 2026-11-07

Wiredove runs Node from `/root/wiredove-release-d80b0b9`; evbogue.com source
`9d132c9` pins the same application `d80b0b9`. See the release record for observed
checks. Wiredove rollback unit/data/config are retained under
`/root/deploy-backups/wiredove-closeout-d80b0b9/`. Restore the saved unit to select
`0086c74`, reload systemd and restart Wiredove; both releases use the same data.
Do not restore old data over later publications.
