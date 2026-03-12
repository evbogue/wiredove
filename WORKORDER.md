# Wiredove UX Workorder

## P0 — Critical / Quick Wins

### WO-01: Add confirmation dialog to "Delete everything" ✅
**Status:** Done (commit 5e4b04f)
Added `confirm()` guards to both "Delete everything" and "Delete key" buttons.

### WO-02: Remove `outline: none !important` from focus styles ✅
**Status:** Done (commit c0d5e46)
Replaced with `:focus-visible` ring on inputs, buttons, and links. Dark mode variant included.

### WO-03: Add `title` / `aria-label` attributes to all navbar icons ✅
**Status:** Done (commit d4d3f7d)
All navbar icons now have tooltips and accessible names.

### WO-04: Add confirmation to "Push everything" / "Pull everything" ✅
**Status:** Done (commit 815517a)
Moved push/pull into a collapsed "Advanced" `<details>` section instead.

---

## P1 — High Impact

### WO-05: Add empty state / welcome screen → Trending feature ✅
**Status:** Done — evolved into full `#trending` route (see WORKORDER-TRENDING.md, all T-01 through T-08 complete)
- `#trending` is a first-class route with engagement-ranked posts from the network
- Anonymous users redirect from `#` → `#trending`, see onboarding card + trending posts
- Seed pubkey pinned to top, posts scored by reply count + recency
- Navbar has trending icon, network sync deferred until leaving `#trending`
- Files: `trending.js` (new), `route.js`, `app.js`, `identify.js`, `navbar.js`, `style.css`, `sw.js`

### WO-06: Add loading indicator to feed ✅
**Status:** Done (commit 17df29f)
Pulsing "Loading" indicator in feed panels during async data fetches. Covers home, author, alias, and search routes.

### WO-07: Fix keypair generation UX ✅
**Status:** Done (commit c7b54c0)
Simplified keypair generation to instant create+save. Vanity keygen moved to Advanced section in settings.

### WO-08: Allow direct publish without preview step
**File:** `composer.js:567-593`
**Problem:** Users must click Preview then Publish. Non-standard two-step flow.
**Action:** Move Publish button into the main composer view alongside Preview.

### WO-09: Improve dark mode message contrast
**File:** `style.css:497-498`
**Problem:** Message bg vs page bg contrast ratio ~1.2:1. Messages blend into background.
**Action:** Bump message bg to `#2a2a2a`, border to `#333`, or add subtle box-shadow.

---

## P2 — Medium Impact

### WO-10: Make search input more discoverable
**File:** `navbar.js:29-40`, `style.css`
**Problem:** Search input is 75px, no icon, styled with icon font class.
**Action:** Add search icon prefix, expand on focus, remove icon font class from input.

### WO-11: Fix global `img { width: 95% }` rule
**File:** `style.css:285`
**Problem:** Every `<img>` defaults to 95% width, requiring overrides.
**Action:** Scope to `.message-body img` only.

### WO-12: Fix fade-in animation applying to all message children
**File:** `style.css:568-575`
**Problem:** `.message > *` independently fades in, causing staggered flickering.
**Action:** Remove `.message > *` from the animation rule.

### WO-13: Show readable reply context in composer
**File:** `composer.js:50-59`
**Problem:** Reply context shows truncated hashes instead of names/content.
**Action:** Show author display name and longer body preview.

### WO-14: Add absolute timestamp on hover
**File:** `render.js`, `style.css`
**Problem:** Relative timestamps with no way to see exact date/time.
**Action:** Add `title` attribute with full date to timestamp elements.

### WO-15: Group settings into collapsible sections
**File:** `settings.js:382-411`
**Problem:** Settings is a flat list separated by `<hr>`.
**Action:** Wrap sections in `<details><summary>` elements.

### WO-16: Increase mobile touch target sizes
**File:** `style.css`
**Problem:** Many interactive elements below 44x44px minimum.
**Action:** Add min-width/min-height to navbar icons and publish dot.

---

## P3 — Polish

### WO-17: Add image upload preview and progress
**File:** `upload.js`
**Action:** Show thumbnail preview after upload, progress indicator during hash creation.

### WO-18: Add breadcrumb / back navigation
**File:** `route.js`, `navbar.js`
**Action:** Show back arrow or breadcrumb on non-home routes.

### WO-19: Improve "new posts" banner visibility
**File:** `style.css:471-484`
**Action:** More prominent color, entrance animation, count badge.

### WO-20: Add sync activity indicator
**File:** `sync.js`, `navbar.js`
**Action:** Subtle animated indicator when sync is active.

### WO-21: Reduce preview-to-render layout shift
**File:** `render.js`
**Action:** Match preview node layout to final rendered message structure.

### WO-22: Cap reply nesting depth visually
**File:** `style.css`, `reply_renderer.js`
**Action:** Cap indentation at 3-4 levels, flatten deeper replies with "replying to" prefix.

### WO-23: Add character count to composer
**File:** `composer.js`
**Action:** Show character count below textarea, update on input.
