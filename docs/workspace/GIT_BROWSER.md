# Browser-rendered Git in Wiredove

**Design draft · 20 November 2026**

Wiredove Workspace renders Git pages with the same hyperscript helper as
Social (`import { h } from 'h'`). It uses Wiredove routing, styles, controls,
and application lifecycle. The Git capability layer supplies verified read
models from native Git. APDS and AndFS retain their storage, replication, and
file reconstruction responsibilities. Reuse the current Git readers before
changing how repositories are stored or replicated.

## Routes and view behavior

Preserve the repository-scoped `/git/<repo>` links and existing redirects
where possible. Give each old URL an explicit destination before cutover.
Keep clone URLs, Git smart HTTP, and raw downloads on their existing
transport routes. Separate shell, structured data, and byte responses in
the route table and test their precedence.

| View | Data and behavior |
|---|---|
| Overview and tree | Repository name, selected ref, resolved commit, breadcrumbs, entries, and README. Preserve the resolved commit when drilling down a tree. |
| Branches and tags | Show the full ref identity and current selection. A branch or tag view can follow its current tip. Offer a commit-pinned permalink. |
| File | Show bounded text previews with a raw download link. Distinguish empty, binary, oversized, and truncated files. |
| History and commit | Page history at a fixed commit. Show parent links, changed files, and bounded diffs. Preserve existing merge commit behavior. |
| Compare | Resolve both endpoints, retain compare semantics, and show the resolved IDs, merge-base outcome, and bounded results. |

Preserve `?rev=` and existing commit-scoped links. Resolve each symbolic
revision once per view load. Subsequent tree, README, raw file, diff, or
history requests use the resolved ID even if the branch moves. Explicit
Refresh can move a branch view to the new tip. A commit-pinned view keeps
its identity on refresh. Distinguish browsing an old revision from
changing the server's selected update.

## Read contract

Start with a same-origin read adapter backed by the existing repository
readers. Use the verified repository ID, a typed revision selector or
resolved commit ID, a repository-relative path, and bounded pagination
arguments. Agree on URL names and the supported response shape with the
owning projects before implementation. Prefer small view-specific
structured responses. An overview slice should return repository identity,
selected ref, resolved commit, tree entries, and bounded README data
together. Exact limits should follow current behavior and fixture sizes.

Keep branch, tag, and commit resolution in the Git capability layer. Treat
request arguments as data, never as arbitrary Git commands or revision
expressions. Preserve path validation and use the verified publication
selection as the visibility boundary. Keep reads within a public repository's
published scope, including when an object ID is supplied directly. Separate
malformed selectors, missing data, and temporarily unavailable storage or
verification failures. Document the behavior for each in the contract.

Return text, metadata, and explicit preview limits. Render source, paths,
and commit messages as text with the existing DOM helper. For README
Markdown, reuse a safe renderer and preserve relative repo links and
images against the exact resolved commit. Check encoded paths, unsafe URL
schemes, and inline HTML. Preserve raw-file download safety and keep
repository content out of the app's executable DOM.

## Browser state and delivery

Load through the Wiredove router. Cancel or ignore stale route requests
after navigation and after unmount. For the same view, keep the last
successful data visible during refresh and show a retryable error if it
fails. On successful branch refresh, replace data from one commit with
data from the next as a single view update. Keep loading, empty, missing,
unavailable, and stale states distinct. Browser Back and reload should
work from a copied URL without prior app state.

Begin with overview → tree → file and explicit Refresh. Compare against
the server-rendered path using the same disposable repository. Extend to
refs, history, commit, diff, and compare once the first contract holds.
Use one Wiredove session across Social and Workspace. Server peer
replication remains independent of browser refresh.

## Acceptance

- Compare old and new route outputs for default and non-default branches,
  tags, old commits, compare endpoints, merge commits, and raw downloads.
- Push a new commit through the existing open Git transport. Confirm
  Refresh advances an open branch view and leaves an exact commit link
  pinned. Verify clone and fetch still work.
- Check whitespace, Unicode and percent-encoded paths, binary or large
  blobs, truncated diffs, relative README links, and hostile display text.
- Check back/forward, direct entry, phone width, keyboard, slow or failed
  reads, and route changes with a request in flight.
- Verify published reads on a second node after replication. Keep browser
  tests and replication tests separately attributable.

[Layout](LAYOUT.md) · [Controls](CONTROLS.md) · [Sync](SYNC.md) · [Migration work order](MIGRATION_WORK_ORDER.md) · Existing route implementation (ANBot `anbot.mjs`)
