# Behavior acceptance matrix

This table records bounded coverage, not full shared-application parity.
Evidence is Chromium automation at desktop/mobile widths, including separate-origin
mounts. Physical Safari/iOS/Android acceptance remains open. Accessibility changes
remain deferred at Ev's request. Agent fixtures are signed inputs to the same readers.

| Behavior | Website | Separate-origin application embed | Evidence / remaining gap |
| --- | --- | --- | --- |
| Profile statements, explicit empty bio/links | Covered | Covered | `tests/application-flow.browser.cjs`, `tests/profile-update.browser.cjs` |
| Post → thread → reply, reload | Covered | Covered | `tests/application-flow.browser.cjs` |
| Original name/photo retained after body edits | Covered | Covered | `tests/image-gallery.browser.cjs` checks conflicting edit metadata; `tests/application-parity.cjs` asserts unchanged headers after edits and version navigation in both full mounts |
| Standalone widget body-edit history | Deferred | Deferred | Excluded from this branch; requirements stay in the shared application plan |
| Inline upload at cursor, preview, cancel | Covered | Covered | `tests/image-upload.browser.cjs` |
| Profile original/crop/re-crop | Covered | Covered | `tests/application-flow.browser.cjs` |
| Image pending/paused/retry/arrival | Covered | Covered | `tests/image-gallery.browser.cjs`, `tests/network-image-status.test.js`; keyboard retry focus loss remains open |
| Verified AndFS and legacy reads | Covered fixtures | Covered fixtures | `tests/andfs-media.test.js`, `tests/application-flow.browser.cjs`; production legacy availability and broader format/device matrix remain open |
| Recovery with A offline | Stored bytes verified | APDS reader/gallery verified in iframe | `tests/recovery.test.js`, `tests/recovery.browser.cjs`; see [recovery limits](SECOND_NODE_RECOVERY.md) |
| Draft and exact signed retry | Covered | Covered | `tests/application-flow.browser.cjs`, `tests/service-session.test.js`; identity backup-import acceptance remains open |
| Notification failure isolation | Covered | Unverified | `tests/composer-notifications.browser.cjs`; embed capability/acceptance remains open |

Run `WIREDOVE_TEST_RUNTIME=node npm run test:browser` for current browser checks,
plus `npm test`, `npm run test:media` and `npm run test:server`. Coverage listed
above names assertions; it is not a claim that production runs this source.

Remaining implementation and acceptance work is tracked in the sole
[shared application plan](../SHARED_UI_WORK_ORDER.md). Recovery evidence and its
historical correction live in the [recovery guide](SECOND_NODE_RECOVERY.md);
deployment status lives in the [release record](RELEASE_RECORD.md).
