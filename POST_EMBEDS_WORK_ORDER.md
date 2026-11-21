# Work order: post embeds that show the post

Requested by Ev, 2026-11-20. Builds on
`POST_PREVIEWS_FEATURE_REQUEST.md` (2026-11-10) — that document is the desired
shape; this order is the implementation plan for Codex.

## Problem

When a Wiredove post link is shared (Messages, Slack, social), the preview
shows a generic favicon, not the post. Two causes, both verified 2026-11-20:

- Post links today are hash URLs (`wiredove.net/#<hash>`); the fragment never
  reaches the server, so the server cannot know which post is being previewed.
- `index.html` has no Open Graph or Twitter Card tags at all (verified by grep:
  no `og:` or `twitter:card` anywhere in the repo).

## Scope

- New real post URLs served by the server, each returning a static page that
  carries the metadata link unfurlers read, so the embed shows the post.
- Site-level Open Graph tags on `index.html`, so the home link unfurls too.
- The share/copy-link flow emits the new URL.
- No change to signed post bytes, media storage, or how the client-side app
  renders posts. No change to the embed widget (`/embed.js`, `app-embed.js`)
  itself.

## Implementation

1. **Route.** Add `GET /post/<record-id>` in `server/handler.js`, before the
   static handler (both listeners share that route graph). Canonical id is the
   unpadded Base64url record id — the same id already used in `/#<id>` links.
   Unknown id returns a 404 page (still carrying Open Graph tags); malformed
   id returns 400.
2. **Record lookup.** Read the post from `data/application/records.json`
   (`{id, signature, content}` — YAML frontmatter + body). Parse the
   frontmatter for author name, `previous`, and image/media fields; the body
   is the text. If the record is not held locally, fetch it from the relay
   (POST the hash to `pub.wiredove.net/gossip`), the same mechanism the app
   uses. Never serve unverified bytes.
3. **Page.** Static, self-contained HTML: author (display name, or truncated
   pubkey when unnamed), body text, first image when present, and an "Open in
   Wiredove" link to `/#<id>` for the live experience. Readable without
   JavaScript and without loading the full application. Escape all user
   content — a post body containing HTML must render as text, never execute.
   Add `<link rel="canonical">` pointing at the `/post/<id>` URL itself.
4. **Tags.** `og:title` (author + excerpt), `og:description` (body excerpt,
   ~200 characters), `og:type` article, `og:url` (the `/post/<id>` URL),
   `og:image` (first image, absolute `https://wiredove.net/media/<hash>` URL —
   the verified-bytes endpoint; this is page metadata, not a signed post
   field, so the signed-media-URL rule does not apply),
   `og:site_name` Wiredove, `twitter:card` `summary_large_image` when an
   image exists, otherwise `summary`.
5. **Navigation.** Per the feature request, the static pages are navigable:
   from a post you can reach the author's other posts, the thread and its
   replies, and the surrounding feed — a full browsable view of the server
   through static pages alone. Build these from the records the server
   already holds (`previous` chains a post's history; replies reference the
   posts they reply to). Static pages are snapshots, not live views; the full
   app is one click away for live replies and edits.
6. **Site tags.** Add Open Graph tags to `index.html` (`og:title` "Wiredove
   on ANProto", `og:description`, `og:image` site image, `og:type` website).
7. **Share flow.** The client copy-link/share action emits
   `https://wiredove.net/post/<id>` instead of `/#<id>`. Old `/#<id>` links
   keep working as today.
8. **Coordination.** The `work/workspace-git-browser` branch is active and
   touches `server/handler.js` and routing. Check it before starting and
   rebase/merge as needed; implement on `master`.

## Acceptance — all must pass

- [ ] `curl GET /post/<known-id>` returns 200, `text/html`, with
      `og:title` / `og:description` / `og:image` matching the post, and the
      page reads correctly with JavaScript disabled.
- [ ] Pasting the URL into a link unfurler (or a test harness that parses
      Open Graph tags the way unfurlers do) shows the author, text excerpt,
      and image — not the generic favicon.
- [ ] `GET /post/<unknown-id>` returns 404 with Open Graph tags; malformed
      id returns 400.
- [ ] `GET /` returns `index.html` with site-level Open Graph tags.
- [ ] Copy-link in the client emits the `/post/<id>` URL; the "Open in
      Wiredove" link opens the post in the app.
- [ ] No signed bytes changed; no media storage change; legacy `/media/` and
      `/blobs/` reads still work; existing tests pass.
- [ ] Server tests added in `tests/server.test.js` covering the route, the
      tags, 404/400, and escaping (a post body containing HTML is escaped,
      not executed).
- [ ] Verified against live unfurler behavior, or documented why a live check
      was not possible. Note: unfurlers cache aggressively, and links already
      shared as `/#<hash>` cannot be retrofitted — only new shares benefit.

## Out of scope

- No change to how the client-side app renders posts.
- No live or interactive behavior on the static pages themselves.
- No change to the embed widget mount (`/embed.js`, `app-embed.js`).

## Deployment note

A push does not deploy. Release per `docs/RUNTIME_OPERATIONS.md`. Bump the
shell cache version only if the change affects cached assets — new routes
alone should not need it.
