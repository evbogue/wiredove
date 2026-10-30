# Profile links: shipped scope and follow-up work

## Goal

Make Wiredove the home for a person's identity and introduction while letting
them link to all their other internet properties. Links supplement the bio;
they do not require an account on a recognized platform.

## First version

- An ordered `links` array in signed profile YAML, published through the existing
  APDS compose/sign/send path. Entries contain `label` and `url` only.
- Add, rename, reorder with Move up/down, remove, save, and cancel in Edit profile.
- Inline URL validation and live icon previews. Blank labels use the hostname.
- Left-aligned wrapping buttons beneath the bio; visible labels, keyboard focus,
  dark/light themes, local SVG icons and a globe fallback for unknown websites.
- Shared data helpers in `client/profile-links.js` and DOM rendering/editor in
  `client/ui/profile-links.js`. Website and embed profile views use the same
  link renderer. This does not complete the wider shared-profile migration.
- Vendored selection of Simple Icons 16.35.0, including its license/disclaimer.
  Recognized hosts include GitHub, X/Twitter, Bluesky, YouTube, Instagram,
  Twitch, Reddit, mastodon.social and mastodon.online. Other Mastodon servers
  and custom-domain accounts use the globe until explicit service hints exist.

```yaml
name: Example Person
bio: Building things on the internet.
links:
  - label: My website
    url: https://example.com
  - label: GitHub
    url: https://github.com/example
```

Read the newest explicit array from an author's non-reply history. Absent
`links` preserves the previous list. `links: []` clears it. A malformed non-array
does not count as an update. Invalid entries in arrays are omitted on display;
the editor rejects them before publishing. Only absolute HTTP(S) URLs without
embedded credentials are accepted. Labels are rendered as text, never HTML.
No other profile fields or signed messages are rewritten to migrate old profiles.

## Follow-up 1: richer profile composition

Improve Markdown paragraph/list spacing, editing labels, live bio preview,
and long-bio expansion. Use the same widget in both frames; retain signed Markdown
unchanged. Acceptance: keyboard editing, cancel/error recovery, mobile expansion,
and equivalent rendered content in the website and a separate-origin embed.

## Follow-up 2: broader platform recognition

Add more vendored service icons on demand. Consider an optional explicit
`service` hint for custom-domain/federated accounts, with a fixed allowlist and
globe fallback. Do not guess a service based on arbitrary URL substrings, fetch
remote favicons automatically, or accept SVG from profile authors. Define and
document any schema extension before writing it into signed metadata.
Acceptance: deceptive hosts retain the globe; icons remain local and usable
without a CDN; update the pinned version, provenance and brand usage review.

## Follow-up 3: link ownership and trust

Current links are author-provided claims, not verified ownership. Existing
`rel="me"` enables reciprocal-link workflows but is not itself a verification
badge. Define proof formats, refresh/expiry rules, and failure behavior before
adding domain/reciprocal-profile verification. Fetching arbitrary domains must
not expose private network resources. Acceptance: demonstrate valid, expired,
removed and mismatched proofs without showing an unearned verified badge.

## Follow-up 4: editing polish

Consider drag reordering in addition to keyboard buttons, URL paste helpers,
duplicate warnings, clearer destination display, and suggested labels. Avoid
fixed platform slots or excluding independent websites. Preserve order and
custom labels. Acceptance: keyboard and touch parity, long Unicode labels,
multiple links to the same service, and recovery after failed publishing.

## Follow-up 5: complete shared profile/history integration

The embed can only resolve metadata in its loaded, verified posts. Add an
explicit host-supplied profile/history adapter so links remain available when
their update falls outside the feed limit. Consolidate the full header/name/bio
renderer and editor under the shared UI work order; do not create a second bio
implementation. Acceptance: observed separate-origin browser embed, limited
feed with older metadata, clear-versus-absent history behavior, and shared
normalization/rendering contracts across both frames.

## Verification

Run `node --test client/profile-links_test.js client/ui/modules_test.js`.
With Playwright and its Chromium browser installed, run
`node tests/profile-links.browser.cjs` for the isolated browser regression suite.
Browser-check adding, changing, reordering, removing all, cancel, invalid URLs,
failed-save recovery, and reloading from serialized YAML history. Check 375px
and desktop layouts in light/dark themes and a separate-origin embed. Verify
updates pass through compose and send; isolated browser mocks are not a live
relay/signature acceptance test. Use a designated test identity for live tests.

Delivery-session results: all six Node tests passed, and the APDS YAML encoder
round-tripped ordered links and `links: []`. Browser regressions were added but
could not run here: Chromium download failed and the cloud browser could not
reach the isolated local server. Live relay publication and visual acceptance
remain to be checked with a test identity in a browser-capable environment.
