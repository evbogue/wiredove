# Feature request: server-rendered post pages so link previews show the post

Requested by Ev, 2026-11-10. Implementation approach is up to the implementer (Codex) — this is a request, not a work order.

## Wish

When a Wiredove post link is shared (Messages, Slack, social), the preview should
show the post itself — author, text, image — not just the generic
"Wiredove on ANProto" shell.

## Desired shape

Each post gets a real HTTP URL on the Wiredove server that serves a static,
self-contained page: plain content (author, body text, image) as actual HTML,
readable without JavaScript and without loading the full application, distinct
from the client-side app render. The page carries the metadata link unfurlers
read (Open Graph / Twitter Card) so previews show the content. The static
pages are navigable: from a post you can reach the author's other posts, the
thread and its replies, and the surrounding feed — a full browsable view of
everything on the server through static pages alone, with an "Open in
Wiredove" link to the full app for the live experience. (This is about the
pages the links open, not the unfurl card other apps show — that is just the
preview snippet.) The information is all available on the server already —
the point is to serve it there instead of only in the client.

## Facts for whoever implements it

- Post links today are hash URLs (`wiredove.net/#<hash>`); the fragment never
  reaches the server, so the server cannot know which post is being previewed.
- `index.html` currently has no Open Graph tags at all.
- The server already has what the page needs: post records live in
  `data/application/records.json` (`{id, signature, content}` — YAML
  frontmatter + body), and media bytes are served at `GET /media/<hash>`
  (verified AndFS) and `/blobs/<anblob id>` (legacy).
- A post the local node never synced may need fetching from the relay
  (`POST` the hash to `pub.wiredove.net/gossip`).
- The records already carry what navigation needs: `previous` links chain a
  post's history, and replies reference the posts they reply to, so threads
  and author pages can be built from the same archive.
- Static pages are snapshots, not live views: no live replies or edit
  navigation on the page itself; the full app is one click away for that.
- Links already shared as `/#<hash>` cannot be retrofitted; only new shares
  benefit. Unfurlers also cache aggressively.

## Out of scope

- No change to how the client-side app renders posts.
- No change to signed post bytes or media storage.
- No live or interactive behavior on the static pages themselves.
