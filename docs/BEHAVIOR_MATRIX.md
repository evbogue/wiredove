# Wiredove behavior acceptance matrix

Created: 2026-11-04. Populated 2026-11-04 ~21:50 CST from current tests and
dated observations; only the checks needed to establish each claim were rerun.
Coordinates [CONSOLIDATION_WORK_ORDER.md](../CONSOLIDATION_WORK_ORDER.md) (section 3)
and the sole application plan [SHARED_UI_WORK_ORDER.md](../SHARED_UI_WORK_ORDER.md).
Agent-produced fixtures are signed input records consumed by the same shared
renderers, not a third UI implementation. These are current acceptance claims,
not claims that no other tests exist.

Status vocabulary: **Verified** (named assertion/command or dated observation),
**To verify**, **N/A** with a reason, **Deferred** with a reason.

## Evidence provenance — read every Verified cell through this

All evidence behind the Verified cells below is one of two classes, and
neither is physical-device evidence:

- **Chromium automation (Playwright)** at desktop and 390/320px viewports,
  light and dark — this is desktop emulation of mobile geometry, not a
  mobile browser.
- **Isolated live-site checks in that same emulated browser** — "live" in
  the evidence cells means live-site code served to the emulated browser,
  not a handset or a Safari run. The three cells that previously said
  "live 390px" without that qualifier are annotated accordingly below.

**Physical Safari/mobile evidence is a separate, currently empty class:**
no Verified cell rests on a real iOS/Android device or a real Safari run,
and no such evidence is claimed anywhere in this matrix. It is tracked
separately, per the unchecked item in
[SHARED_UI_WORK_ORDER.md](../SHARED_UI_WORK_ORDER.md) §4 Acceptance
("Track physical Safari/mobile recording/playback evidence separately; do not
substitute Chromium automation for device acceptance"), and stays open
until a real device run exists to record. The same audit was applied to
AGENTS.md (2026-11-04 ~23:45 CST): its dated release notes use the same
"live 390px" shorthand, now clarified by a provenance note in its Browser
testing section, with the two unqualified occurrences annotated in place;
the six "Isolated live 390px" occurrences are covered by that note.

**Accessibility stays deferred:** Ev deferred accessibility changes (AGENTS.md,
2026-11-01 release note; SHARED_UI_WORK_ORDER.md preservation scope). This
matrix adds no accessibility claim and does not reopen that scope. The
box-3 keyboard-retry note (focus drops to BODY after retry, so a second
keyboard retry needs a re-Tab) is an observed interaction fact, not
accessibility acceptance.

| Behavior | Website | Separate-origin full embed | Agent-produced fixture | Evidence / gap owner |
| --- | --- | --- | --- | --- |
| Name/photo-only profile; explicit empty bio/links | Verified | Verified | Verified (read contract) | `npm run test:browser` → `tests/application-flow.browser.cjs` requires `tests/profile-update.browser.cjs`: "Both mounts: empty-body name/photo, missing photo, empty bio and links-only profile updates passed". Dated 2026-11-04: profile-update cards release `837df34` deployed, isolated live-site checks in the emulated browser at 390px light/dark, no overflow/JS exceptions. Fresh pass 2026-11-04 ~21:50 CST: flow harness green with `WIREDOVE_TEST_RUNTIME=node` (assertion verified in run output). Fixture: section-2 set (metadata-only profiles, explicit empty bio/links) rendered from node B with A down, `select-node-b-browser.cjs` 2026-11-04 ~20:45. |
| Post → thread → reply; immediate reload | Verified | Verified | Verified (read contract) | `npm run test:browser` → `tests/application-flow.browser.cjs`: "Real website ↔ separate-origin embed: identity/profile, signed post, second-author thread/reply, reload, durable draft and exact outbox retry passed". Fresh pass 2026-11-04 ~21:50 CST: green with `WIREDOVE_TEST_RUNTIME=node`. Fixture: post + reply + edit records rendered from node B (`select-node-b-browser.cjs`). |
| Edit body, name/image metadata and version history | Verified (name/image snapshot semantics); Verified (shared-widget body-edit version history) | Verified (name/image snapshot semantics); Verified (shared-widget body-edit version history) | Verified (body-edit version history) | Name/image snapshot semantics (Ev, 2026-11-05): a post keeps the name/photo it was posted with; a new post carries the current profile. GitHub issue #3 ("edited posts not updating displayed name/image", closed 2026-10-23) assumed the opposite, so its framing is superseded — the shared widget keeping the old header was correct, and the legacy website path merging an edit's name/image into the original header was the defect. Fixed 2026-11-05: legacy `render.js` `refreshEdits` now applies only the original record's yaml (`applyProfile(contentHash, baseYaml)`), shell cache v36-edit-header. Browser check `edit-header-keeps-original-browser.cjs` (goal hidden_files): original keeps Old Name/old avatar, body updates to 'Edited body', no page errors; the same check fails on pre-fix code (header rewritten to New Name/new avatar). Shared-widget evidence stands: `issue3-shared-path-browser.cjs` (goal hidden_files). Profile edit/save/reload covered by `tests/profile-links.browser.cjs` (standalone, not in `test:browser`). Body-edit version history in the shared widget is implemented 2026-11-06: `client/ui/edit-history.js` groups same-author edits under their target, `client/ui/message-view.js` shows the latest body by default with the original header/media and an `edit:` hint plus version nav; verified by `tests/shared-message.browser.cjs` (edited body shown, header stays the original name, nav 2/2 → 1/2 → 2/2, edit record never a standalone row) in 1200/390/320px light/dark. |
| Inline upload at cursor and preview | Verified | Verified | N/A: authoring UI | `npm run test:browser` → `tests/image-upload.browser.cjs`: "cursor placement, live edits, selection, cancel/disposal, draft saving, verified preview and failure/retry passed". Fresh pass 2026-11-04 ~22:00 CST with `WIREDOVE_TEST_RUNTIME=node` (source + dist, light + dark). Dated 2026-11-01: composer image flow `cd7c09e` deployed, 390px live-site checks in the emulated browser (light/dark), image-flow regression in browser suite. |
| Profile original/crop and re-crop | Verified | Verified | Verified (read contract) | Dated 2026-11-01: shared profile/settings release `2992b9d` — "Real two-origin acceptance covers photo original/crop metadata/bytes, empty bio, history links, reload/re-crop"; 390px website/light + embed/dark screenshots reviewed. Fixture: `recrop-node-b-browser.cjs` 2026-11-04 ~20:55 — real shared `createProfileEditor` on node B received restored original bytes (70B, sha256 a86fc9c7b91d…, not the crop thumbnail). |
| Image pending, paused, unavailable, retry and arrival | Verified | Verified | Verified (read contract) | `npm run test:browser` → `tests/image-gallery.browser.cjs`: "Real queue: queued/requested/timeout/retry/arrival, thumbnail and viewer passed"; "Observed separate-origin iframe: shared gallery + viewer passed"; warm-SW upgrade preserves storage. Fresh pass 2026-11-04 ~22:00 CST with `WIREDOVE_TEST_RUNTIME=node` (desktop + mobile, light + dark, real queue, separate-origin iframe, warm-SW upgrade). Unit: `tests/network-image-status.test.js`, `tests/image-gallery.test.js`. Dated 2026-11-04: compact inline-image status, release `a25a0be`, 390px live-site checks in the emulated browser, retry-by-keyboard. Fixture: `missing-corrupt-block-browser.cjs` 2026-11-04 ~21:05 — missing chunk: "Image unavailable" + retry, no bytes assigned; corrupt chunk: server 404s, bytes never served or displayed; restored chunk: retry reassembled verified bytes; `records.json` sha256 unchanged. |
| Verified audio/video and legacy media | Verified | Verified | Verified (read contract) | `npm run test:browser` → `tests/application-flow.browser.cjs`: "Both mounts: hash-only attachment links, byte detection, verified playback and reload passed". Fresh pass 2026-11-04 ~21:50 CST: green with `WIREDOVE_TEST_RUNTIME=node`. Unit: `tests/andfs-media.test.js`, `tests/hash-media.test.js` ("file routes detect verified byte signatures, including audio containers"). Dated 2026-10-31: hash-route release `fcab6e8` (historical WebP through `#hash` route, 390px light/dark); legacy anblob compatibility release `f634698` — "Isolated actual serve.js GET/HEAD checks verified exact legacy bytes, length and CORS headers"; production `data/blobs` was empty so live stored legacy playback was not claimed. Fixture: APDS image, anblob audio, AndFS audio/video byte-verified on node B (`assert-recovery-integrity.mjs` 91/91, 2026-11-04 ~20:55). |
| Identity/draft recovery and exact signed retry | Verified (draft/retry); To verify (backup import) | Verified (draft/retry); To verify (backup import) | To verify | `npm run test:browser` → `tests/application-flow.browser.cjs`: "durable draft and exact outbox retry passed" on both mounts. Fresh pass 2026-11-04 ~21:50 CST: green with `WIREDOVE_TEST_RUNTIME=node`. Unit: `tests/service-session.test.js` ("serialized signing preserves a shared author chain and recovers after failure"; "pausing network delivery preserves exact queued bytes"). Identity backup import: no named harness — lessons exist in AGENTS.md ("Identity backups contain secret keys... test import in memory/isolated contexts") but no current acceptance run. |
| Notifications after persistence; failure isolation | Verified | To verify | N/A: adapter publishes no notifications | `npm run test:browser` → `tests/composer-notifications.browser.cjs`: "Composer notification flow: <scenario> passed". Fresh pass 2026-11-04 ~22:00 CST with `WIREDOVE_TEST_RUNTIME=node` (confirmed, unconfirmed, missing-content, missing-signature, ntfy-error, push-error). Unit: `tests/post-notifications.test.js` — broadcast awaits persistence; only confirmed/retrievable signature/content pairs notify; failures leave cursor retryable; notification failure does not turn a published post into a failed draft. Separate-origin embed: no named notification harness. |

## Gap → milestone mapping (box 5, done 2026-11-04 ~23:55 CST)

Every remaining gap below maps to an existing unchecked item in
[SHARED_UI_WORK_ORDER.md](../SHARED_UI_WORK_ORDER.md); no new milestone or
competing plan is created. No row is promoted to Verified by this mapping —
full parity is not claimed from the verified subset.

| Gap | Matrix status | Shared UI milestone (unchecked item) | Next concrete slice |
| --- | --- | --- | --- |
| Body-edit version history in the shared widget (name/image snapshot semantics now correct on both paths) | Row 3, closed 2026-11-06 | M2: "Finish acceptance and consolidation of reply/edit/text/image/audio/video/recording workflows…" and "Complete edit summaries/history, moderation/stubs…" | Done 2026-11-06: `client/ui/edit-history.js` + `message-view.js` version nav (latest body, original header/media, `edit:` hint); verified by `tests/shared-message.browser.cjs`. The edit-history slice of the M2 box is closed; moderation/stubs and the rest of that box remain open. |
| Identity backup import | Row 8, To verify | M2: "Complete identity import/export, settings, sync/delivery status and supported notifications." | Named isolated import harness: import a disposable backup in memory/isolated context, validate signing against the public key, reload — per the AGENTS.md backup lesson. Verification slice, no implementation change. |
| Embed-side notifications | Row 9, To verify | M2: same item — "supported notifications. Document browser/host capability restrictions per feature." | Capability decision first: embeds default notifications off and never register a service worker (M1 checkpoint) — either document the embed cell as N/A with that restriction, or build an embed notification harness mirroring `tests/composer-notifications.browser.cjs` on the separate-origin mount. Decision needed before a harness. |
| Physical-device evidence (empty class) | Provenance preamble; box 4 | M4: "Track physical Safari/mobile recording/playback evidence separately; do not substitute Chromium automation for device acceptance." | A real-device run (iOS/Android Safari) of the chosen flows; owner Ev/host operator. No implementation slice; stays open until a device run exists to record. |
| Legacy stored media on production (`data/blobs` empty) | Row 7 evidence; Known gaps | M4: "Test legacy APDS images/profile images and anblob audio/video alongside verified AndFS images/audio/video/profile photos, corrupt blocks and upload failures." M3: "Finish the remaining format/profile-photo matrix and verify the compatibility changes after site deployment." | Live stored-legacy playback check once production `data/blobs` is non-empty; blocked until a stored legacy blob exists on production. Related open M3 item: the 4 MiB historical-image limits. |
| Historical absolute references — no failover (observed §2 limit) | Known gaps; [SECOND_NODE_RECOVERY.md](SECOND_NODE_RECOVERY.md) | M4 legacy-media test item (same as above) + M3 format/profile-photo matrix | Explicit decision slice: document as a known reader limit, or design a configurable fallback-origin reader slice. No failover is claimed until that decision lands; history is never rewritten to make the test pass. |
| Keyboard-retry focus loss (focus drops to BODY after retry) | Box 3 note; row 6 evidence | M4: "Test desktop and 390/320px, light/dark, keyboard, focus, touch, denied permissions, unrelated host CSS/hash navigation, two instances, unmount/remount and route races." | Restore focus to the retry control after retry completes (shared gallery). Flagged: Ev to confirm whether focus restoration is in the deferred accessibility scope or a keyboard-interaction fix; do not build until that call is made. |

Accessibility stays deferred (AGENTS.md, 2026-11-01; SHARED_UI_WORK_ORDER.md
preservation scope) — no slice, not reopened by this mapping. The other
unchecked milestone items (community directory/discovery, bridge retirement,
static-host example, coordinated release acceptance) are tracked in
SHARED_UI_WORK_ORDER.md itself and are not matrix gaps.

## Remaining section-3 work (boxes 2–5 done)

- Box 2 (done 2026-11-04 ~22:07 CST; corrected 2026-11-05): issue #3's premise is superseded — snapshot semantics (Ev, 2026-11-05) say old posts keep their posted name/photo, so the shared widget keeping the old header was correct and the legacy website path merging the edit's name/image was the defect. Legacy `refreshEdits` fixed 2026-11-05 (verified by `edit-header-keeps-original-browser.cjs`, negative control fails on pre-fix code). Closed 2026-11-06: body-edit version history in the shared widget is implemented (`client/ui/edit-history.js` + `message-view.js` version nav), verified by `tests/shared-message.browser.cjs`. See row 3.
- Box 3 (done 2026-11-04 ~23:25 CST): desktop and 390/320px light/dark screenshots reviewed, keyboard retry + 320px covered, warm-SW upgrade preserves identity.
- Box 4 (done 2026-11-04 ~23:45 CST): provenance preamble added above
  and the three "live 390px" cells annotated as emulated-browser checks;
  AGENTS.md release notes audited — 2 unqualified "Live 390px" occurrences
  annotated in place, 6 "Isolated live 390px" occurrences covered by a new
  provenance note in its Browser testing section; physical-device class
  confirmed empty and cross-linked to the unchecked SHARED_UI_WORK_ORDER.md
  §4 item above; accessibility still deferred.
- Box 5 (done 2026-11-04 ~23:55 CST): gap → milestone mapping table added
  above; every remaining gap maps to an existing unchecked
  SHARED_UI_WORK_ORDER.md milestone item with a next concrete slice; no row
  promoted to Verified.

## Known gaps kept distinct

- Physical-device acceptance (real iOS/Android keyboard, Safari/mobile): not claimed; desktop emulation only (AGENTS.md records this).
- Legacy stored media on production: `data/blobs` was empty at the 2026-11-01 check; live stored legacy playback unproven.
- Historical absolute references fail over to nothing: observed 2026-11-04 (node B with node A down) — readers pin the dead origin, no failover; see [SECOND_NODE_RECOVERY.md](SECOND_NODE_RECOVERY.md).
