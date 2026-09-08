# Simplification: admin portal

Read `CLAUDE.md`, `AGENTS.md` and `NOTES.md` first. Do not create a git commit.

**Run this after the backend prompt has landed** — Tasks 2 and 3 depend on API changes.
It can run in parallel with the web app's prompt; they touch different repos and share
nothing.

## Context

The first live stakeholder session gave the admin portal almost no feedback — it works.
Three small changes only. **Do not redesign anything.** The lot filter in particular was
called out as already correct; leave it alone.

## Task 1 — never crop an image

Wide images are being cropped to fit their container, cutting off the sides or the top and
bottom. A landscape photo taken on a phone — which is most of them — loses content, and the
operator cannot tell what a bidder will actually see.

**Never crop. Letterbox instead**: fit the whole image inside its box and fill the remaining
space with black. `object-fit: contain` on a black background, rather than `cover`.

Apply it everywhere an operator looks at a lot or auction image in this portal: the lot
image gallery, the upload previews in both create forms, the auction cover image control,
and any thumbnail large enough for the crop to matter.

Two things to get right:

- **The container keeps its dimensions.** Letterboxing changes what fills the box, not how
  much space the box takes. A row that grows because someone uploaded a tall photo would
  make the table ragged, and this portal is deliberately dense.
- **Black, not the theme background.** Photographic content reads against black; a theme-
  coloured band looks like a layout bug and changes between light and dark mode. Add a token
  if you need one rather than hardcoding a hex — `CLAUDE.md` is explicit that nothing
  hardcodes a colour.

Say which surfaces you changed and whether any were left cropped deliberately.

## Task 2 — auctions default to public

The backend now defaults `visibility` to `public`. Match it in the create form: **public is
preselected, private is the explicit choice.**

Do not change the visibility control itself, its placement outside `AuctionEditForm`, the
dialog on taking a live auction private, or the globe marker on the list. Those were built
deliberately and none of them is affected by which value is preselected.

The panel's explanatory copy may need a look — it was written when private was the default,
so it may now describe the unusual case as though it were the normal one.

## Task 3 — the photo cap

The API now enforces a maximum of 20 images per lot and exposes the count and the cap.

Show it: **"7 of 20"** or equivalent, near the upload control, so an operator knows where
they stand before they hit the limit. Disable or hide the add-photo affordance at the cap
rather than letting them select files that will be refused.

**Still handle the API's refusal.** The client-side count is a convenience; the server is
the authority, and two operators working the same lot can both believe there is room. The
storage-vs-API error distinction in `useDirectUpload` already exists — a cap refusal is an
API error, not a storage one, and should read differently from "the bytes never landed".

## What is explicitly NOT changing

Named because the web app is being reduced substantially at the same time, and the
temptation will be to bring some of it here:

- The lot filter, the decisions queue, the ledger, the statement, participants, outstanding.
- Density, row heights, type sizes. Light-first. `StatusBadge` as the single status→colour
  map.
- **The admin portal keeps its own palette.** The bidder app is moving to the logo's gold;
  this portal is a dense operator console and is not part of that change. If you find
  yourself editing `app/globals.css` beyond adding a letterbox token, stop and ask.
- Swipes are being removed from the bidder app. The admin portal never showed swipe data, so
  nothing here should change — **confirm that by looking** rather than assuming, and report
  anything that did depend on it.

## Verification

- `npm run typecheck` and `npm run lint` — the React Compiler rules are errors here.
- **Drive it against the running backend**, on **port 3100**. Any other port and every
  preflight fails as an opaque browser network error.
- Upload a genuinely wide landscape photo and a tall portrait one to the same lot, and
  confirm both are shown whole, with black bands, and that neither changes the row height.
- Create an auction and confirm public is preselected and round-trips.
- Add images up to the cap and confirm the count reads correctly, the control disables, and
  a forced request past the cap surfaces the API's error rather than a generic one.
- Both themes.

## Ground rules

- **Do not create a git commit.**
- No new dependencies, no component library.
- Do not touch the lot filter, the ledger, or anything not named above.
- No hardcoded colours — add a token in both themes and measure it if it is new.
