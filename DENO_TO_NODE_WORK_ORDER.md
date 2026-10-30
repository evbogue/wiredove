# Work order: migrate Wiredove from Deno to Node.js

Status: **planned; no runtime migration implemented**
Created: 2026-10-23
Target: **maintained Node.js LTS, self-hosted on the existing Debian VPS**
Priority: **complete before October 2027**, with early milestones well ahead of that date.

## Why

On 2026-10-09, the Deno team announced its move to Cloudflare; upstream Deno runtime development will stop after a year, with maintenance/security updates through October 2027. Deno Deploy is being shut down after six months. Wiredove self-hosts its Deno runtime rather than depending on Deno Deploy. This is a maintenance-risk migration, **not an emergency service outage**.

Sources:
- https://deno.com/blog/cloudflare
- https://github.com/denoland/deno/issues/37030

## Decisions / invariants

1. Node.js LTS is the default server runtime. Keep the browser as the primary application client; **do not rewrite the app in a server framework**.
2. Keep ESM and standard Web APIs (fetch, Request, Response, URL, crypto) wherever possible. Prefer small explicit adapters and Node built-ins over a wholesale framework migration.
3. Preserve existing URLs, payload shapes, signatures, message hashes, media blob IDs, notification subscriptions, VAPID keys and settings. No signed message rewrites or identity migrations.
4. Preserve self-hosting, Docker and the existing Debian/systemd deployment model. Do not move hosting to Cloudflare as a side effect.
5. Continue the shared mountable website/embed application architecture from SHARED_UI_WORK_ORDER.md; never create a parallel renderer for the Node server.
6. Separate application-runtime migration from the **independent production Deno reverse proxy**. Do not switch both in a single release.
7. No application code, infrastructure or production services change merely by creating this work order.

## Confirmed current usage (reviewed on master 2026-10-23)

- `serve.js` uses `Deno.serve`, `Deno.env`, `Deno.mkdir`, `Deno.writeFile`, `Deno.rename`, `Deno.stat`, `Deno.readFile`, `Deno.errors.NotFound` and remote `deno.land/std@0.224.0/http/file_server.ts`.
- `notifications_server.js` uses Deno environment/filesystem APIs, `npm:web-push@3.6.7`, and `https://esm.sh/gh/evbogue/apds@d9326cb/apds.js`. Its persisted files include `data/subscriptions.json`, `data/state.json` and the production VAPID config.
- `Dockerfile` runs `denoland/deno:alpine` and `deno cache serve.js`; `docker-compose.yml` mounts `./data`.
- Since 2026-10-29, root `package.json` and its npm lockfile provide Node/Playwright test tooling. `deno.json` keeps Deno npm resolution independent, with `deno.lock` pinning server dependencies. The application still runs on Deno; this is not the Node runtime migration.
- `client/feed_test.js` already supports Node's test runner, while `client/client_test.js` contains `Deno.test`; browser suites and other tests also exist.
- `AGENTS.md` documents live `wiredove.service` on port 8081, deployed from detached Git worktrees; a **separate custom Deno** `reverse-proxy.service` terminates public HTTPS and maps `wiredove.net` to 8081. The production checkout has local-only edits. No CI-driven production deploy is configured.
- Audit all further runtime-specific usage before changing code (including ancillary scripts and server-side dependencies); this list is a starting inventory, not a guarantee of completeness.

## Work packages (ship as small reviewed commits)

### 0. Inventory and establish parity baseline

- [ ] Search tracked source, tests, docs, Docker, CI and deployment instructions for `Deno`, `deno:`, `npm:`, `deno.land`, `esm.sh` and runtime-sensitive assumptions; classify **server**, **browser**, **test**, **deploy**, **reverse proxy**.
- [ ] Record the complete route contract with baseline fixtures: root/index/static assets, imported JS modules, `/client/*`, `/embed.js`, `/style.css` CORS; `PUT/GET/HEAD /blobs/:id` including invalid IDs and missing data; `/vapid-public-key`, `/subscribe`, `/unsubscribe`, `/push-now`; `/feed-rows/home`, `/feed-rows/author/*`, `/feed-rows/alias/*`.
- [ ] Record responses/status/headers/cache behavior and security-sensitive differences (file traversal, unsupported methods, request body limits, decoding errors). Characterize existing behavior before intentional fixes.
- [ ] Preserve a known-good Deno checkout/release and sanitized fixture copies (never commit private VAPID keys or live subscriptions).
- **Exit:** reproducible tests and a documented route/API inventory exist.

### 1. Make server modules runtime-neutral

- [ ] Extract an exported Web Request -> Response handler from `serve.js`; keep listener/bootstrap as a thin Node entry point. Maintain route precedence: blob -> notification/feed -> static files.
- [ ] Replace direct Deno filesystem and env calls using `node:fs/promises`, `node:process` and `node:path`, or a minimal injected IO abstraction where it improves testability. Do not change the persisted JSON schema or blob naming convention.
- [ ] Preserve atomic blob writes (temporary sibling file then rename), existing content hashes, HEAD/GET parity, immutable cache headers, and appropriate not-found responses. Check cross-platform filename/path safety; never concatenate unvalidated user paths.
- [ ] Implement static serving with correct content types, HEAD behavior, index/fallback policy, conditional requests/range support **only if observed/required**, traversal protection, and current cross-origin headers. Decide whether a small audited static file package is preferable to custom code; no unnecessary framework.
- [ ] Use a compatible Node server adapter for Web Request/Response, explicitly handling streams and aborted uploads. Keep WebSocket/upgrade considerations separate if not currently used by this entry point.
- **Exit:** same fixtures/contract pass under the Node server on a separate local port.

### 2. Replace Deno-specific dependency resolution

- [ ] Add `package.json` with `"type": "module"`, scripts for start/test, an explicit Node LTS engine range, and a committed lockfile. Pin reproducible dependency versions.
- [ ] Replace `npm:web-push@3.6.7` with an ordinary npm import and resolve its runtime/ESM interoperability.
- [ ] Replace the server-side `esm.sh` APDS URL with a reproducible, vetted import strategy (published package, pinned git dependency, vendored module, or a small compatible wrapper). Verify the *exact* APDS API used for hash/open/YAML; **do not silently modify ANProto cryptography or signed serialization**.
- [ ] Distinguish remote URLs intentionally loaded by browsers from Node-side imports. Do not indiscriminately rewrite client module URLs or public protocol contracts.
- [ ] Evaluate dependencies' Node LTS compatibility and supply-chain/license impacts.
- **Exit:** clean install in a fresh environment works without Deno or runtime CDN imports on the server.

### 3. Migrate notifications and persistent state

- [ ] Make notification-service settings injectable and use Node env/fs for config, subscriptions and state files. Verify bootstrapping with *existing* VAPID keypair; never rotate keys on deployment.
- [ ] Test subscription add/idempotency/remove; expired endpoint pruning; push-now payload formatting; persistent write/restart/reload; malformed/missing config handling; upstream poll/alias/author feed flows and errors.
- [ ] Resolve existing write-concurrency/data-loss risks deliberately (atomic JSON writes/serialized updates) if needed, in a separately reviewable change. Preserve current schema and do not introduce database dependency.
- [ ] Back up `/root/wiredove/data` and the production VAPID config using secure permissions before switching runtime. Do not print secrets in logs or tests.
- **Exit:** the same test subscription and fixtures survive Deno -> Node -> restart without changes to identifiers or keys.

### 4. Tests, packaging and documentation

- [ ] Port Deno-only server/test registrations (e.g. `client/client_test.js`) to `node:test`, or provide a minimal dual-runner helper. Do not break browser-only tests.
- [ ] Add automated Node tests for all API routes, static serving/CORS, uploads, persistence and failure cases; run relevant existing UI/browser suites at desktop/mobile and cross-origin embed. Avoid real identity publishing in automation.
- [ ] Update Dockerfile to a pinned, maintained Node LTS image, with an appropriate unprivileged user, data/config volume ownership, health handling and deterministic production install. Keep Compose usable and document port 8000.
- [ ] Update README and AGENTS.md local development/run/check steps *after* the equivalent implementation works. Add CI for clean install, tests and container build; distinguish CI from deployment.
- [ ] Perform a smoke test on isolated Node staging and compare route/body/header behavior with Deno. Exercise service-worker warm-cache upgrade, identity backup/import, feed loads, profile links, uploads, image gallery, embeds and push notification registration.
- **Exit:** reproducible clean checkout, Node tests and Docker image are green; feature parity checklist signed off.

### 5. Cautious production application cutover (not the proxy)

- [ ] Read production `/root/AGENTS.md` and current `systemctl cat wiredove.service`; identify the *active* release. Never reset/clean `/root/wiredove` or overwrite its production-only edits.
- [ ] Deploy an exact reviewed commit to a **new detached worktree** with the established `data` link; use existing secure config path. Verify Node start and smoke-test on a different loopback port before port 8081 cutover.
- [ ] Back up service unit and persistent state. Stop Deno application service before starting Node on 8081 (no concurrent writers to subscriptions/state); change the service's ExecStart, WorkingDirectory and only required environment. Keep reverse-proxy.service and domain mapping untouched.
- [ ] Check service health and live HTTPS URLs; compare live JS/CSS SHA-256 against reviewed commit, inspect journal logs, upload/download a test blob, read feeds, exercise subscription/restart and browser flows. A 200 alone is insufficient.
- [ ] Retain the old worktree, Deno binary and backed-up unit/config for rollback. **Rollback procedure:** stop Node, restore previous unit/worktree, start Deno, confirm 8081 and public site. State files written by Node must remain backward compatible; signed messages/remote publications are not undoable.
- **Exit:** Wiredove application runs on Node in production with observably equivalent behavior and reversible cutover.

### 6. Migrate the independent Deno reverse proxy (separate decision/release)

- [ ] Audit `/root/reverse-proxy`, `domains.json`, existing `reverse-proxy.service`, TLS certificate issuance/renewal, HTTP->HTTPS redirects, headers, websocket/streaming forwarding and all other domains served by this host. **Do not assume it only serves Wiredove.**
- [ ] Prefer a maintained, easily operated reverse proxy such as Caddy if current features and site mappings can be preserved. Evaluate nginx if needed; there is no requirement to port a bespoke proxy to Node.
- [ ] Document TLS state and all vhosts; back up config and certificates; validate config/renewals on staging; plan a short reversible cutover with HTTPS, WebSocket if relevant, multiple vhosts, redirects and certificate renewals tested.
- [ ] Update `AGENTS.md` with verified new host architecture only after rollout.
- **Exit:** no production Deno service remains and every pre-existing domain/TLS flow is healthy; old proxy can be restored.

## Non-goals

- No changes to ANProto/AndFS wire formats, crypto, signed message bytes or historic blob readability.
- No automatic host/provider migration, feature redesign, new rich-text editor or replacement of browser modules.
- No combined deployment with the separate shared-UI or AndFS migrations unless independent tests and rollout gates are satisfied.
- No speculative features, broader repository rewrites, or removal of legacy signed-blob readers.

## Definition of done

- [ ] All production services formerly running Deno are inventoried and either migrated or explicitly documented as exceptions with owners/deadlines.
- [ ] `wiredove.service` uses maintained Node LTS; production application has no Deno runtime import/API dependency.
- [ ] HTTPS proxy also runs under maintained software, all configured domains preserved.
- [ ] New and historical media requests, message authenticity, metadata, notifications, feed APIs, embeds and static assets behave correctly.
- [ ] Data, VAPID keys and identities preserved; no unplanned changes to public API or storage.
- [ ] CI and documented run/deploy/rollback commands work; Node Docker deployment works; production checks recorded.

## Suggested order and timing

Start inventory and parity tests now. Complete local Node implementation and staging during late 2026 / early 2027. Cut over application first, then reverse proxy separately; aim to finish comfortably before upstream Deno maintenance ends in October 2027. Timing is a planning target, not a release commitment.
