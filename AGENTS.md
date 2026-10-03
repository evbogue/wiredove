# AGENTS.md

## Purpose

This file records project context and session-specific lessons so future agents do not repeat failed work.

## Repository basics

- Repository: `evbogue/wiredove`
- Default branch: `master`
- Audio/video planning document: `AUDIO_VIDEO_PROPOSAL.md`
- The current first milestone is intentionally small:
  `record/upload → blob → ANProto artifact → fetch → verify → play`

## Product direction

Wiredove is the user-facing product layer.

ANProto should remain a small authentication/provenance layer rather than becoming “SSB 2.”

For media:

- Wiredove owns the media UX.
- ANProto authenticates the artifact / statement.
- Blob hashes authenticate the bytes.
- Storage and transport are replaceable.
- SSB may be one backend, but SSB feature parity is not the goal.

The broader project direction is sustainable, portable internet fame rather than protocol completeness for its own sake.

## AndFS migration work order

Ev requested new media use AndFS on 2026-09-17. Follow `WORK_ORDER.md` for this migration. The architecture below describes the existing anblob implementation, which must remain readable for old signed posts; it is not the target for new writes.

## Audio/video architecture

ANProto now has content-addressed blob support in the ANProto repository.

Relevant concepts:

- Small blobs are raw SHA-256-addressed blobs.
- Large blobs are deterministic 1 MiB chunks plus a hashed manifest.
- `putBlob()`, `getBlob()`, `verifyBlob()`, `downloadBlob()`, and `streamBlob()` exist.
- Media artifacts should contain references such as:
  `{ type: "video", blob: "...", mime: "video/webm" }`
- The media artifact still needs to go through Wiredove's existing ANProto signing/publishing path. The helper that constructs a media artifact does not itself sign it.
- Do not rely on ANProto's demo in-memory HTTP blob endpoint for production storage; it is ephemeral.
- Do not overclaim universal progressive browser playback. Arbitrary 1 MiB storage chunks are not guaranteed to be valid MediaSource segments.

## Mockup / image upload lesson

A generated Wiredove audio/video UI mockup exists in the ChatGPT session as the original PNG:

`dark_wiredove_feed_with_audio_and_video.png`

The intended repository location is:

`docs/wiredove-audio-video-concept.png`

### Important: do not repeat the failed upload approach

The ChatGPT GitHub connector available in this session can write UTF-8 text and can create Git blobs from supplied text/base64, but it cannot directly stream a local/conversation binary file into the repository.

Attempts to manually transfer the ~1.3 MB PNG as base64 through connector calls were blocked by tool/safety payload limits. Earlier attempts that tried to work around this produced a corrupt/truncated JPEG.

Therefore:

- Do not convert or resize the original just to get it through the connector unless the user explicitly asks for that.
- Do not claim the PNG has been uploaded unless GitHub confirms the actual repository path exists.
- Do not create a fake GitHub URL before the path exists.
- Prefer a GitHub-capable environment that can upload binary files directly (local git, GitHub CLI, Work/computer environment, or a connector/tool that explicitly accepts binary/file references).
- Preserve the original PNG byte-for-byte when it is eventually uploaded.

A `.upload-parts/` directory currently exists in the repository from a failed chunk-staging attempt. Treat it as a failed workaround, not part of the intended architecture.

## UI reference lesson

When making UI mockups for Wiredove, use an actual Wiredove screenshot as the visual basis when the user asks for fidelity to the real product. Do not invent a generic social-feed UI and call it Wiredove.

## Working style

Prefer implementation over long planning documents when the next step is clear.

For substantial code changes, inspect the current repository structure first rather than assuming how Wiredove imports ANProto or publishes artifacts.

Keep scope tight: prove the simplest working media path before adding transcoding, adaptive bitrate, live streaming, CDN logic, or a custom media stack.

## Shared UI architecture requirement

Ev requested a single shared UI implementation for the website and embeds on
2026-10-03. Follow `SHARED_UI_WORK_ORDER.md` for the restructuring.

- Both application frames must consume the same individually importable rendering
  and UI widgets. The website is the primary consumer, not a parallel renderer.
- Frames own layout, top-level navigation, adapter selection and capability settings.
  Shared widgets own message, media, feed, thread, profile, search and composer UI.
- Put fixes in shared modules. Do not copy rendering code into a frame or maintain
  separate website/embed versions of body formatting, media or composer behavior.
- Keep verification/normalization and service contracts shared; storage, identity,
  transport and moderation policy may be supplied through explicit adapters.
- Public widget imports must not boot the website, initialize its identity/storage,
  register its service worker, or require its import map.
- Preserve website features and immutable signed bytes. Migrate one vertical slice
  at a time, beginning with shared message/media widgets used by both frames.
- Current code is not yet compliant: website rendering and client widget rendering
  are separate. Do not describe the planned restructuring as completed.
- Require cross-frame behavior checks and an observed separate-origin browser embed
  before claiming full shared-widget acceptance. Unit tests alone do not prove it.
