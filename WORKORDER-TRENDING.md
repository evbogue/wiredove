# Trending Feature Workorder

## Overview

Add `#trending` as a first-class route that surfaces the most engaging posts across the network. Serves as both the discovery mechanism for established users and the onboarding landing page for new users.

## User flows

**Anonymous visitor:**
`#` → welcome card + trending posts → generate keypair → `#trending` (can now interact) → browse/reply → click Home when ready

**New user (just generated keypair):**
`#trending` → browse, click profiles (triggers sync), reply → Home feed populates organically

**Established user:**
`#trending` (via navbar) → discover new conversations and authors → click Home to return to their feed

---

## Work items

### T-01: Rename `welcome.js` → `trending.js`, export `trendingPanel()`
**Problem:** `welcome.js` and `welcomePanel()` describe the onboarding state, not the feature. The ranking logic already does what trending needs.
**Action:**
- Rename file to `trending.js`
- Rename export to `trendingPanel()`
- Split the welcome card out — the intro card with "Generate Keypair" is onboarding UI, not part of trending
- `trendingPanel()` should only return the ranked posts
- Update imports in `route.js`

### T-02: Create the `#trending` route
**File:** `route.js`
**Action:**
- Add `if (src === 'trending')` route handler
- If user has a keypair: render `trendingPanel()` directly
- If no keypair: render welcome card (intro + generate keypair CTA) above `trendingPanel()`
- Remove the `#preview` route (replaced by `#trending`)

### T-03: Update home route to redirect anonymous users to `#trending`
**File:** `route.js`
**Action:**
- When `#` loads and there's no keypair, redirect to `#trending` instead of rendering the welcome panel inline
- This makes `#trending` the canonical entry point for all anonymous visitors
- Home route (`#`) stays clean — it only ever shows your feed

### T-04: Update keypair generation to redirect to `#trending`
**File:** `identify.js`
**Action:**
- Change `window.location.hash = '#preview'` → `'#trending'`
- Both save paths (vanity match and short-name fallback)

### T-05: Add trending link to navbar
**File:** `navbar.js`
**Action:**
- Add a trending icon link next to the compose button in `navbar-left`
- Use Material Symbol `Local_Fire_Department` or `Trending_Up`
- `href="#trending"`, `title="Trending"`, `aria-label="Trending posts"`
- Always visible (works for both anonymous and logged-in users)

### T-06: Update `app.js` network gate for `#trending`
**File:** `app.js`
**Action:**
- Replace `isPreview` check with `isTrending` (`window.location.hash === '#trending'`)
- Same deferred connect+sync logic: start network when user navigates away from `#trending`
- Anonymous users still skip connect+sync entirely (no keypair gate unchanged)

### T-07: Remove "Go to your feed →" from trending, replace with organic navigation
**File:** `trending.js` (formerly `welcome.js`)
**Action:**
- Remove the "Go to your feed" link from the panel — the navbar Home link handles this
- Trending is a destination, not a transition step
- Posts on trending are fully interactive (reply, view profile) for users with a keypair

### T-08: Clean up dead code
**Action:**
- Delete `#preview` route from `route.js`
- Remove `welcomePanel` references
- Remove the `welcome-card` and `welcome-container` CSS classes (if no longer used)
- Keep `welcome-card` styling if we reuse it for the onboarding card on `#trending`

---

## File summary

| File | Change |
|------|--------|
| `welcome.js` → `trending.js` | Rename, split onboarding card from trending logic |
| `route.js` | Add `#trending` route, redirect anonymous `#` → `#trending`, remove `#preview` |
| `identify.js` | `#preview` → `#trending` redirect |
| `navbar.js` | Add trending icon link |
| `app.js` | `isPreview` → `isTrending` |
| `style.css` | Rename/adjust CSS classes if needed |

## Not in scope
- Caching `/all` responses (can add later if the fetch is slow)
- Pagination of trending results (10 posts is enough for now)
- Separate trending algorithm tuning (current reply count + recency is fine)
- Trending as default home for logged-in users (Home stays as their personal feed)
