# Work order for reply and thread layout

**Status** · Implemented in the preview, awaiting Ev’s review · 22 November 2026

Revise item 5 of the shadcn preview walkthrough so readers can see which
message a reply answers in the feed and on a message route. Item 4,
composer and publishing, has been accepted. Item 5 is awaiting review.

The preview can already publish replies to the local archive, open direct
replies by count, and preserve the selected message when switching layouts.
The compact reply link and connected message route replace the inset parent
excerpt. Chromium checks at 320px and 1280px covered two siblings, a nested
reply, layout switches, reload, and missing or blocked parents.

## Feed and message routes

- In the feed, put a small **Replying to Alex** link under the reply author.
  Link it to the parent message. For an unavailable parent, use **Replying to
  a message** and keep the link. Apply the same treatment when a reply appears
  on its own in an author feed.
- On a top-level message route, render the selected post first and place its
  direct replies beneath it. Use a thin thread line and a shallow indent to
  establish the relationship.
- On a reply permalink, show the actual parent card above the selected reply
  when the parent is available. Give the selected reply more prominence than
  its context. Place the selected reply’s direct replies underneath it.
- Use the reply count to open deeper branches. Keep mobile cards wide enough
  to read by limiting the indentation. The existing direct reply count
  remains available on each message.
- Keep the bare `#<id>` URL on the selected message when showing its parent.
  Reloading or switching between Social and Workspace should retain the
  same selection. Respect browser-local Hide, Mute, and Block on parent
  context, and use a placeholder when parent content is unavailable.

## Implementation

Reuse the preview’s verified message index and bare-hash links in
[Feed.jsx](../../shadcn-preview/src/Feed.jsx),
[PostCard.jsx](../../shadcn-preview/src/PostCard.jsx), and
[messages.js](../../shadcn-preview/src/messages.js). Use the existing shadcn
Card and Button components for the message and its navigation. Keep the
signed reply metadata, composer behavior, and publication flow as they are.

## Review one item at a time

Use the [local publishing preview setup](../../shadcn-preview/README.md) with
a disposable archive. The publishing review was served at port 5174 during
this session. Seed a top-level post, two direct replies, and one nested reply
if the local fixture is unavailable.

- [ ] In the feed, the reply indicator identifies and opens the parent.
- [ ] A top-level permalink displays its direct replies as a connected group.
- [ ] A reply permalink displays its parent, selected reply, and direct
  children in that order. Reloading and switching layouts preserve the URL.
- [ ] At phone width, the thread line and shallow indent leave the cards
  readable. The reply count opens a deeper branch.
- [ ] Hidden, muted, blocked, or missing parents keep the selected reply
  readable and do not reveal the parent’s body.
- [ ] Ev reviews and signs off on item 5 before work moves to item 6,
  sharing and author links.
