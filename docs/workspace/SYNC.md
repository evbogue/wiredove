# Browser refresh and replication

The current ANBot Git browser and ANBot-hosted Wiredove social client have
different refresh behavior. This is a source review of ANBot `6565792` and
Wiredove `d934138`.

| Path | Current behavior |
|---|---|
| ANBot Git pages | Server-rendered. The browser shell handles the navigation drawer and clone controls. Reload or navigate to fetch a new page. |
| ANBot-hosted Social | The client skips the standard archive pull timer and uses a read-only connection to its host's HTTP relay for browser social catch-up. This is browser sync through a different path. |
| ANBot-hosted Sync view | Refreshes Git selection status from `/sync/status`. That status describes the selected update on the server. |
| Standard Wiredove application session | Pulls its configured backend archive on startup and every three seconds. Its website transport can also run the social sync loop when networking is enabled. |
| ANBot node | Can run a server-side peer pull loop when configured. The loop records pull outcomes and runs independently of browser tabs. |

## Wiredove Sync view

Open Workspace → Sync or use the existing `#sync` link. The server panel
reads ANBot's selected publication through `/sync/status` and retains
the last selection if a refresh fails. The browser panel shows Wiredove
transport readiness and queue size and refreshes the Social archive
through the current application session. ANBot's custom relay and
per-peer controls still need parity review before retiring the legacy UI.

## Migration boundary

Keep one Wiredove application session for both views, with shared identity,
routing, social transport, queues, and conversation rendering. Workspace's hyperscript renderers load structured Git data on route entry and
explicit refresh. Refresh updates the current view in place. Cancel or ignore
requests from a route the user has left.
Refresh the affected view after a confirmed local action. A view switch
should reuse the session without starting another copy of its timers or
transport.

Wiredove owns browser presentation and refresh state. APDS owns storage and
replication in the target stack. AndFS reconstructs files and bundles.
ANProto verifies signed records. Git capability code resolves refs and
validates bundles using Git. Wave owns revision-specific behavior when it is
introduced. Keep the existing Git paths available through the transition
until Wiredove can display their data through a confirmed shared contract.

Check browser refresh and peer replication independently. Open a repository,
make a disposable local push, and verify that Refresh shows the updated ref.
Simulate a failed refresh and verify that the previous data remains visible.
Switch repeatedly between views and verify that subscriptions and timers
stay bounded. Verify that social publishing, replies, and pending retries
still work with one browser session.

Git shell (ANBot `ui-shell.js`) · Hosted bootstrap (ANBot `wiredove-client/app.js`) · Hosted session (ANBot `wiredove-client/client/runtime/default-session.js`) · [Wiredove session](../../client/runtime/default-session.js) · Node pull loop (ANBot `sync-loop.mjs`)
