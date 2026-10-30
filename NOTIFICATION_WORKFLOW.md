# Wiredove post-notification workflow

How to test that a new Wiredove post is visible, and how to monitor for new
posts later. Verified live on 2026-10-27.

## The two notification paths

1. **In-house Web Push** — `notifications.js` / `notifications_server.js`,
   service worker `sw.js`, VAPID, `/subscribe` and `/vapid-public-key`.
   "Turn on notifications" on wiredove.net subscribes *that browser* via
   `pushManager.subscribe`. A push goes to that browser's service worker,
   not to a chat agent. Use this for a human in their own browser.
2. **ntfy broadcast** — after the website composer confirms relay persistence,
   `post_notifications.js` checks that the signature and exact YAML are retrievable.
   It then broadcasts one canonical `https://wiredove.net/#<message-hash>` link
   through `ntfy.js`, and independently requests browser Web Push via `/push-now`.
   A message hash is the hash of the signature, not the YAML hash or media manifest.
   Notification errors are logged separately and do not mark a published post failed.
   No notification is sent for unconfirmed or unavailable publications. This is a
   best-effort signal from this composer, not a network-wide delivery guarantee:
   other clients, closed tabs, outages and lost notifications can leave gaps.

The single-link behavior is implemented and tested locally on 2026-10-29; it has
not been deployed by this change. The following live test describes the older code.

## Verified test, 2026-10-27

1. On https://wiredove.net/, create a **new test identity only** — never
   import or reuse a real identity for a test.
   - Step 1, "Create your identity": display name only
     (used: `Muse Test`). The identity is stored in that browser.
   - Step 2, "Make yourself at home": optional photo, bio, and links
     (full `https://` or `http://` URLs). Skipped with "Skip for now";
     saving here publishes a public profile update.
   - Step 3, "Your identity is ready": save a private backup. Anyone with
     that file can use the identity, so **never commit, log, screenshot,
     or paste a backup**. For this test the backup was deliberately not
     downloaded, so the test identity lives only in that browser profile
     — the published post itself remains public and signed regardless.
2. Publish a clearly-marked test post. Used:
   "Notification test from Muse Test — testing post notifications,
   please ignore. 2026-10-27"
3. Verify in the feed: the post appeared at the top under "Muse Test"
   ("now", then "10s" after reload).
   Post link: https://wiredove.net/#PW5VMMgNQ/0nCoKvC/5OqKV4dFAO+Y42+QYchmMqeZw=
4. Verify on ntfy: two new entries appeared on `ntfy.sh/wiredove` at
   2026-10-27 16:00 CDT — one post link, and one entry with
   `name: Muse Test` plus the exact post text. That older composer sent both the signature and raw YAML through a URL-prefix
   helper. The YAML entry is not a valid post link; this behavior is superseded
   by the single message-hash notification above.

## Read-only monitor

Run the one-shot monitor repeatedly using an external scheduler. Create a private
state directory first, then pass the same state file on every invocation:

```sh
mkdir -p data/monitor
deno run --allow-net --allow-read --allow-write scripts/monitor-posts.js data/monitor/posts.json
```

The first run saves the latest cached ntfy entry as a baseline and reports no old
posts. Later runs poll ntfy's JSON endpoint after that cursor. For each accepted
Wiredove hash link (or historical signature link), the monitor fetches the signature
and content from the relay, authenticates the ANProto signature and exact content
hash, checks the requested message ID, and only then prints a JSON record containing
ID, author, timestamp, body and canonical URL. Raw-YAML and foreign links are ignored.
An empty/unchanged check prints nothing to stdout. The monitor creates no identity,
uses no secret key and publishes nothing.

Verified message IDs are persisted to deduplicate repeated entries, including a
hash link and a legacy signature link for the same post. Successful entries advance
the cursor through atomic state-file replacement; unavailable or unverifiable posts
and reporting errors leave that entry retryable. A lock file rejects overlapping
runs. If a process is forcibly killed, verify it has stopped before removing its
stale `.lock` file. Back up the state file and retain it across scheduler runs.

The public topic is untrusted: anyone can submit a forged link. Such a link cannot
produce a verified report, but an unavailable/forged post reference can stop cursor
progress. Investigate the failure before explicitly advancing past that ntfy entry;
do not automatically reset the baseline or label its text as a verified post.

This is best-effort monitoring within ntfy's cache retention, not complete history
reconciliation. Run often enough for that retention window; after prolonged downtime
review the public feed/relay history for gaps. stdout delivery and state persistence
are not one transaction: a crash between printing and saving can repeat a report.
Downstream consumers should also deduplicate on the verified message ID.

## Local validation, 2026-10-29

- `npm test` covers canonical broadcasts, confirmation/availability gating, delivery
  failure, cursor retry, persistent deduplication, and actual ANProto signatures,
  tampered content/signatures, substituted message IDs and unavailable content.
- `node tests/composer-notifications.browser.cjs` drives the actual composer with
  local transport fixtures: no broadcast before confirmation, exactly one hash link,
  no broadcast on missing signature/content, and independent browser push when ntfy
  fails. No public test posts or notification broadcasts are made.

## Caveats

- Posts are signed and public; a test post cannot be silently un-published.
  Mark test posts clearly and use a test identity.
- Web Push subscriptions are per-browser and can expire (the server drops
  404/410 endpoints). Do not expect a browser push to reach a chat agent.
- The ntfy topic is public. Do not treat anything posted to it as private.
