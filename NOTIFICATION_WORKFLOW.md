# Wiredove post-notification workflow

How to test that a new Wiredove post is visible, and how to monitor for new
posts later. Verified live on 2026-10-27.

## The two notification paths

1. **In-house Web Push** — `notifications.js` / `notifications_server.js`,
   service worker `sw.js`, VAPID, `/subscribe` and `/vapid-public-key`.
   "Turn on notifications" on wiredove.net subscribes *that browser* via
   `pushManager.subscribe`. A push goes to that browser's service worker,
   not to a chat agent. Use this for a human in their own browser.
2. **ntfy broadcast** — `composer.js` calls `ntfy.js` on every publish, which
   POSTs to the public topic `https://ntfy.sh/wiredove`. The body is a post
   link (`https://wiredove.net/#<sig>`). This is the path an agent can
   monitor: it needs no account, but it is public, and an entry carries a
   link, not necessarily the full post text on its own.

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
   `name: Muse Test` plus the exact post text. Two entries are expected:
   the composer posts both the signed message and its blob.

## Replicating the monitor

1. Record a baseline: the newest post (author, text, link, time) already
   seen, so a later check can tell "new" from "already known".
2. On each check, look at `https://ntfy.sh/wiredove` for entries newer than
   the baseline, and/or reload the public feed at https://wiredove.net/
   (no account is needed to read it).
3. For each new entry, follow its link to confirm the post in the feed
   before reporting it — an ntfy entry alone is a link, not proof of the
   post's content.
4. Notify only on genuinely new posts; stay quiet on unchanged checks.
   Feed activity is slow (the newest pre-test posts were ~3 weeks old),
   so frequent polling mostly returns nothing new.
5. Update the baseline after every confirmed new post.

## Caveats

- Posts are signed and public; a test post cannot be silently un-published.
  Mark test posts clearly and use a test identity.
- Web Push subscriptions are per-browser and can expire (the server drops
  404/410 endpoints). Do not expect a browser push to reach a chat agent.
- The ntfy topic is public. Do not treat anything posted to it as private.
