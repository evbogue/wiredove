# Image galleries within Wiredove messages

Requested by Ev, 2026-10-21. Status: implemented in the shared renderer/gallery/viewer; validation and release notes follow below.

## Outcome

Present one, four, ten, or more images as readable, responsive galleries inside the message body. Images may occur before, after, or between text, including within a paragraph, list item, or quotation. Keep each image at its authored position relative to surrounding text. Do not collect every image into an attachment strip at the bottom of a post.

Deliver one shared gallery implementation consumed by the website and embedded message widgets. Preserve signed content, image references, and the existing ability to tap the enlarged image to close it.

## Current implementation and constraints

- `markdown.js` renders legacy APDS image references as `img.post-image`. Its paragraph renderer removes images from mixed paragraphs and appends an image row after the remaining text; it also merges adjacent image-only rows. This can change the intended relationship between prose and images.
- `client/ui/body.js` separately parses lines, renders HTTP(S) images, and shows unavailable captions for legacy references. The website and embed do not yet share their complete body renderer.
- `client/ui/message.js` calls the client body formatter and AndFS attachment renderer. `client/ui/media-render.js` is a separate path for typed AndFS attachments.
- `client/ui/image-popover.js` supplies the website viewer, with storage and transport callbacks. Its delegated body handlers target `img.post-image`; these do not automatically support image events inside widget shadow roots.
- Legacy image loading in `markdown.js` and `render.js` uses source-derived element IDs and single-element lookups. Repeated references in a gallery, another message, or a second frame must each load correctly.
- Read `AGENTS.md` and the consolidated work order/inventory in `SHARED_UI_WORK_ORDER.md` before implementation. Integrate with the shared application and preserve gallery behavior in both mounts. Do not create another independent body renderer or require completion of the whole restructuring first.

These are starting observations, not claims that all image paths already have equivalent behavior. Recheck the current code before editing.

## Content placement and gallery grouping

Use parsed Markdown structure or a safe ordered DOM representation, not regular-expression removal and reassembly of rendered HTML.

1. A gallery is a maximal consecutive run of image nodes at the same structural level.
2. Whitespace, soft line breaks, and blank image-only paragraphs may join consecutive images into one gallery, provided they remain in the same container.
3. Visible text, a text link, caption paragraph, heading, list boundary, quotation boundary, code block, audio/video player, or another meaningful node ends the run.
4. Images separated by text remain separate galleries. Even one image is a gallery.
5. Split mixed paragraphs into ordered text fragments and galleries while preserving inline formatting, links, punctuation, and list/quotation ownership. Use valid HTML; do not insert a block gallery inside a paragraph element.
6. Preserve duplicate image occurrences and their order. Cache source resolution by reference if useful, but identify displayed occurrences independently.
7. A linked image remains an image with its link destination retained. Provide its original link as a secondary viewer action rather than losing the link or navigating away when the thumbnail is opened.
8. Images appearing as literal text in fenced or inline code are never galleries.
9. Do not interpret arbitrary raw HTML as trusted content or expand currently supported markup solely to implement galleries.

Required examples:

| Authored content, in order | Rendered content, in order |
| --- | --- |
| Intro; image A; image B; closing paragraph | Intro; two-image gallery A/B; closing paragraph |
| Text A; image A; text B; image B; text C, all in one paragraph | Text A; single-image gallery A; text B; single-image gallery B; text C |
| Four adjacent images between two paragraphs | First paragraph; four-image gallery; second paragraph |
| Ten adjacent images | One bounded gallery; all ten available in its viewer |
| Image A; caption paragraph; image B | Single-image gallery A; caption paragraph; single-image gallery B |
| Image A in one list item; image B in another | One gallery inside each list item |
| Image A; blank line; image B in the same container | One two-image gallery |
| Same source referenced twice | Two ordered occurrences; both resolve and open correctly |

Do not infer that ordinary prose is a caption and move it. Preserve authored text. Keep alt text available to assistive technology; an optional Markdown title may appear as a viewer caption through safe text rendering.

## Feed layout

Use the width available inside the message body, including nested replies and narrow embeds. Base responsive decisions on the gallery/container width rather than the browser viewport alone.

| Images in one run | Default presentation |
| --- | --- |
| 1 | One full-width image area preserving its natural aspect ratio, with a bounded maximum height and contain behavior for unusually tall/wide images |
| 2 | Two equal tiles in one row |
| 3 | One larger leading tile and two stacked tiles beside it |
| 4 | Balanced two-by-two grid |
| 5 or more | The same bounded two-by-two preview using the first four occurrences; the fourth tile shows “+N more”, where N = total minus four |

For ten images, show four tiles with “+6 more” on the fourth. The overlay counts images beyond the four visible previews. Opening any tile starts at that image's actual index; opening the fourth starts at image four, not image five. Viewer navigation exposes every image in the run.

- At very narrow widths, simplify two/three-image layouts into a two-column grid; allow a full-width final tile for three images. Keep all controls usable at 240 px container width.
- Reserve predictable tile space while loading so image arrival does not reshuffle surrounding text.
- Use consistent small gaps, rounded corners, and theme-aware placeholder/background colors aligned with Wiredove's existing message styling.
- Multi-image previews may crop with `object-fit: cover`; the viewer always shows the full image. Do not stretch images.
- Keep single images, especially screenshots and portrait photos, readable without requiring every image to become a square crop.
- Long runs must not create an unbounded wall of thumbnails. Do not hide meaningful text between runs to achieve compactness.
- Do not treat avatar/profile imagery, emoji, icons, or composer previews as message galleries.

## Viewer interaction

Extend/reuse the existing shared image viewer rather than adding a competing modal.

- Open the selected occurrence and show its position, such as “4 of 10”, within that gallery.
- Provide previous/next buttons; disable them at the first/last image. No wrapping in the first version.
- Support Left/Right arrows and mobile swipe navigation. Distinguish a swipe or scroll gesture from a tap so navigation does not immediately close the viewer.
- Preserve tapping anywhere on the enlarged image to close, backdrop close, the explicit Close button, and Escape.
- Activating navigation, caption/link actions, or download controls must not close the viewer. Stop accidental post navigation or reopen events.
- Contain the whole image within the available viewport; keep controls and captions clear of device safe areas.
- Keep focus inside the open dialog; restore focus to the originating tile on close. If it was removed, restore to an appropriate surviving message control.
- Use labeled, keyboard-operable thumbnail controls and announce the current position. Preserve meaningful alt text and do not make the overflow overlay the only accessible description.
- Scope the image list to the gallery that was opened. Other galleries in the same message retain their own ordering and surrounding context.
- A host owns the modal mount location and stacking policy. Explicit callbacks or composed events must support widgets in shadow roots and a separate-origin iframe. No implicit dependency on the website's global body listener.
- Close/dispose safely when the owning message is removed or navigation replaces it. Remove listeners, cancel obsolete work, and release temporary object URLs owned by the viewer.

## Sources, loading, and compatibility

- Support existing legacy APDS references, safe HTTP(S) Markdown images, and typed AndFS image attachments through explicit source adapters.
- Preserve image references, original message bytes, signatures, message IDs, and legacy availability behavior. No storage migration or rewritten signed YAML.
- A typed attachment without an authored body position appears in its established attachment location; gallery grouping must not relocate body images to join it.
- Avoid showing the same typed attachment twice when a body compatibility URL also identifies it. Deduplicate only with explicit attachment identity/source evidence; never drop intentional repeated Markdown images.
- Preserve the difference between a signed URL/reference and verified image bytes. Do not imply byte verification when only a remote URL has been loaded.
- Render thumbnails lazily, fetch full-size content on demand, and optionally preload only immediate viewer neighbors. Do not eagerly fetch every hidden full-size image in a large gallery.
- If a source has no thumbnail variant, use its existing image bytes; do not add transcoding or thumbnail infrastructure to this milestone.
- Show stable loading, unavailable, and retry states per occurrence. One failed image must not break the grid, renumber images, or prevent navigation to working ones.
- Reject unsafe source schemes and render captions/alt/title/link labels safely. Preserve the existing URL trust boundary.
- Async results must update the correct occurrence and be ignored after rerender/disposal.

## Implementation tickets

### G01 — Ordered body model and fixtures

- [x] Inventory actual website/embed Markdown, legacy source resolution, and typed attachment paths.
- [x] Define shared ordered text/image segments and deterministic grouping boundaries.
- [x] Fix mixed-paragraph image reordering as part of adopting this model.
- [x] Preserve existing supported formatting, hashtags, internal links, replies, and unavailable legacy captions.
- [x] Add fixtures for the placement examples above, including formatting around inline images and duplicate references.

Acceptance: parsing/grouping preserves authored semantic order without changing stored message bytes. Formatting regressions are caught before layout work.

### G02 — Shared gallery widget and responsive styling

- [x] Add an individually importable module, provisionally `client/ui/image-gallery.js`, with explicit image/source adapter inputs and an `onOpen` callback.
- [x] Implement count-based layout and the four-thumbnail overflow rule.
- [x] Handle loading/failure states, repeated occurrences, keyboard controls, and light/dark themes.
- [x] Use container-aware styles and avoid assumptions about full website width.
- [x] Imports must not boot Wiredove, create identity/storage, or register a service worker.

Acceptance: the same module handles 1, 2, 3, 4, 5, 10, and 30 images in narrow and wide message containers.

### G03 — Shared multi-image viewer

- [x] Extend `client/ui/image-popover.js` with a gallery list and selected index.
- [x] Implement navigation, position indicator, swipe handling, focus management, and cleanup.
- [x] Preserve tap-image-to-close, backdrop, Close button, and Escape.
- [x] Connect through explicit widget/host actions, including shadow-root instances.

Acceptance: every image in a ten-image gallery can be reached; opening/closing returns to the same message and scroll context.

### G04 — Website and embed integration

- [x] Wire the same body grouping/gallery/viewer modules into website messages and embedded messages.
- [x] Remove superseded image extraction/grouping and overlapping image-open handlers from migrated paths.
- [x] Cover full posts, nested replies, thread views, edited/rerendered messages, and multiple widgets on one page.
- [x] Update feature inventory and module documentation honestly about remaining shared-renderer work.
- [x] Bump the service-worker shell version and include any required new shell assets.

Acceptance: website and separate-origin embed render matching gallery groups and preserve text order for identical content. No claim of full shared-UI migration from this slice alone.

### G05 — Browser verification and release

- [x] Run focused parser/grouping and module import checks.
- [x] Inspect screenshots and interactions on desktop and mobile, light and dark themes.
- [x] Verify 240 px/320 px embed containers, mobile feed width, desktop posts, and nested replies.
- [x] Exercise all counts above, long text between galleries, mixed aspect ratios, screenshots, broken/slow sources, duplicate references, linked images, lists, quotations, and code.
- [x] Verify focus restoration, keyboard navigation, touch tap versus swipe, overflow counting, download/link controls, and close without immediate reopening.
- [x] Observe an actual separate-origin iframe embed; mocks alone do not establish cross-frame acceptance.
- [x] Check fresh loads and warm service-worker upgrades without clearing identity storage.
- [x] Record observed checks and limitations. Commit/push the reviewed change; follow the repository deployment procedure when deployment is authorized.

Use local fixtures and isolated test contexts. No public posting is necessary for gallery verification.

## First delivery and exclusions

First prove ordered text/image grouping and the one-to-four/overflow layouts in the shared gallery module. Then wire the viewer and both consumers before calling the gallery feature complete.

Do not include media storage changes, video/audio redesign, AI captions, image editing, uploads/reordering, masonry libraries, thumbnail services, or zoom/pan in this work order. Preserve existing browser image gestures where available. Those can have separate follow-up work if requested.

## Implementation and validation — 2026-10-21

Implemented:

- Shared ordered Markdown model/DOM renderer in `client/ui/body.js`, used by the
  website adapter and embedded messages; preserved prose/image order and nested
  container boundaries. Reused the website's pinned Marked lexer as a local vendor
  asset. Raw HTML is rendered as text rather than trusted markup.
- `client/ui/image-gallery.js` and its shared CSS provide bounded one-to-four
  layouts, overflow counts, lazy previews, per-occurrence loading/retry, and
  cancellation on disconnect. Single images use a contained, bounded frame to
  preserve the full picture and reserve layout space before loading.
- The shared native dialog supports position indicators, all-image navigation,
  mobile swipe, keyboard/focus behavior, tap-image/backdrop close, original-link
  actions, and lifecycle cleanup. Host callbacks work through shadow roots.
- Typed AndFS images use the gallery; explicit matching attachment URLs suppress
  attachment duplicates while repeated authored images remain separate occurrences.
- App shell cache advanced to `v9-image-galleries`, including the parser/gallery
  modules and stylesheet. No identity or signed-message format changes.

Observed verification:

- 17 focused Node checks passed across grouping, safe sources/cancellation, import
  boundaries, authenticated feed adapters, and existing profile route ordering.
- `tests/image-gallery.browser.cjs` passed with Chromium on desktop and emulated
  mobile, light/dark themes, 1/2/3/4/5/10/30-image runs, 240/320/660 px containers,
  actual website `render.content`, embedded message widgets, edited bodies,
  nested thread replies, duplicate legacy references, delayed source cancellation,
  broken sources, authored ordering, literal code, linked images, focus restoration,
  arrow keys, touch swipe/tap, and full viewer navigation. Screenshots were inspected.
- An actual separate-origin iframe exercised gallery opening, navigation and close.
- A warm service-worker cache upgrade removed the old shell cache, loaded the new
  renderer, and preserved a storage sentinel without clearing identity storage.
- The profile-links browser suite passed after its outdated signing mock, save
  button label and status selector were aligned with the current profile editor.
- Modified production JavaScript syntax and `git diff --check` passed.

Limits: browser verification uses local fixtures and mocked identity/transport;
there were no public posts, live media storage changes, Safari/device testing, or
production deployment. Website message shells/actions still have their existing
implementation; full S03 shared-widget migration is not claimed. Deployment remains
an explicit release step under `AGENTS.md`.
