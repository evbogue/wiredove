# Work order for the Wiredove UI migration

**Status: Wiredove live at bot.anproto.com · 22 November 2026**

Merge `6a1358b` passed `npm run check`, `npm test` (46 tests),
`npm run test:media` (15 tests), `npm run test:server` (20 tests), and
`WIREDOVE_TEST_RUNTIME=node npm run test:browser`. The browser suite
covered local website and separate-origin embed flows.

The initial production cutover routed `bot.anproto.com` to Wiredove `2c05a88` on loopback
port 8792. Headless ANBot `c654921` keeps port 8787 and the existing data
directory. The gateway forwards Git, gossip, and media routes, and the TLS
proxy preserves the site's hash redirects. Public assets, Git overview and
raw reads, legacy Git redirects, peer poll and heads, and Git ref discovery
passed. The other Wiredove and evbogue.com homepages responded after the switch.

Rollback files are under
`/root/deploy-backups/anbot-workspace-final.MIqHoe` on the release host.
Restore the saved ANBot systemd drop-in, proxy code and hostname mapping,
reload systemd, restart ANBot and the proxy, and disable `wiredove-anbot`.
The prior running ANBot revision was `6565792`. Keep the existing data
directories during rollback. The local returning-browser rehearsal covered
identity and saved drafts. Production returning-browser acceptance for
pending sends, historical media and warm-cache rollback remains open.

Hosted startup fix `1d8743c` is live. It renders the Social and Workspace
controls while the ANBot archive loads and updates the service-worker cache
version. The build, 46 unit tests, and a browser regression with a held-open
archive request passed. Public Chromium at 390px showed both controls, and
the live startup module and service worker matched the release. The prior
Wiredove service unit is saved at
`/root/deploy-backups/wiredove-anbot-startup.zvXwFn/wiredove-anbot.service`.

The [shadcn/ui preview](../../shadcn-preview/README.md) is a parallel local
entry point for evaluating a shared component system. It covers a verified
plain-text feed, signed preview posting and retry, repository files, and
browser settings. Chromium smoke checks exercised the disposable local
archive and fixture Git responses at desktop and mobile widths.

The Social / Workspace toggle is a browser preference. Both layouts use
the same feed and post URLs. The neutral Workspace sidebar
stays available while reading posts, searching, opening conversations,
composing, or browsing Git. Repository opens the node's publication
directly, with Files, History, and Branches and tags available in that view.
Sync and Settings are available in the sidebar. Navigation wraps above
the content in narrow mounts. The standalone Social view uses the same
application session and shared publishing controls.

The Workspace appearance follows the last deployed ANBot frontend
(`6565792`). Local Chromium captures of that release served with disposable
posts and a disposable Git publication informed the 204px rail, warm
charcoal theme, 56px header, flat feed rows, file table, and mobile drawer.
Search and New post sit in the Workspace header. On phones, New post
floats above the bottom edge and the posting identity sits in the masthead.
The Social view switch remains in the Workspace sidebar footer.

Wiredove becomes the only source of human-facing UI for the stack. Social
keeps the existing Wiredove experience. Workspace absorbs the Git browser
and supported human workflows from ANBot. Wave builds on Wiredove.
ANBot remains the agent CLI and retains its Git capability during this
migration. Keep Git pushes open and post editing solo. Wave can define
collaboration rules when that work begins.

The first slice has a shared Social / Workspace shell and browser-rendered
overview, tree, and file views. ANBot commit `a38ee52` supplies the structured
reads. A Chromium fixture against a disposable ANBot node verified that
Refresh sees a pushed commit while pinned links keep resolving to their
original commit. The shared-shell browser check covers keyboard entry,
alternate views, Back, reload, and a retained Social panel at phone width.
The next slice adds branches and tags available in the verified publication,
paged history, full commit messages, per-file diffs and revision comparisons.
Commit pages can open the existing Social composer with a pinned link.
ANBot commit `009559f` supplies the extended reads.
Set `WORKSPACE_GIT_UPSTREAM` to the ANBot HTTP(S) origin to run the same-origin
gateway in Wiredove. Workspace now discovers the selected repository,
shows the clone URL, and presents Git selection and browser Social sync
separately. Existing scoped Git page URLs resolve to Wiredove views when the
gateway is enabled. The same-origin raw byte routes remain on ANBot.

Deploy Wiredove directly at `bot.anproto.com`, with ANBot behind it for
Git transport and verified reads. ANBot `serve --headless` disables its Social
shell and HTML Git pages. The Wiredove gateway forwards ANBot's smart HTTP
and signed push challenge endpoints and redirects legacy Git page links into
Workspace. The local headless acceptance covered clone, signed push, fetch,
commit reads, raw downloads and signed Social post and reply retrieval. At that hostname Wiredove opens the
existing `anbot-wiredove-preview` database and uses ANBot for its hosted
Social archive, profile and post delivery. A disposable ANBot accepted and
returned signed posts and replies through the Wiredove gateway. A browser
fixture verified the selected database name and reopening a saved draft.
Before deletion, verify a returning browser against the staged deployment,
including its actual identity, pending signed sends and historical media,
using the staged hostname and a rollback to the previous UI. The legacy
custom relay list, independent APDS toggles, Trystero connection, and
per-peer pause controls are available in Wiredove's Sync view.

For a staged switch, start ANBot with its existing data path and
`serve --headless --push-origin https://bot.anproto.com`. Keep the
configured push and replication flags. Point the Wiredove deployment's
`WORKSPACE_GIT_UPSTREAM` at the internal ANBot origin. Keep both data
volumes in place. Roll back by routing the hostname to the previous
ANBot launch without `--headless`.

| Ticket | Owner and work | Exit check |
|---|---|---|
| 1. Inventory and baseline | Wiredove + ANBot. List routes and workflows in upstream Wiredove, ANBot's hosted Wiredove copy, and ANBot's server-rendered Git UI. Record live/source revisions and embed pins. Mark each workflow port, reuse, or retire with a reason. | Checklist includes identity, local and pending data, routes, Social publish/reply/retry, media, Git views and transport, and Sync. Establish the rollback revision and record clean baseline results. |
| 2. Shared shell | Wiredove. Add Social / Workspace routing and reuse Wiredove's stylesheet, controls, app session, and lifecycle. | Social permalinks, identity, drafts, focus, browser history, and embedded mounts still work. Switching views keeps one session. |
| 3. Git browser vertical slice | Git capability owner supplies structured reads from existing readers. Wiredove renders overview → tree → file with hyperscript. Follow the Git browser design. | A disposable push is visible after Refresh. Commit-pinned links remain stable. Clone, fetch, and open push work as before. |
| 4. Complete Git and status parity | Wiredove + ANBot. Port remaining verified Git views and useful Sync status. Reuse existing Social workflows and shared transport. | Each baseline workflow has a passing parity case or a documented retirement decision. Test a fresh node, a returning browser with existing identity and drafts, and a second node receiving a Git publication. |
| 5. Serve Wiredove directly | Wiredove + host owners. Put the Wiredove deployment at `bot.anproto.com` in front of ANBot. Validate the evbogue.com embed at its actual pin and preserve public URLs through routing. | Wiredove owns the UI at the product URL. Old links and current embed behavior pass the checklist. Returning browsers retain identity, drafts, and pending sends on any supported origin transition. |
| 6. Remove duplicate UI | ANBot. Remove the forked browser UI, server-rendered pages, and their UI-only assets once replacement and rollback are verified. Remove dead code and any obsolete browser-only dependency. | ANBot has no independently implemented human UI. The CLI, Git transport, and the data reads Wiredove needs still pass their checks. Verify removal from a fresh checkout and build. |
| 7. Prove Wave handoff | Wave + Wiredove. Open and discuss a solo author's exact published revision in Workspace using shared Wiredove components. | A second node can retrieve the same revision and its discussion after a later release. |

Run tickets in order, allowing the Git read-contract work to overlap shell
work. Close each ticket with tested revisions, the commands and browser
cases run, and remaining limits. Keep the legacy interface available until
its replacement passes the parity gate. Before switching hosts, plan
rollback of the UI pin and route mapping while preserving stored user data.
Use disposable identities and repositories for writes during verification.
Production cutover follows the existing release process.

This order coordinates the UI migration slice of the
APDS stack work order (ANBot `APDS_STACK_WORK_ORDER.md`). Larger backend
migration and new Git collaboration workflows can be tracked in their owning
projects. Pull in a backend dependency when it blocks a specific acceptance
case. Finish Wave before building an audience.

[Git browser design](GIT_BROWSER.md) · [Layout](LAYOUT.md) · [Controls](CONTROLS.md) · [Sync](SYNC.md)

[Migration baseline and cutover checks](MIGRATION_BASELINE.md)

## Work-order disposition

The ANBot UI implementation order and desktop design study supply inventory
and design references. Keep Git publication, existing browser parity, and
backend sync work in their owning orders. Defer new fork, issue, and review
workflows. Preserve the earlier Wiredove and evbogue.com reading and reply
acceptance as baseline evidence and recheck the supported mounts during
cutover. Audience-building follows Wave
readiness.
