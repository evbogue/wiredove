# Wiredove media prototype

This branch implements the first audio/video milestone from `AUDIO_VIDEO_PROPOSAL.md`.

## What works

1. Open the Wiredove composer.
2. Choose **Audio**, **Video**, or **Upload**.
3. Recorded/uploaded media is content-addressed with the ANProto blob implementation.
4. The browser keeps a verified local copy in IndexedDB.
5. The same blob graph is uploaded to Wiredove at `/blobs/<anblob-id>`.
6. Publishing creates a normal signed Wiredove/APDS message with media metadata:
   - `type: audio|video`
   - `blob: anblob:v1:...`
   - `mime: ...`
7. Another browser can receive the signed post, fetch the media by ANProto blob ID, verify it, and play it inline.

## Run

```bash
docker compose up --build
```

Then open `http://localhost:8000`.

The Docker Compose config mounts `./data` into the container, so uploaded media survives container restarts.

## Prototype limits

- Playback downloads and verifies the full blob before assigning it to the native audio/video element.
- This is not yet true peer-to-peer streaming.
- There is no transcoding or adaptive bitrate.
- Browser-native `MediaRecorder` formats are used.
- The server blob endpoint is intentionally simple and unauthenticated for this prototype.

## Architecture

```text
camera / microphone / file
          |
          v
ANProto putBlob()
   |             |
   v             v
IndexedDB     /blobs
   |             |
   +-------> signed Wiredove artifact
                     |
                     v
              another Wiredove
                     |
                     v
             fetch + verify + play
```

ANProto authenticates the media identity through content hashes. Wiredove signs/publishes the artifact and owns the UI.
