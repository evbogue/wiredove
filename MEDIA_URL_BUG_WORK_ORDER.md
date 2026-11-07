# Portable media references

Updated 2026-11-04. Implemented in Wiredove and the local
`muse-wiredove-adapter` repository; production deployment is separate.
Documentation consolidation, second-node recovery verification and the release
record for the November 4 work are tracked in
[CONSOLIDATION_WORK_ORDER.md](CONSOLIDATION_WORK_ORDER.md).

## Signed format

New uploads publish `media_url: "/#<AndFS manifest hash>"` without a
`media_source`. Inline Markdown and profile `image` / `image_original` use the
same reference. Upload endpoints remain explicit service configuration; their
origins are not copied into signed media metadata. This corrects both the old
`https://wiredove.net/media/<hash>` format and the later absolute `/#hash` URL.

Readers fetch portable references through the consuming application's configured
`mediaURL` (the module's HTTP origin for standalone widgets). Image galleries,
viewers, profile original/re-crop, draft previews and audio/video playback share
this behavior. Image caches include the selected media service so one mounted
application cannot hide another service's failure with its cached result.

Historical absolute URLs, APDS image hashes and anblob readers remain supported.
No historical signed record is rewritten. Muse pending retries retain the exact
old signed attachment reference, signature and content when re-uploading bytes.

Portability does not replicate storage: the selected service must actually hold
or supply the manifest/chunks, and readers still verify every block before use.

## Validation

Tests assert origin-free upload/profile/post metadata, reads of unchanged metadata
through two different configured nodes, historical URL compatibility, tamper
rejection and exact historical pending retry. Shared browser acceptance covers
website and separate-origin embeds, profile crop/re-crop, inline previews and
playback; public fixture publication is not needed.
