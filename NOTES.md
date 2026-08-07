# Notes — Consignment Warehouse admin portal

Running log of judgement calls, deferrals and things to ask the backend for.

## Judgement calls

**The dev server runs on port 5173, not 3000.** The backend's CORS allowlist
only contains `http://localhost:3000` and `http://localhost:5173`, and 3000 is
the bidder-facing app. `npm run dev` and `npm run start` are pinned to 5173 so
the portal has a working origin alongside the consumer app. See "Backend
requests" — this should be a configured admin origin, not a borrowed one.

**Money parsing is strict rather than clever.** `MoneyInput` accepts digits with
a single `.` or `,` as the decimal separator and ignores spaces. Anything
ambiguous — two separators, more than two decimals — is rejected with a message
instead of guessed at. `"1,500"` in a South African locale could mean R1.50 or
R1 500; a silently misread amount is a real-money mistake, so the field asks
rather than assumes. Display uses `Intl.NumberFormat` with `en-ZA` and the
auction's `currency_code`.

**The clock is anchored continuously, not once at startup.** Every API response
carries a `Date` header, and `lib/format/clock.ts` folds each one in (corrected
by half the measured round trip) rather than sampling only at boot. Offsets
under two seconds are ignored as noise. A banner appears if the device clock is
more than a minute out.

**Countdowns read the clock through `useSyncExternalStore`.** The React Compiler
lint rules in this Next version reject `Date.now()` during render and
`setState` inside an effect, so `lib/ui/hooks.ts` exposes `useNow()` — a ticking
clock with a defined server snapshot. This also removes hydration mismatches.

**`Lots` and `Monitor` in the sidebar follow the current auction.** Neither has a
meaningful global route (there is no cross-auction lot endpoint), so they point
at whichever auction the operator is working inside and are disabled with an
explanation when there is none.

**Increment rules on the create form are applied after creation.** Rules can only
be attached to an auction that exists, so the create page collects them locally
and POSTs them once the auction is created. If a rule is rejected the auction is
still created and the operator is told which rule failed.

**Optimistic updates are limited to photo ordering and "make primary".** They are
frequent, reversible and carry no money. Everything that touches money, bids or
lot state (void, withdraw, accept reserve, cancel, publish, suspend) waits for
the server and shows the server's answer — an optimistic void that rolls back
would show the operator a price that was never true.

**Bulk selection exists but has no bulk actions.** The lots table supports
multi-select as M4 asks, and the toolbar says plainly that the backend has no
bulk endpoints yet rather than offering an action that would loop client-side.

**`--border-strong` was darkened from `#C7CAD1` to `#898C94`.** The specified
value gives 1.64:1 against white, well under the 3:1 WCAG 1.4.11 needs for an
input boundary. `--text-muted` was likewise darkened from `#6B7280` to `#5B6270`
so it clears 4.5:1 on the sunken surface as well as on white. Every other token
is as specified.

**Thumbnails and lot counts are fetched per row.** Neither `AuctionAdminOut` nor
`LotAdminSummaryOut` carries them. Both use long stale times, and thumbnail
fetching is capped at 60 lots per table.

**Photos use `<img>`, not `next/image`.** The object store's host is not known at
build time, so `images.remotePatterns` cannot be configured for it.

## Backend requests

1. **Add an admin origin to CORS.** Only `localhost:3000` and `localhost:5173`
   are allowed. The admin portal is squatting on the Vite default port because
   the bidder app owns 3000.
2. **Add `lot_count` to `AuctionAdminOut`.** The auctions list shows a lot count
   per row and currently fetches every auction's lots to get it.
3. **Add `primary_image_url` to `LotAdminSummaryOut`.** The lots table shows a
   thumbnail per row and currently fetches each lot's images.
4. **Add a cross-auction endpoint for lots needing a decision**, e.g.
   `GET /admin/lots?status=ended_reserve_not_met`. The decisions queue is the
   screen the whole design points at, and it is built by fanning out over every
   auction's lots.
5. **Include the leading bidder's handle on the lot shapes.** Both admin lot
   shapes expose `current_leader_user_id` but no handle, so the decisions queue
   fetches the top bid per row purely to show a name.
6. **`GET /admin/lots/{id}` omits `relisted_from_lot_id`** even though
   `LotAdminSummaryOut` carries it and the spec asks for a link back to the
   original. The lot screen reads it from the auction's lot list instead.
7. **`POST /ws/ticket` error responses carry no CORS headers.** A rate-limited
   or failed ticket mint reaches the browser as an opaque network failure, so
   the client cannot read `Retry-After` and treats it as "offline" (it backs off
   and recovers, but blindly).
8. **Document the `after_sequence` semantics on `subscribe`.** Sequences are
   per-lot but `subscribe` takes a single `after_sequence` for a batch of
   `lot_ids`. This client groups lots by their last-known sequence and sends one
   subscribe per group; a per-lot form would be unambiguous.
9. **The OTP endpoint is rate-limited per source address**, which makes scripted
   verification against a local backend slow. A local-only bypass would help.
10. **Consider a documented shape for the bid-too-low 422.** It is described as
   structured but not specified; the client parses it defensively.

## Deferred

- **Bulk lot actions.** No backend endpoints exist for them. Selection is wired
  up so the UI is ready when they do.
- **Editing an auction's slug.** The API accepts no slug change on PATCH, so the
  field is shown disabled with the reason.
- **Cursor pagination on bid history.** `GET /lots/{id}/bids` is cursor-based and
  the client reads `X-Next-Cursor` / `X-Has-More`, but the lot screen loads only
  the first 50 and says so rather than offering "load more". Deferred because
  nothing in the operator journey needs deeper history yet.
- **Superadmin role changes could not be exercised end to end.** The seeded
  admin (`+27820000001`) has role `admin`, and no superadmin account exists in
  the seed data. The control is correctly hidden for a plain admin, with an
  explanation; the change-role dialog itself has not been run against a real
  `POST /admin/users/{id}/role`.
- **`PATCH /auth/me`** (operator's own profile) is typed in `types/api.ts` but has
  no screen. Nothing in the milestones asked for one.
- **Voiding a bid from the monitor.** Void lives on the lot detail screen only;
  the monitor links through to it.

## Bugs found and fixed while walking the M10 journey

- **Type-to-confirm was impossible to satisfy for money values.** `Intl` renders
  ZAR with a narrow no-break space (`R 2 550,00`), which an operator cannot
  type. The comparison in `ConfirmDialog` now normalises whitespace on both
  sides; the digits still have to match exactly.
- **The shorten confirmation only fired when the auction was `live`.** A bid can
  land while an auction is still `scheduled`, and the backend wants
  `confirm_shorten` in that case too. It now fires whenever any lot has a bid.
- **"Opens in: closed" on a scheduled auction whose opening time had passed.**
  The header now counts down to the close once the opening time is behind us.
- **The top bar collided with itself at phone width.** The auction-context chip
  duplicates the page heading, so it now hides below `md`.
- **The activity feed timestamp was a sliced string** (`:56:33 GMT+2`). It uses a
  proper `HH:mm:ss` formatter now.
- **`/users/[userId]` was missing entirely.** The route file had been written to
  the wrong directory and the 404 only showed up when the journey opened a user.

## M10 journey result

Walked on 2026-08-08 against the backend on `localhost:8000` (Postgres, Valkey
and MinIO from `make dev`, seeded with `make seed`), portal on `localhost:5173`,
bidder app on `localhost:3000`.

| Step | Result |
| --- | --- |
| Log in as `+27820000001` / `0000` | **Pass.** Role `admin` loaded, console opened. |
| Create an auction | **Pass.** "Winter Estate Clearance"; slug auto-generated as `winter-estate-clearance`; one increment band (from R0, R50 steps) added and applied after creation. |
| Add three lots, one with a reserve | **Pass.** Form stayed open, cleared, refocused the title and listed all three. Lot 1 carried a R3 000 reserve. |
| Upload images to a lot | **Pass.** presign → `204` direct POST to MinIO → `201` confirm, with width/height read client-side. Verified visible in the bidder app at `localhost:3000`. |
| Publish | **Pass.** Readiness checklist showed all three checks green; auction moved to `scheduled` and its draft lots with it. |
| Bid from a second account | **Pass.** R1 200 on lot 1 from a freshly registered bidder. |
| Watch the monitor update live | **Pass.** The bid appeared in the activity feed and the lot row (amount, count, leader handle) over the WebSocket, with no reload. |
| Void a bid, confirm the leader recalculates | **Pass.** On the seeded rug lot: voided R2 550 from "Bidder 872072"; the lot fell to R2 050 and the leader became "Bidder 7b2953" — exactly what the confirmation predicted before the click. |
| Edit `ends_at`, confirm lots cascade | **Pass.** Extending returned `lots_rescheduled: 3`. Shortening it again — with a live bid on the auction — required the type-the-auction-name confirmation and sent `confirm_shorten: true`; returned `lots_rescheduled: 2`. |
| Withdraw a lot | **Pass** (no-bids branch). Lot 3 withdrawn with an operator-typed reason; actions collapsed to Relist. The with-bids branch of the copy was not exercised — no lot in the new auction had bids at that point. |
| Let a lot close below reserve | **Pass.** The auction closed and lot 1 landed in `ended_reserve_not_met` at R1 200 against a R3 000 reserve. |
| Accept the reserve from the decisions queue | **Pass.** The queue listed it with the R1 800 shortfall and the top bidder's handle, the sidebar badge read 1, the confirmation restated the shortfall, and accepting sold the lot and emptied the queue. |
| Relist an unsold lot | **Pass.** Lot 2 (`ended_unsold`) relisted into a draft auction as a fresh draft lot, with the "relisted from an earlier lot" link back to the original. |
| Find a user and suspend them | **Pass.** Found by partial phone (`0000002`), suspended with an operator-typed reason. |
| Confirm their session ends | **Pass.** `active_sessions` went from 19 to 0 while `bid_count`, `lots_bid_on` and `lots_currently_winning` were untouched — the bids stood, exactly as the confirmation said. Reactivated afterwards to leave the seed data usable. |

### Not verified

- **Superadmin role changes.** No superadmin exists in the seed data and the
  seeded admin is a plain `admin`, so `POST /admin/users/{id}/role` was never
  called. The control is correctly hidden with an explanation, and the 403/409
  paths are handled in code but untested against the live API.
- **The withdraw confirmation's with-bids wording.** Verified by reading, not by
  running it against a lot that had bids.
- **`resync_too_far` and the reconnect catch-up path.** The socket dropped and
  recovered once during the journey (a `ws/ticket` request failed CORS, the
  client backed off and reconnected cleanly), but no gap large enough to trigger
  `resync_too_far` occurred, so that branch is untested against the live server.
- **Anti-snipe extensions in the monitor.** No bid landed inside the anti-snipe
  window during the run, so `lot_extended` was never received. The handling and
  the visual call-out are implemented but unexercised.
