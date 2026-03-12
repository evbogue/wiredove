# Onboarding Improvements Workorder

## Overview

Improve the onboarding flow for new Wiredove users — from first landing through keypair generation and first interaction. Focuses on reducing friction, removing jargon, and guiding users into the network.

## Work items

### OB-01: Replace full page reload after keypair generation
**File:** `identify.js:9-16`, `trending.js:88-94`, `navbar.js:157-161`
**Problem:** After generating a keypair, the app does `document.location.reload()` which causes a full page reload — white flash, re-init of APDS, re-fetch of trending posts. Breaks the feeling of a smooth flow.
**Action:** Instead of reloading, update the UI in-place: swap the "Generate Keypair" button for the avatar link in the navbar, replace the onboarding card with the post-keygen version, and set up the deferred network listener — all without a reload.

### OB-02: Replace "Generate Keypair" with non-technical label
**File:** `identify.js:17`
**Problem:** "Generate Keypair" is cryptography jargon. New users don't know what a keypair is.
**Action:** Change button text to "Create Identity" or "Get Started". Keep the technical detail for the tooltip/title attribute.

### OB-03: Make onboarding card copy actionable
**File:** `trending.js:89-93`
**Problem:** Welcome text is philosophical ("no accounts, no servers, no one in control") but doesn't tell users what they can do or what happens next.
**Action:** Rewrite to explain what the user is looking at (trending posts from the network) and what generating an identity lets them do (post, reply, follow people).

### OB-04: Add post-keygen guidance
**File:** `trending.js:88-94`, `identify.js:21-23`
**Problem:** After keypair generation, `identify()` returns an empty span. The onboarding card loses its CTA and offers no next step. User is just on trending with no guidance.
**Action:** Show a post-keygen onboarding card that nudges the user to: (1) set a name/avatar in settings, (2) reply to a post, (3) click a profile to follow someone. Can be dismissible.

### OB-05: Improve compose button behavior for anonymous users
**File:** `navbar.js:16-28`, `identify.js:91-118`
**Problem:** Pre-keygen, the compose button has a `disabled` class and clicking it flashes a notice for 3 seconds via `promptKeypair()`. Easy to miss.
**Action:** Make the notice more prominent — either inline the generate keypair CTA into the notice, or scroll/focus the user to the onboarding card's generate button.

### OB-06: Add context to trending page
**File:** `trending.js:96-118`
**Problem:** Trending shows posts with no explanation of what they are or where they come from.
**Action:** Add a brief subtitle or section header like "Popular posts from the network" above the post list.

### OB-07: Show connecting state when leaving trending
**File:** `app.js:114-127`
**Problem:** When user navigates from trending to home, `connect()` + `startSync()` fire silently. If slow, the home feed is empty with no explanation.
**Action:** Show a brief "Connecting to the network..." indicator while the connect promise resolves.

### OB-08: Improve empty home feed for new users
**File:** `route.js:166-183`
**Problem:** After keygen, `#` (home) is empty because the user doesn't follow anyone yet. Feels broken.
**Action:** Show an empty state message: "Your feed is empty. Follow people from Trending to see their posts here." with a link to `#trending`. Optionally auto-follow the seed pubkey.

---

## Priority order

1. **OB-01** — Page reload is the most jarring UX issue
2. **OB-02** — Trivial label change, big clarity win
3. **OB-03** + **OB-04** — Onboarding card rewrite (do together)
4. **OB-08** — Empty home feed is confusing
5. **OB-05** — Compose button edge case
6. **OB-06** — Nice-to-have context
7. **OB-07** — Nice-to-have loading state

## Not in scope
- Multi-step onboarding wizard (too heavy for this project's philosophy)
- Email/username registration (identity is a keypair, full stop)
- Automatic follow suggestions beyond seed pubkey
