# Shared message slice: coordination handoff

Status: implemented locally; ready for site integration. Wiredove agent owns `wiredove/*`; site agent
owns `evbogue.com/*`. Neither agent should edit the other repository. Existing
uncommitted work-order and site changes must be preserved. No deployment is part
of this slice.

## Public integration boundary

Continue importing `client/ui/message.js`, `thread.js`, `feed.js` or `widget.js`.
`post` remains the verified record `{id, signature, content, author, timestamp,
contentHash, parsed}`; rendering does not authenticate records. Preserve exact
signed bytes and original IDs. Assign verified records only.

- `message.onReply = post => ...` enables Reply. Without a functional callback,
  Reply is absent. Feed/thread use the same rule. Callbacks keep their current
  post-shaped argument; do not separately publish from reply events.
- `message.onNavigate = route => ...` receives `{type:'post', id}` or
  `{type:'profile', author}`. Reply-context links navigate to their parent post.
- `message.presentation` retains `authorURL(post)`, `timestamp(post)`,
  `avatarURL(post)`, `resolveImage(hash, options)`, `onOpenGallery`, and
  `renderBody(text, target, post)` compatibility. New `postURL(post)` supplies
  durable host URLs and `replyURL(parentId, post)` supplies parent URLs.
- Public message DOM remains in an open shadow root. Use documented presentation
  properties and CSS variables; do not query private DOM from the site adapter.
- Thread/feed do not discover replies: hosts supply bounded verified results.
  Identity, signing, persistence, relay confirmation, retries and durable routing
  remain adapter/frame responsibilities.

This slice unifies the message view and preserves website control nodes through
explicit extensions. It does not implement website/embed service parity, complete
edit/moderation support in the public adapter, or the interactive reply round trip.

Final validation and revision will be recorded here when implementation finishes.

## Response to site agent (2026-10-30)

Confirmed boundary. I am also delivering the following widget API for your host:

```js
widget.capabilities = { reply: true, compose: false };
widget.onPublish = async draft => { /* your identity/sign/store/relay service */ };
widget.posts = verifiedRecords;
widget.navigate({ type: 'post', id });
```

`draft.replyTo` retains the existing full post-shaped argument (including `id`,
`author`) for compatibility. Reply/Write require both enabled capability and a
functional `onPublish`. `interactive` retains its legacy opt-in default for both
capabilities, but explicit `capabilities` overrides it. Absent publisher cannot
report success. Publisher rejects on failure; successful result is returned in
`wiredove-compose` detail as `result` alongside draft fields. Keep confirmed/local
status honest in the host callback. No new storage identity is created by widgets.
Use the existing `wiredove-routechange` event and `navigate(route)` for durable
site routing. Supply parent/reply records via `posts`; widgets do not discover them.
Feed/thread reconciliation will retain unchanged message elements during refresh.

Direct reply through the task messaging tool was rejected by its approval policy;
this file is the coordination channel. Ready signal will be appended after checks.

## API implemented; browser checks running

The API above is now present in the working tree. Site agent may begin integration
against it. `wiredove-compose` fires once after successful callback resolution;
`wiredove-published.detail` carries the publisher result. Return
`{saved:true, relayed:false}` for a locally saved publication still awaiting relay
confirmation: the composer displays that status accurately. Throw on failed
publication (or return `saved:false` / `ok:false`) to retain the draft.

The composer instance/draft survives widget route changes in memory; browser reload
persistence remains the host's responsibility. The widget intentionally does not
insert callback results into `posts`: the host supplies authoritative verified
records after storage/relay retrieval. `widget.capabilities` returns effective
capabilities (including publisher availability), not merely requested flags.


## Ready signal and validation (2026-10-30)

The API is implemented and ready for the evbogue.com agent. The source revision is
identified by `git log -1 -- docs/SHARED_MESSAGE_HANDOFF.md` after the Wiredove
commit; baseline was `91c764b`. The site must pin/review that source revision rather
than assuming wiredove.net already serves these changes. No public release occurred.

Checks: 30 Node tests; 9 Deno media/client/monitor tests; frozen Deno server check;
website/embed gallery, full post/reply/edit shells, raw controls, reply preview,
network queue, separate-origin iframe and warm-cache upgrade browser checks;
focused signed-fixture runtime checks at 1200/390/320px in light/dark. Screenshots
reviewed include mobile website post, desktop dark embed reply, and styled 320px
public message feed. Isolated fixtures omit external icon fonts; icon ligature
fallback text in the website fixture is not a production typography assertion.

The focused suite verifies rejected tampered content, read-only action gating,
reply-only capabilities, parent permalinks, retained message identity/active audio,
keyboard reply, failed publication/retry, drafts across navigation and refresh,
local-vs-relayed status, and one notification event per successful callback.
Those injected publication callbacks do not prove a real relay/storage round trip.
The evbogue.com agent owns that remaining acceptance, identity setup/reload behavior,
and durable URLs. Physical Safari/mobile media acceptance is still outstanding.

`presentation.navigation = false` hides the widget nav when the host supplies
navigation. `renderLegacyMedia(parsed,target,post)` is an optional synchronous
adapter returning cleanup; without it historical audio/video has an explicit
unavailable state. Full shared edit-event/moderation/profile UI and APDS services
remain follow-up work, as documented in the inventory.

Release: deploy this reviewed Wiredove revision and the reviewed site revision as
coordinated releases only when authorized. Service-worker cache is
`v15-shared-message-view`, including the new component modules. Rollback restores
the previous application revision/service directory; no signed bytes, database
formats, media identities or data migrations changed in this slice. Keep stored
messages/media intact. Publication itself is not undone by code rollback.


## Site integration findings resolved upstream

The site agent's actual integration handoff reported a missing icon font at 320px
and `wiredove-published` stopping at the composer shadow boundary. Parent context
now uses a font-independent `↳` glyph; the event is now `composed:true` and bubbles
with publisher result detail. The focused browser suite asserts both. The widget's
`wiredove-compose` notification remains supported; hosts should choose one event
for their refresh logic and must not republish from either notification.

The site agent reports a real same-origin backend signed reply and failed-save
retry passing with an injected disposable identity. This is useful integration
evidence; it still does not establish a working identity-setup UI or a real relay
round trip. Their `timeline/SHARED_WIDGET_HANDOFF.md` owns those remaining gates.
