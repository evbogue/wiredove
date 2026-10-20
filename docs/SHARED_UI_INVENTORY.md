# Shared UI migration inventory

Baseline: master `ea32306`. First implementation covers module decomposition (S02)
and records S01 contracts. Website migration (S03 onwards) remains outstanding.

## Feature ownership and preservation

| Existing owner | Behavior to preserve | Target shared owner | Frame/adapter responsibility |
| --- | --- | --- | --- |
| render.js, client/ui.js | Message DOM, author, body, metadata, reply actions | ui/message.js | Supply verified post and action handlers |
| markdown.js, client/ui.js | Markdown, hashtags, links, images, unavailable captions | ui/body.js | Navigation mapping; richer website Markdown still to migrate |
| APDS, client/render.js | Name/time/avatar fallbacks | ui/format.js | Provide profile updates; deduplicate APDS helper usage later |
| media.js | Legacy anblob playback, loading/failure, downloads | ui/media.js | Legacy blob resolution and verified storage |
| client/render.js | AndFS gateway image/audio/video, safe URLs, lazy load | ui/media.js, ui/media-render.js | Supply gateway/byte-verification adapter; URL signing is not byte verification |
| render.js | Raw data, QR/share, edit history and edit-event display | Shared message controls | Capabilities, identity and resolved edit provenance |
| moderation.js, render.js | Hidden/muted/blocked state, stubs and actions | Shared message presentation | Website/host moderation policy |
| reply_index.js, render.js | Reply previews/counts and live refresh | Shared thread/feed | Query index and report completeness |
| feed_store.js, feed_orchestrator.js, route.js | Incremental insertion, ordering, paging, caches | Shared feed | Existing local-first adapter and request coordination |
| profile_header.js, profile.js, render.js | Profile fields/updates and author feed | Shared profile | Profile data resolution |
| route.js | Search results and route panels | Shared search/feed | Website hash routes; embed-local navigation |
| composer.js, client/ui.js | Drafts, reply/edit context, errors and success state | Shared composer | Publish service; no success without publisher |
| media.js, composer.js | Recording/upload previews, discarded-resource cleanup | Shared composer/media controls | Recording permission, storage and upload durability |
| send.js, network_queue.js, websocket.js, gossip.js | Delivery, confirmation/retry, networking | Service contracts | Website transport/storage implementation |
| route.js, app.js | Scroll restoration, popovers, panels, navigation | Website frame | Website lifecycle and navigation policy |
| client/feed.js | Verified bounded author history, refresh/error/loading | Public-relay adapter | No global/thread completeness claim |

The split preserves existing widget behavior rather than replacing the website's richer
renderer. No feature in this table is approved for deletion by this inventory.

## Provenance boundary

`client/protocol.js` authenticates the signature, exact content hash, timestamp and
message ID. `client/feed.js` additionally checks previous-message IDs and author identity.
Existing website APDS imports pass through `make`, `open`, and `add`; website rendering
also obtains content from APDS and cached feed rows. A complete cache verification audit
is still required in S01/S04: don't label arbitrary cached rows verified on normalization.

The proposed APDS-to-record mapping is `hash -> id`, `sig -> signature`, `text -> content`,
`ts -> timestamp`, with author/contentHash derived from a validated `opened` envelope.
Normalization must not silently become verification. `client/core/contracts.js` records
the target shared contracts; it is not an implemented adapter or service.

## DOM and lifecycle constraints

- render.js uses document IDs for message/content/profile/edit nodes and timestamp observers.
- route.js queries `[data-author]`, creates/detaches route panels and restores scroll.
- Composer overlays append to document.body; publishing currently calls render.js directly.
- The current widgets use shadow DOM. Document selectors cannot inspect their inner DOM.
- S03 must provide widget references/events for these integrations, including author discovery
  and update targets, before replacing website message construction.
- Shadow DOM policy for website integration remains a design checkpoint; neither removing
  encapsulation nor losing existing selectors counts as an implicit migration decision.
- Services/subscriptions must clean up; reconnecting or replacing a feed cannot deliver stale
  results. Media recording streams and object URLs need explicit disposal in later migration.

## First implementation validation and remaining gates

Existing client behavior is covered by renderer-name/time, media upload-contract, relay
publish-order, and feed authentication tests. Dedicated registration/import tests check
that individual widgets register dependencies and repeated registration is safe.

Website/embed baseline screenshots and separate-origin browser acceptance remain outstanding.
Browser installation failed in the earlier session. S01 is therefore partial; S02 can be
structurally tested, but don't claim observed browser equivalence or shared website rendering.
