# Wiredove audio and video

## Goal

Let Wiredove record, upload, sign, verify, and play audio/video attachments shared with the evbogue.com timeline. New media bytes use AndFS v1. Historical ANProto `anblob` posts remain readable but are never written by the new composer.

## Signed media contract

New media metadata belongs in the signed YAML front matter:

```yaml
type: video
andfs: <43-character URL-safe unpadded AndFS manifest hash>
mime: video/webm
media_name: clip.webm
media_size: 123456
media_url: https://example.test/media/<manifest-hash>
media_source: https://example.test
```

The body includes `media_url` as a plain link for older clients. Do not put an AndFS hash in the legacy `blob` field. The signature envelope and signed YAML bytes remain the existing ANProto/APDS format.

AndFS v1 uses 256 KiB chunks, SHA-256 URL-safe unpadded hashes, and a byte-exact ordered JSON manifest. MIME and filename are signed presentation metadata outside the byte identity. The pinned AndFS implementation is in `vendor/andfs/`; do not alter its upstream files.

## Upload and playback

The browser adds media to IndexedDB through an explicit `createAndFS({ store })` instance. It signs the exact `andfs-upload-v1` authorization JSON with the current ANProto identity and uploads the bytes. The server verifies signature freshness, media metadata, size, manifest identity, quotas, and rate limits before writing the blocks and metadata to persistent storage. Publishing is enabled only after the upload succeeds.

The browser fetches AndFS blocks from the signed `media_source`, verifies their SHA-256 identities, reconstructs the file, and assigns the verified bytes to a native audio/video player. The server also exposes a verified media endpoint with GET, HEAD, and byte ranges. This first implementation downloads the full file before browser playback; it is not peer-to-peer streaming.

Existing signed posts with `blob: anblob:v1:...` keep their original reader and endpoint. The two formats have different manifests and chunk sizes and must never be relabeled or conflated.

## Limits and next checks

- Browser-native `MediaRecorder` formats are used; unsupported codecs can still fail to play on another device.
- There is no transcoding, adaptive bitrate, resumable upload, or live streaming.
- Cross-client checks must cover Wiredove and evbogue.com uploads, signature and byte verification, server restart recovery, reply compatibility, and audio/video seeking. See `WORK_ORDER.md`.
- Local implementation changes do not imply production deployment; production behavior changes only after review and deployment.
