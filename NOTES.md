# Notes — Consignment Warehouse admin portal

Running log of judgement calls, deferrals and things to ask the backend for.

## Judgement calls

**The dev server runs on port 3100.** The backend's CORS allowlist is
`http://localhost:3000` for the bidder app and `http://localhost:3100` for this
portal, so both run against the same backend. `npm run dev` and `npm run start`
are pinned to 3100. This is now a dedicated admin origin rather than the
borrowed Vite port the portal used to sit on.

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

**The decisions queue is one call.** `GET /admin/lots?status=ended_reserve_not_met`
replaced iterating every auction's lots. The server returns them ordered by
closing time then lot number, so the screen does not re-sort, and paging is
`limit`/`offset`. The sidebar badge is its own small query so the count does not
depend on which page is open.

**The socket resumes with per-lot `after_sequences`.** Sequences are per lot, so
the scalar `after_sequence` is wrong for all but one lot of a batch. The client
used to work around that by grouping lots by their last-known sequence and
sending one subscribe per group, capped at 30 messages. It now sends the per-lot
map the backend added, which is both correct and fewer messages; the chunk size
dropped to 40 lot ids per message because the map repeats each id.

**The ledger UI has no edit or delete, by construction.** The backend ledger is
append-only, so a statement row offers exactly one corrective action: reverse.
That posts a matching opposite entry pointing at the original and leaves both on
the record, which is what makes the statement reconcilable against a bank
statement. If a future screen wants an "edit entry" affordance, the answer is a
reversal.

**No +/- control anywhere in the record form.** `amount_minor` goes to the API as
a positive magnitude and the backend derives the sign from `entry_type`, so the
form collects a positive amount and shows the direction as a consequence of the
type chosen ("Adds credit" / "Takes credit off", rendered as a disabled field).
`adjustment` is the one type with no inherent direction, so it - and only it -
turns that into a required choice; sending `direction` on any other type is
refused by the backend, so it is omitted rather than defaulted.

**Balances are stated as sentences, not signed integers.** "R2 000,00 owing" and
"R10 000,00 in credit" rather than `-200000`. An operator scanning a list under
time pressure is one misread minus sign away from chasing the wrong person.
`amount_minor` comes back SIGNED from the API (confirmed against the running
backend: a deposit returns +100000, a refund -20000), so the statement splits it
into Charge and Credit columns rather than printing a signed number.

**Participants are a query, not a roster.** The list is computed on read, so
there is no registration, no approval step, and deliberately no "approve"
button - eligibility follows from the balance. The screen defaults to the
ineligible filter because that is the working list: the people to chase. Every
row links to that person's ledger, so recording the deposit that makes them
eligible is one hop.

**The buyer's premium is entered as a percentage and stored as basis points.**
The operator types 12.5 and the field says "Stored as 1250 basis points"
underneath. Echoing the stored value is the point: a rate that quietly means a
hundredth of what someone intended surfaces on an invoice, not in the form.

**The cover image lives outside the edit form.** `image_url` is deliberately not
a frozen field — an auction keeps its name, description and image editable once
bidding starts — but the edit form is where the freezing rules live, so keeping
the image there risked it being caught by them. Moving it to its own control
also removes a real hazard: the form held `image_url` in its draft state, so
saving an unrelated field after an upload would have written a stale URL back
over the uploaded image.

**Upload and URL are presented as peers, not as a primary and a fallback.** The
two options sit side by side with the same weight. The only difference stated is
the consequence — an external link can break and take the image with it, an
uploaded file cannot — rather than implying one is the proper way. `image_storage_key`
is used solely to tell the two apart and is never rendered.

**On the create form a chosen file disables the URL field.** There is one image
and it comes from one place; letting both be set would mean guessing which the
operator meant.

**A failed cover image never costs you the auction.** Presign is scoped to an
auction that exists, so the create form defers the upload until after creation —
the same shape as the increment rules below. If that upload fails the auction
still exists and the operator is told the image did not attach, with the detail
screen ready to retry.

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

**Lot counts and thumbnails come straight off the list payloads.**
`AuctionAdminOut.lot_count` and `LotAdminSummaryOut.primary_image_url` removed
the two per-row fan-outs the portal used to do, along with the 60-lot thumbnail
cap that existed to bound them. The auctions screen is now two requests (the
list, plus the decisions badge count) regardless of how many auctions exist.

**Photos use `<img>`, not `next/image`.** The object store's host is not known at
build time, so `images.remotePatterns` cannot be configured for it.

## Backend requests

### Resolved — the portal now uses these

Requests 1–6 and 8 from the previous round have all landed and the workarounds
they existed for are gone:

1. A dedicated admin CORS origin (`http://localhost:3100`).
2. `AuctionAdminOut.lot_count`.
3. `LotAdminSummaryOut.primary_image_url`.
4. `GET /admin/lots?status=&auction_id=&limit=&offset=`, ordered by
   `effective_ends_at` then `lot_number`.
5. `current_leader_handle` on both admin lot shapes.
6. `relisted_from_lot_id` on `LotAdminOut`.
7. `after_sequences` (per-lot map) on `subscribe`.

### Still open

1. **The two ADMIN paged endpoints do not send `X-Has-More`.** Specifically
   `GET /admin/users/{id}/ledger` and `GET /admin/auctions/{id}/participants`.
   The bidder-facing `GET /me/account` does set it (`app/api/v1/account.py:40`,
   `"true" if len(rows) == limit else "false"`), as does `GET /lots/{id}/bids` —
   so this is an inconsistency between the admin and account surfaces rather
   than a missing feature. Both admin clients read the header when present and
   otherwise fall back to "a full page means there may be more", which
   over-reports a next page when the count is an exact multiple of the page
   size. Lifting the one line from `account.py` into the two admin handlers
   would close it.

2. **The OTP endpoint is rate-limited per source address and per phone.** With
   only two admin accounts in the seed it is possible to lock yourself out of
   the console for an hour, which has cost real time in several verification
   runs. A local-only bypass, or a higher limit while `APP_ENV=local`, would
   help.

### Reported and fixed upstream during this round

**`POST /admin/auctions` accepted `deposit_amount_minor` and
`buyers_premium_bps` and then silently dropped them.** Both were declared on
`AuctionCreateIn` and validated, but the handler built its `Auction(...)` by
listing columns by hand and never passed those two, so every auction was
created with a zero deposit and a zero premium no matter what was sent. It
reproduced with a bare `curl` as readily as through the form, which is what
ruled the portal out as the cause. A new auction therefore gated nobody and
charged no premium, and nothing said so until money was involved.

The backend now builds the row from the payload's own fields
(`app/api/v1/admin_auctions.py`), with a contract test asserting the round
trip. Verified against the running API: a single POST from the create form now
comes back with `deposit_amount_minor: 125050` and `buyers_premium_bps: 1250`.
The portal briefly carried a follow-up `PATCH` to work around it; that has been
removed rather than left in as a permanent second request.

The lesson for this repo is in the verification list, not the code: the bug was
invisible to every check that trusted the form's own state, and showed up the
moment the value was read back from the API after saving.

### Corrected — the CORS-on-errors report was wrong

The previous round claimed `POST /ws/ticket` error responses carry no CORS
headers. **That was investigated and does not reproduce.** Handled errors,
including 429, do carry CORS headers, because `ExceptionMiddleware` sits inside
`CORSMiddleware` — a 401 from `/admin/auctions` was confirmed in this round to
come back with `access-control-allow-origin` intact.

What was almost certainly being hit is a **preflight from an origin outside the
allowlist**, which returns a bare `400` with no CORS headers and surfaces in the
browser as an opaque network failure — indistinguishable from the API being
down. The portal was on Vite's 5173 at the time and could fall back to 5174 if
another Vite process had taken it, silently putting it outside the allowlist.
Moving to the dedicated 3100 origin removes the cause. Worth knowing, because
the symptom points at the wrong thing: it looks like the backend is unreachable
when in fact the origin is simply not on the list.

## Deferred

- **Bulk lot actions.** No backend endpoints exist for them. Selection is wired
  up so the UI is ready when they do.
- **Editing an auction's slug.** The API accepts no slug change on PATCH, so the
  field is shown disabled with the reason.
- **Cursor pagination on bid history.** `GET /lots/{id}/bids` is cursor-based and
  the client reads `X-Next-Cursor` / `X-Has-More`, but the lot screen loads only
  the first 50 and says so rather than offering "load more". Deferred because
  nothing in the operator journey needs deeper history yet.
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

## Bugs found and fixed in the second round

- **The `resync_too_far` fallback was silent and could be overridden.** Both
  described under "Second-round verification" below.
- **The 409 message was padded with boilerplate.** The users screen appended
  "you cannot act on your own account, and the last active superadmin cannot be
  suspended or demoted" to every 409, which read as a contradiction next to the
  server's already-specific "the last active superadmin cannot be suspended".
  The server's message is now passed through as-is.

## M10 journey result

Walked on 2026-08-08 against the backend on `localhost:8000` (Postgres, Valkey
and MinIO from `make dev`, seeded with `make seed`), portal on `localhost:5173`
(the port the portal used before the backend added a dedicated admin origin),
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

### Previously not verified — all four now closed

The four gaps left open after the first round were closed on 2026-08-10 against
the backend with the lifecycle worker running and fresh seed data. See the
section below.

## Second-round verification (2026-08-10)

Backend on `localhost:8000` with the lifecycle worker up, freshly seeded; portal
on `localhost:3100`.

**Superadmin role change — pass.** Signed in as `+27820000000` (Nomsa Khumalo,
superadmin). The change-role control appears for a superadmin and is hidden with
an explanation for a plain admin — confirmed in both directions in one session,
because demoting the signed-in operator mid-run made the control disappear
without a reload of the app. A real `POST /admin/users/{id}/role` promoted
Ayanda to superadmin and later returned her to admin.

**409 guard — own role: pass.** `POST /admin/users/{id}/role` targeting the
caller returns `409 {"detail": "an admin cannot change their own role"}`. The UI
hides the control on your own account before the request is ever made, so this
was confirmed directly against the API.

**409 guard — last active superadmin: pass, via suspend.** Worth recording
precisely, because the guard is **not reachable through the role endpoint**:
with exactly one superadmin left, the only account that could demote them is
their own, and the self-change guard fires first. It is reachable through
suspend — an admin suspending the last active superadmin gets
`409 {"detail": "the last active superadmin cannot be suspended"}`. Exercised
through the UI; the message is shown inline in the dialog and the account is
left untouched.

**Withdraw with bids — pass.** A bid was placed on lot 5 from a seeded bidder,
then the lot was withdrawn. The dialog stated "It already has 1 bid, currently
at R 450,00. That bid history stands as a record, automatic bids are
deactivated, and everyone watching this lot is notified that it was withdrawn."
After withdrawal the lot reads `Withdrawn` and the bid row is still present and
still `Active`.

**Anti-snipe `lot_extended` — pass.** A lot's `effective_ends_at` was pulled to
150 s away (inside the 300 s anti-snipe window) and a bid placed. The API
answered `extended: true`. In the monitor, which was open throughout, the
countdown jumped from `2m 18s` to `4m 56s`, the extensions column went to `+1`,
and the activity feed gained a second entry, "Anti-snipe extension — the clock
moved". The feed is the proof this came from the socket: it is built only from
WebSocket events and the 20-second REST poll never writes to it.

**`resync_too_far` — pass, and it found a bug.** Forced by lowering
`WS_RESYNC_MAX_EVENTS` to 0 locally (restored to 200 afterwards), dropping the
socket, and landing a bid the client could not see. The exact server frame was
also captured directly with a throwaway WebSocket client:

```
{"type": "resync_too_far", "lot_id": "...", "latest_sequence": 2,
 "effective_ends_at": "...", "status": "live", "current_bid_minor": 255000}
```

The client falls back to a REST refetch rather than rendering a gap. Two real
problems surfaced and are fixed:

- The fallback was **silent**. `lastError` was only rendered while the socket
  was disconnected, so a gap filled while the connection was otherwise healthy
  told the operator nothing. The monitor now shows a short-lived notice saying
  the figures were reloaded from the API.
- The refetch was **overridden by a stale overlay**. The socket overlay takes
  precedence over the REST snapshot, so after a gap the bid *count* updated but
  the *price* stayed at the last value the socket had seen — R3 050 on screen
  against R4 050 on the server. The overlay is now cleared when a gap forces a
  refetch, which is exactly the case it must not win. Re-tested: after a missed
  bid the monitor showed R8 250,00 / 10 bids, matching the server exactly.

## Ledger, participants and auction money — verification (2026-08-12)

Run against the live backend, every result read back from the API rather than
from the form that produced it.

- **Deposit and premium on both forms.** Create: a single POST comes back
  `125050` / `1250`. Edit: changing them to `300000` / `750` reads back
  unchanged. The create path is what surfaced the dropped-field bug above.
- **A deposit moves the balance.** R 0,01 against a bidder sitting one cent
  short took him from `R 4 999,99 in credit` to `R 5 000,00`, statement and
  balance panel agreeing.
- **A reversal restores it, and both entries stay.** The correction posts as
  `Correction` with the reason inline; the balance returns to `R 4 999,99`.
- **A second reversal is refused clearly.** The API 409s instantly, and the
  dialog says *"That entry has already been reversed. Reload the statement to
  see the existing correction."* — not a generic failure. The row that has been
  reversed now reads `Reversed` instead of offering the button, derived from the
  `reverses_entry_id` on the correction; the 409 stays handled because an older
  entry's correction can sit on a page that is not loaded.
- **Adjustments both ways, direction enforced.** `+R 10,00` then `−R 4,00` left
  `R 5 005,99`. Submitting an adjustment with no direction is refused before it
  is sent. The API independently refuses `direction` on `deposit`, `payment` and
  `refund` (422) and requires it on `adjustment` — matching what the form does.
- **A negative amount cannot be entered.** `-50` is rejected at the input with
  *"Amount cannot be negative"*, and pressing the button anyway posts nothing.
- **Eligibility follows the balance with no approval step.** The ineligible list
  went from 12 to 11 the moment that cent was recorded, and the bidder moved to
  `Can bid: Yes` at exactly the threshold. Eligible-who-has-bid, eligible-never-
  bid and ineligible rows all render correctly.
- **Deposit and premium freeze once a lot has a bid**, with the reason shown on
  each field.
- **The frozen-field 409 works as a backstop.** Verified by racing it properly:
  the edit form was opened while an auction had no bids, a real bid was then
  placed through the bidder API, and the save was refused by the server. Both
  fields were exercised this way. The message is now phrased with the field's
  on-screen name — *"Buyer's premium cannot be changed once bidding has
  started"* — rather than echoing the column name back at the operator.

Two display bugs were found and fixed in the process: the effect preview
lowercased the whole sentence and turned `R 5 000,00` into `r 5 000,00`, and the
frozen-field toast printed `deposit_amount_minor` twice.

**On the environment:** the database was reseeded by another session partway
through this run (20:17 UTC), which wiped the fixtures and killed the browser
session — the same cause identified for the earlier "unknown refresh token"
deaths. Every result above was either observed before that point or re-run
after it against the new seed.

### Still not verified

- **Two lots closing simultaneously in the monitor.** `lot_closed` handling is
  exercised by single lots only.
- **The 200-lot subscription cap.** No auction here is that large, so the
  "subscribe to what is visible, poll the rest" path is still untested against a
  real oversized auction.
