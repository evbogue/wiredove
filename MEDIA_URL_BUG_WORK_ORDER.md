# Media URL hardcoding bug — work order

Filed 2026-11-04 by Ev via Muse. Status: bug recorded, fix not started.

## The bug

Signed posts must carry blob hashes, never origin-hardcoded media URLs.
Wiredove is a multi-node system — a post signed on one node must not hardcode
another node's `https://wiredove.net/media/...` URLs.

The website composer was already fixed for this on 2026-10-31 ("Hash-only media
navigation", deployed in cd7c09e): `client/andfs.js:77` builds
`media_url` as `<origin>/#<manifest-hash>`, and the render path
(`client/andfs.js:143-147`) extracts the bare AndFS manifest hash from both
`#hash` URLs and legacy `/media/` URLs at render time. Historical signed posts
with hardcoded `https://wiredove.net/media/...` URLs (e.g. the 2026-10-30
"Coffee on Argyle" post) keep rendering through the legacy reader — never
rewrite signed historical posts (see AGENTS.md).

The remaining offender is `muse-wiredove-adapter` (separate repo). Its
`src/andfs.js:43` still computes the legacy format:

```js
media_url: `${origin}/media/${manifestHash}`
```

and `src/publish.js:231` appends that URL to post bodies, while
`src/pending.js:113` validates profile `image` against it. So the adapter's
2026-11-03 profile photo post published
`image: "https://wiredove.net/media/JnaCDSL4wIBzjPI0krHDgpFhq6Hw5O-j5AeeWJf-BsQ"`
— the pre-fix format, reintroduced after the website moved on.

## The fix (not started, adapter repo)

1. `src/andfs.js`: compute `media_url` in the current hash-route format
   (`${origin}/#${manifestHash}`), matching `client/andfs.js:77`.
2. `src/publish.js:231` and `src/pending.js:113`: keep working against the new
   format (no logic change needed beyond the `media_url` value, but verify).
3. Long-term: prefer publishing the bare manifest hash with clients resolving
   the fetch URL against the viewing node's origin at render time, so signed
   content carries no origin at all.

Open design decision: bare manifest hash vs `/#<hash>` reference as the signed
format. The website currently signs `<origin>/#<hash>`; the resolver only needs
the hash. Pick one format and use it in both repos.
