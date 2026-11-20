# Work order for the Wiredove UI migration

**Status: planned · 20 November 2026**

Wiredove becomes the only source of human-facing UI for the stack. Social
keeps the existing Wiredove experience. Workspace absorbs the Git browser
and supported human workflows from ANBot. Wave builds on Wiredove.
ANBot remains the agent CLI and retains its Git capability during this
migration. Keep Git pushes open and post editing solo. Wave can define
collaboration rules when that work begins.

| Ticket | Owner and work | Exit check |
|---|---|---|
| 1. Inventory and baseline | Wiredove + ANBot. List routes and workflows in upstream Wiredove, ANBot's hosted Wiredove copy, and ANBot's server-rendered Git UI. Record live/source revisions and embed pins. Mark each workflow port, reuse, or retire with a reason. | Checklist includes identity, local and pending data, routes, Social publish/reply/retry, media, Git views and transport, and Sync. Establish the rollback revision and record clean baseline results. |
| 2. Shared shell | Wiredove. Add Social / Workspace routing and reuse Wiredove's stylesheet, controls, app session, and lifecycle. | Social permalinks, identity, drafts, focus, browser history, and embedded mounts still work. Switching views keeps one session. |
| 3. Git browser vertical slice | Git capability owner supplies structured reads from existing readers. Wiredove renders overview → tree → file with hyperscript. Follow the Git browser design. | A disposable push is visible after Refresh. Commit-pinned links remain stable. Clone, fetch, and open push work as before. |
| 4. Complete Git and status parity | Wiredove + ANBot. Port remaining verified Git views and useful Sync status. Reuse existing Social workflows and shared transport. | Each baseline workflow has a passing parity case or a documented retirement decision. Test a fresh node, a returning browser with existing identity and drafts, and a second node receiving a Git publication. |
| 5. Switch consumers to canonical Wiredove | Wiredove + consumer owners. Use a pinned upstream Wiredove distribution wherever ANBot or another host needs UI. Validate the evbogue.com embed at its actual pin. Preserve public URLs through forwarding or compatibility routes. | Same upstream UI on the relevant hosts. Old links and current embed behavior pass the checklist. Returning browsers retain identity, drafts, and pending sends on any supported origin transition. |
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

## Work-order disposition

The ANBot UI implementation order and desktop design study supply inventory
and design references. Keep Git publication, existing browser parity, and
backend sync work in their owning orders. Defer new fork, issue, and review
workflows. Preserve the earlier Wiredove and evbogue.com reading and reply
acceptance as baseline evidence and recheck the supported mounts during
cutover. The Muse adapter work is closed. Audience-building follows Wave
readiness.
