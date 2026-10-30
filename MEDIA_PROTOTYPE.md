# Wiredove audio and video prototype

New Wiredove post images and audio/video attachments use AndFS v1, matching the media contract implemented by the evbogue.com timeline. Historical `blob: anblob:v1:...` attachments remain readable through the legacy ANProto reader.

## Local smoke path

```sh
docker compose up --build
```

Open `http://localhost:8000`, create or import a local identity, and use **Audio**, **Video**, or **Upload** in the composer. The recorder or file picker previews the media, writes verified AndFS blocks to IndexedDB, and uploads the bytes to the local server with a short-lived ANProto signature over the exact upload metadata. Publishing adds `andfs`, MIME, filename, size, media URL, and source URL to the signed message. The body contains the ordinary media URL as a fallback for older clients.

The server validates the signer, authorization age, media type, size, AndFS manifest, storage quota, and per-signer upload rate. It stores the blocks under `data/andfs`, and media metadata under `data/media`; Docker Compose persists both through `./data`. The public `/blobs/<hash>` route serves verified AndFS blocks. `/media/<manifest-hash>` serves reconstructed bytes with GET, HEAD, and byte-range support. Website and embed playback share the AndFS media renderer. Browser playback fetches blocks from the signed source URL and verifies each block before playback.

For an occupied local port, run Deno directly with a different `PORT` and a scratch `MEDIA_DATA_DIR`:

```sh
PORT=8001 MEDIA_DATA_DIR=/tmp/wiredove-media deno run --allow-net --allow-read --allow-write --allow-env serve.js
```

## Prototype limits

- AndFS playback downloads and verifies the full file before assigning it to the native audio/video element. The server also offers a verified range endpoint.
- Signed posts replicate independently of media bytes. A receiving client fetches verified blocks from the signed source; relays do not automatically mirror files.
- There is no transcoding, adaptive bitrate, or peer-to-peer media transport.
- Browser-native `MediaRecorder` formats are used.
- Media uploads require a fresh ANProto signature. Public reads are available to support cross-client playback; uploads are bounded and quota limited.
- Historical anblob posts are read using their original IDs and endpoint. New posts never put an AndFS hash in the legacy `blob` field.
- The local implementation has not been deployed or accepted as production behavior until its changes are reviewed and deployed.

## Architecture

```text
camera / microphone / file
          |
          v
AndFS v1 add() ──────> IndexedDB blocks
          |
          v
signed upload authorization
          |
          v
persistent server AndFS store
          |
          +──> signed Wiredove artifact (`andfs` metadata)
                     |
                     v
              another Wiredove
                     |
                     v
           fetch blocks + verify + play
```

AndFS authenticates the media bytes. Wiredove signs the attachment metadata and upload intent, and owns the media UI.

## Inline post images

The image toolbar uploads original PNG/JPEG/GIF/WebP files through signed AndFS
authorization. Each completed upload inserts `![](media_url)` into the draft, preserving
multiple images and their placement in the signed body. The shared inline image
widget extracts the manifest/source from that signed URL and verifies blocks before
display. Historical APDS images keep their original hash reader. New profile photos preserve the original in AndFS and upload a separate square crop
(up to 1024 px without enlarging smaller crops). Historical APDS profile photos
remain readable. No original image files are resized or converted.
