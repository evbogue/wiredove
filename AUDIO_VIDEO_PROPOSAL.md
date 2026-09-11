# Proposal: Audio and Video in Wiredove

## Goal

Let Wiredove publish and play audio/video using ANProto blobs.

## UI direction

![Wiredove audio/video concept](docs/wiredove-audio-video-concept.jpg)

Use this mockup as the visual target for integrating media into the existing mobile Wiredove feed.

## User flow

```text
record or upload
      ↓
putBlob()
      ↓
publish ANProto artifact
      ↓
another Wiredove loads it
      ↓
download + verify blob
      ↓
play audio/video
```

## What to add

### 1. Blob support

Use the ANProto blob API:

- `putBlob()`
- `getBlob()`
- `verifyBlob()`
- `downloadBlob()`
- `streamBlob()`

Use IndexedDB in the browser for local caching.

### 2. Media posts

A video post can stay tiny:

```js
{
  type: "video",
  blob: "anblob:v1:chunked:sha256:...",
  mime: "video/webm",
  title: "Chicago River"
}
```

Audio uses the same shape with `type: "audio"`.

### 3. Composer

Add:

```text
[ Write ]
[ Record audio ]
[ Record video ]
[ Upload ]
```

On phones:

- Record audio → microphone
- Record video → camera + microphone
- Upload → camera roll / files

### 4. Playback

Render:

```html
<audio controls>
<video controls playsinline>
```

Wiredove fetches and verifies the referenced blob before/during playback.

### 5. Multi-source downloads

Large media already has a manifest of chunk hashes.

Wiredove can fetch pieces from:

- local cache
- wiredove server
- another peer
- SSB
- IPFS
- any HTTP blob source

`downloadBlob()` already handles:

- randomized source order
- parallel chunk fetches
- hash verification
- corrupt-source fallback
- reassembly

### 6. Streaming

Use `streamBlob()` for large media.

```text
peer A → chunk 1 ┐
peer C → chunk 2 ├→ Wiredove player
peer B → chunk 3 ┤
peer A → chunk 4 ┘
```

Each chunk is verified before use.

## Storage policy

Keep this simple:

```text
posts        → keep
small images → cache automatically
audio/video  → fetch on demand
pinned media → keep offline
```

## First milestone

Only prove this:

1. Record a video on a phone.
2. Store it with `putBlob()`.
3. Publish an ANProto artifact pointing to it.
4. Open that post in another Wiredove client.
5. Fetch + verify the chunks.
6. Play the video.

Audio should then work with essentially the same code.

## Not yet

Do not build:

- transcoding
- adaptive bitrate
- custom codecs
- live streaming
- CDN logic

Start with browser-native media formats.

## Core idea

> Wiredove owns the media experience. ANProto authenticates the artifact. Blob hashes authenticate the bytes.
