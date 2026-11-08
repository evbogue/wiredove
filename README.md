# Wiredove 

![Wiredove Logo](dove_sm.png)

A work-in-progress experimental distributed social networking application built on [ANProto](https://anproto.com/)'s for message authentication, [apds](https://apds.anproto.com/) for message distribution, and [Trystero](https://github.com/dmotz/trystero) for multiplayer serverless collaboration.

Try it at: https://wiredove.net/

### Current status

Node 22+ is the default runtime; Deno remains an optional launcher. Start/check
commands, persistent storage and release procedures live in
[runtime operations](docs/RUNTIME_OPERATIONS.md).

The website and embeds mount one shared application. See the
[application API](client/README.md) for embedding,
[behavior matrix](docs/BEHAVIOR_MATRIX.md) for coverage and gaps, and
[recovery guide](docs/SECOND_NODE_RECOVERY.md) for second-node restoration.
The [release record](docs/RELEASE_RECORD.md) owns dated production and consumer-pin
status.

For new message notifications subscribe via https://ntfy.sh/wiredove or enable browser Web Push in Wiredove. See [NOTIFICATION_WORKFLOW.md](NOTIFICATION_WORKFLOW.md) for delivery behavior and the read-only verified post monitor.

The entire application stack runs in a browser window, so there is no installation required. You can clone the repo down and deploy it anywhere. But because all of the data is local-first you will have the same experience if you use the official Wiredove deployment or do it yourself. 

For agent publishing without a browser, see [the agent publishing quick reference](docs/AGENT_PUBLISHING.md). It covers identity recovery, exact-byte retries, and verified relay delivery.

### Development checks

Node.js 22+ and Deno launch the same server routes and use the same storage.
Node startup uses the npm lockfile and vendored protocol/YAML code; it does not
require Deno or download server modules from a CDN. Browser dependencies retain
their existing pins. Install dependencies before choosing a runtime:

```sh
npm ci
npm start                 # Node, port 8000
# Or, with Deno installed:
npm run start:deno        # Deno, port 8000
```

Use `PORT=8081 npm start` to select a port, and `HOST=127.0.0.1` for a loopback
listener. Both launchers honor the existing `VAPID_CONFIG_PATH`, `BLOB_DIR`,
`APPLICATION_DATA_DIR`, `MEDIA_DATA_DIR`, `MEDIA_MAX_BYTES`, `MEDIA_QUOTA_BYTES`,
`VAPID_SUBJECT`, `PUSH_ICON_URL` and `FEED_ROWS_UPSTREAM` settings. Optional
`DATA_DIR` changes the common data root (default `./data`); explicit per-service
paths take precedence. Static assets and default paths are relative to the current
working directory, so launch from the repository root.

To switch runtimes, stop the current application, keep the same working directory,
data paths, VAPID config and port, then launch the other runtime. **Do not run both
against the same writable data at once.** Existing subscriptions, state, signed
archives, AndFS blocks/metadata and legacy blobs are read in place. A malformed or
incomplete VAPID config stops startup rather than silently rotating keys.

Static serving supports index files, GET/HEAD, conditional reads and single byte
ranges. Directory listings, dotfiles, node_modules, data/config paths and symlinks
into private/outside paths are not served. Both launchers apply the same policy.
Docker uses Node and an unprivileged user. The independent production HTTPS proxy
has its own migration scope. See [runtime operations](docs/RUNTIME_OPERATIONS.md).

Node-only server verification requires no Deno installation:

```sh
npm run check:node
npm test
npm run test:server
```

With browser tooling installed, the additional acceptance commands are:

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:media
npm run test:browser
npm run check:deno        # Optional Deno compatibility
npm run test:media:deno   # Optional Deno compatibility
TEST_DENO_PARITY=1 npm run test:server # Optional Node → Deno → Node, isolated storage
WIREDOVE_TEST_RUNTIME=node npm run test:browser # Real Node backend
```

On Linux, use `npx playwright install --with-deps chromium` to install browser system
libraries too. Browser tests use local servers and isolated fixtures, including
full website message shells, edit summaries, reply previews, separate-origin embeds,
mobile/desktop light/dark layouts and a warm service-worker upgrade. Notification
browser tests mock all outbound writes. CI runs these checks on pull requests and
pushes to `master`, and retains screenshots. Passing checks do not deploy production
or establish full website/embed feature parity.

### AndFS media

New post images and audio/video attachments use AndFS v1 with signed upload authorization, persistent server storage, and verified display/playback. Historical APDS images and anblob attachments remain readable; profile photos preserve the original in AndFS alongside an editable crop of up to 1024 × 1024 pixels. See [MEDIA_PROTOTYPE.md](MEDIA_PROTOTYPE.md) for the local workflow and [WORK_ORDER.md](WORK_ORDER.md) for the cross-client acceptance checks. Deployment and separate consumer-pin evidence live in the [release record](docs/RELEASE_RECORD.md).

### Creating and backing up an identity

Choose **Create identity**, enter a display name, then add an optional photo,
bio and profile links. You can edit an empty profile before making your first
post. Profile saves publish public signed updates; previous versions may remain
available.

Download an identity backup after setup or from Settings. Keep it private:
anyone with the file can use the identity. On another browser, choose
**Create identity → Import existing identity** and paste the backup. Clearing
browser storage without a backup can lose access to the identity.

### Running with Docker

Build the image from the project root:

```bash
docker build -t wiredove .
```

Or use Docker Compose:

```bash
docker compose up --build
```

Run the container and expose it on port 8000:

```bash
docker run --rm -p 8000:8000 wiredove
```

Persist notification state and VAPID keys between restarts:

```bash
docker run --rm -p 8000:8000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/config.json:/app/config.json" \
  wiredove
```

Optional env overrides:

```bash
docker run --rm -p 8000:8000 \
  -e VAPID_CONFIG_PATH=/app/config.json \
  -e VAPID_SUBJECT=mailto:ops@wiredove.net \
  -e PUSH_ICON_URL=https://wiredove.net/dovepurple_sm.png \
  -e FEED_ROWS_UPSTREAM=https://pub.wiredove.net \
  wiredove
```

### Performance toggles and baseline

Enable in-browser performance metrics:

```js
localStorage.setItem('wiredove.perf', '1')
location.reload()
```

Disable metrics:

```js
localStorage.removeItem('wiredove.perf')
location.reload()
```

With metrics enabled, the app logs rolling `avg/p50/p95` timings in the console for route load, feed paging, render, and network batch phases.

Suggested baseline capture flow:

1. Clear storage and reload.
2. Load home feed, profile feed, and alias/community feed.
3. Record `route:*`, `adder.loadNext:*`, `render.blob:*`, `net.*` p50/p95 lines.
4. Keep these numbers as your pre/post optimization checkpoint.

Then open `http://localhost:8000` in your browser.

### Comparisons

WIP

Compare to Bluesky's ATProto

Compare to Nostr

Compare to Secure-Scuttlebot

### ANProto directory

Pubkeys are not memorable, and a person may use several of them or lose one, so Wiredove resolves short handles to arrays of pubkeys through a directory service. This is the human-meaningful side of [Zooko's triangle](https://en.wikipedia.org/wiki/Zooko%27s_triangle): the handle is easy to remember, and the pubkeys it returns do the actual identification.

For example, this JSON maps the handle `ev` to its pubkeys: https://pub.wiredove.net/ev

Try it out in your browser: https://wiredove.net/#ev

The directory is served by [APDS](https://github.com/evbogue/apds). It used to live in a standalone repo called Dovepub; that code has been integrated into APDS and the Dovepub repo is unmaintained.

### ANProto messages

[](https://anproto.com/)  is the latest iteration of the Bogbook protocol, but the 5.1th version aims to be as simple and extensible as possible by simply signing timestamped hashes. These hashes retrieve Yaml documents that contain an author's name, image hash, and the author's previous post. A bonus is that ANProto is no longer called Bogbook, which was a hilarious name but not the best look on marketing materials. 

In this version we've opted to include the avatar name in every post due to previous attempts at impersonation attacks. You can now easily see an author's name and image and how they change over the history of their posts so if someone starts off as 'anonymous commenter' and then switches their name to 'ev' you can see this occur in the feed history. It is also easy to confirm the public key of the post and authenticate whether the messages arrived from approved public keys.

The previous message hash is included in each message to make it easy to sync a feed from the latest post until the oldest post. When Wiredove connects over Trystero to other peers it will send a list of public keys that the application wants to sync. Other peers reply by sending the latest message that they have from every author. If the message is newer then network participants will replicate that message and sync each previous message until the feed history has caught up.

### Synchronization

Synchronization is how a peer catches up on the conversations it cares about: it asks other peers for the latest posts from the authors it follows, then walks each author's chain backward until it reaches a post it already has, and stops. Each peer keeps its own slice of the network. The chain itself is the verification — every post links to the previous one, so the history a peer holds can be checked post by post.

### Trystero serveless multiplayer

Trystero uses legacy Internet infrastructure to bootstrap WebRTC connections. In this case we're using the Bittorrent DHT to negotiate connections. Wiredove will create Trystero rooms for each author that we have knowledge of. Only using public keys to connect makes it possible for multiple network graphs to exist without necessarily overlapping.

Since there are not many active peers at the moment I've set up an ntfy channel to broadcast new messages. https://ntfy.sh/wiredove -- subscribe using the ntfy app to get push notifications when there are new messages.

### URL embeds

ANProto messages are as short as they can be, so it can be possible to relay messages using URL embeds. Open opening the below link, Wiredove will open a Trystero room for the author of the message and attempt to sync the message if any peer is available in that room. 

https://wiredove.net/#evSFOKnXaF9ZWSsff8bVfXP6+XnGZUj8XNp6bca590k=+MmR4IUxD/w26xkn4VoIkNr3zPXQ+mV6DED3+FuglngiX5f6gube5chIDsSGN6vZQWptg4i0BiScx9NQzINnBjE3NDgyODA1MDY0NTd3TTQvbHJWRGZFcDc2dDhNRjhwVzAwb0tWeGZDY21DdzNJMmVHWEVUaDZZPQ==

Questions? ev@evbogue.com

---
MIT
