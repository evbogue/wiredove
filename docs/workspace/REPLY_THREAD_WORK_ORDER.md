# Work order for reply and thread layout

**Status** · Complete · 24 November 2026

Revise item 5 of the shadcn preview walkthrough so readers can see which
message a reply answers in the feed and on a message route. Item 4,
composer and publishing, has been accepted. Item 5 was closed after Ev delegated acceptance and all six browser checks
passed on rerun.

The preview can already publish replies to the local archive, open direct
replies by count, and preserve the selected message when switching layouts.
The compact reply link and connected message route replace the inset parent
excerpt. Chromium checks at 320px and 1280px covered two siblings, a nested
reply, layout switches, reload, and missing or blocked parents. A 24 November
Chrome run against a disposable local archive verified all six behavior
checks below at 320px.

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
  its context. Bring the selected reply into view below the sticky header
  when opening its permalink. Place its direct replies underneath it.
- Use the reply count to expand or collapse deeper branches in place.
  Mark each expanded branch with a left-side line. Keep the line-to-card
  gutter consistent at 10px on phones and 16px on desktop. Use the timestamp for
  a reply’s permalink. Cap indentation after the
  second level on phones and the third on desktop. Confirming a new reply
  opens its branch so the message is visible immediately.
- Keep the bare `#<id>` URL on the selected message when showing its parent.
  Reloading or switching between Social and Workspace should retain the
  same selection. Open one inline reply composer directly below the chosen
  card. Keep the feed’s new-post draft separate and put a pending reply’s
  retry control beside its target when that target is visible. Confirmed
  replies appear below their target in the current view, even while archive
  refresh is pending. Respect
  browser-local Hide, Mute, and Block on parent
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

- [x] In the feed, the reply indicator identifies and opens the parent.
- [x] A top-level permalink displays its direct replies as a connected group.
- [x] A reply permalink displays its parent, selected reply, and direct
  children in that order. With a long parent, opening the permalink or
  reloading lands on the selected reply. Switching layouts preserves the URL
  and keeps focus on the view switch.
- [x] Reply opens and focuses the field beneath the tapped card. Cancel
  returns focus to Reply and leaves the feed draft intact.
- [x] At phone width, the thread line and shallow indent leave the cards
  readable. The reply count expands and collapses a deeper branch without
  changing the selected message URL.
- [x] Hidden, muted, blocked, or missing parents keep the selected reply
  readable and do not reveal the parent’s body.
- [x] Item 5 accepted after the delegated browser review on 24 November 2026.
