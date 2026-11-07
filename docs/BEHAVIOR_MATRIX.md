# Behavior acceptance matrix

This table records bounded coverage, not full shared-application parity.
Evidence is Chromium automation at desktop/mobile widths, including separate-origin
mounts. Physical Safari/iOS/Android acceptance remains open. Accessibility changes
remain deferred at Ev's request. Agent fixtures are signed inputs to the same readers.

| Behavior | Website | Separate-origin application embed | Evidence / remaining gap |
| --- | --- | --- | --- |
| Profile statements, explicit empty bio/links | Covered | Covered | `tests/application-flow.browser.cjs`, `tests/profile-update.browser.cjs` |
| Post → thread → reply, reload | Covered | Covered | `tests/application-flow.browser.cjs` |
| Original name/photo retained after body edits | Covered by header regression | Same application path | `tests/image-gallery.browser.cjs`; full application edits in `tests/application-flow.browser.cjs` |
| Standalone widget body-edit history | Deferred | Deferred | Separate follow-up; grouping must preserve edit-hash navigation, search and flat record support; controls must work without an icon font |
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

Remaining work stays in the sole [shared application plan](../SHARED_UI_WORK_ORDER.md):

- Milestone 2: standalone-widget edit history, backup import, embed notification
  capability decision, remaining controls/services consolidation.
- Milestone 3: independent consumer pins/deployments and historical media inventory.
- Milestone 4: real-device/browser/format evidence and keyboard retry behavior.

The 2026-11-04 recovery result did not establish APDS byte restoration; that claim
was corrected on 2026-11-07. The earlier widget-history completion claim is withdrawn
from this PR while the feature is deferred. Detailed dated observations remain in
[the prior matrix](https://github.com/evbogue/wiredove/blob/074d28cd9a12b88ad0c38e592ec0cd073dee6d6e/docs/BEHAVIOR_MATRIX.md).
