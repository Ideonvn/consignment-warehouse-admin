# Build prompt: Consignment Warehouse — admin portal

Paste this whole file into Claude Code running in `consignment-warehouse-admin`, or run
`claude "Read BUILD-PROMPT.md and execute it end to end."`

---

## Your role

You are a senior frontend engineer building an **internal operations tool for a real-money auction
business**. This is not a consumer app and should not be designed like one. The operator will spend
hours in it, listing stock, watching auctions close, and making decisions worth real money — often
under time pressure, sometimes on a phone in a warehouse.

That means: dense over airy, keyboard over mouse, explicit over clever. Every destructive action
must be hard to do by accident and impossible to do without understanding it. A misclick here
cancels an auction people are actively bidding in.

You are working alone, in one long run, with no one watching. That changes how you work:

- **Never stop to ask permission.** Where this document leaves a genuinely free choice, make the
  call that best serves the operator, note it, and keep going. Only stop if truly blocked — a
  missing backend, a contradiction you cannot resolve — and if you stop, say exactly what you need.
- **Never leave the codebase broken between milestones.** Each milestone ends with a green
  typecheck, lint, and production build. Fix failures before starting the next milestone. Do not
  accumulate errors and clean up at the end.
- **Never stub something and move on silently.** Deferred work goes in a running `NOTES.md` under
  "Deferred", with the reason.
- Work through the milestones in order. Do not skip ahead or reorder.
- **Do not create git commits.** Git is not configured here; leave the working tree alone.

## What you are building

**Consignment Warehouse** replaces a business currently run inside WhatsApp groups: the owner posts
a photo and description of an item, people bid in the thread, and an admin closes it by hand. The
backend and the bidder-facing web app are separate projects and complete. **This is the operator's
console.**

What the operator does here:

1. Create an auction, set its dates and bidding rules.
2. Add lots (items) to it, with photos, descriptions, starting prices and reserves.
3. Publish it, then watch bidding come in live.
4. Intervene when needed: withdraw a bad item, void a fraudulent bid, extend the auction.
5. Decide what happens to lots that closed below reserve — accept the top bid, or relist.
6. Manage users: find someone, suspend them, promote a colleague to admin.

**You will not modify the backend.** If you think the API is wrong or missing something, record it
in `NOTES.md` under "Backend requests" and work around it.

## Locked decisions — implement these, do not reconsider

**Authentication is phone OTP**, the same mechanism bidders use. Google and email sign-in do not
exist in the backend today. **Isolate all authentication behind a single module** (`lib/auth/`) with
one clear interface, so swapping in Google OIDC later is a contained change and not a refactor.
Write it as if you know it will be replaced.

**Architecture: client-heavy SPA inside the Next.js App Router.** Thin server shell, all interactive
surfaces client components. Bearer auth and a live WebSocket mean server-rendering authenticated
data buys nothing and costs plumbing.

**Visual direction: light, dense, professional.** Detailed below. This is deliberately the opposite
of the consumer app, which is dark and photo-led — do not copy that styling.

**Verification: typecheck, lint and production build after every milestone.**

## Stack

Already present: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, ESLint.

Pre-approved additions:

- `@tanstack/react-query` — server state, caching, mutations, optimistic updates.
- `@tanstack/react-table` — headless tables with sorting and column control. The operator lives in
  tables; hand-rolling this is a waste.
- `zustand` — auth session and socket state.
- `zod` + `react-hook-form` + `@hookform/resolvers` — forms. There are many, several with
  conditional validation, and hand-rolled form state will not survive this app.
- `sonner` — toasts.
- `clsx` + `tailwind-merge`.
- `date-fns` — the admin app does real date work (scheduling, ranges, "closes in 4h"), unlike the
  consumer app.

Do not add a full component library (no MUI, Chakra, Ant). Build the primitives you need. Do not add
a charting library unless a milestone below asks for one — it does not.

## The backend API — complete reference

**Base URL:** `http://localhost:8000/api/v1` from `NEXT_PUBLIC_API_BASE_URL`.
**WebSocket:** `ws://localhost:8000/api/v1/ws` from `NEXT_PUBLIC_WS_URL`.

Create `.env.local` and a documented `.env.example`.

### Conventions that apply everywhere

- **All money is an integer in minor units (cents).** `*_minor` means cents. Never float-arithmetic
  it. `250000` is R2 500,00. Format with `Intl.NumberFormat` and the auction's `currency_code`
  (ISO 4217, expect `ZAR`), dividing by 100 only at render. **Money inputs must accept rands and
  submit cents** — build one `MoneyInput` primitive that owns that conversion and use it everywhere.
- **All timestamps are ISO 8601 UTC strings.** All datetime inputs must submit UTC. Display in the
  operator's local timezone with the zone shown, because getting an auction close time wrong by two
  hours is a real and expensive mistake.
- **All IDs are UUID strings.**
- Every endpoint requires `Authorization: Bearer <access_token>`.
- **Every route under `/admin` requires an admin role.** A non-admin gets `403`, unauthenticated
  gets `401`.
- Errors are `{"detail": "..."}` except where noted. Two shapes are structured — frozen-field
  (`409`) and bid-too-low (`422`). Handle both.
- Every `429` carries `Retry-After` in seconds.
- Cursor-paginated endpoints return `X-Next-Cursor` and `X-Has-More` headers, exposed via CORS.

### Authentication — identical to the consumer app

While the backend runs with `APP_ENV=local`, **the OTP code is always `0000`**.
Seeded admin: **`+27820000001`**. Seeded bidders: `+27820000002`, `+27820000003`, `+27820000004`.

- `POST /auth/otp/request` — `{ "phone": "+27820000001" }` → `200 {detail}`. Phone must be E.164;
  the backend does not infer a country from `082...`. Errors: `422`, `429` + `Retry-After`.
- `POST /auth/otp/verify` — `{ "phone", "code", "device_id", "device_name"? }` →
  `{ "access_token", "refresh_token", "token_type": "bearer", "expires_in": 900 }`. `device_id` must
  be a **stable UUID per browser**, persisted in `localStorage`. Errors: `401`, `403` suspended,
  `429`.
- `POST /auth/refresh` — `{}` on web; the `HttpOnly` cookie carries it. Returns a new pair. **The
  refresh token rotates every call.** A `401` here means the session is over — clear state, go to
  login, never retry.
- `POST /auth/logout?all_devices=false` — `{}`. Authenticates on the refresh token alone.
- `GET /auth/me` → `{id, phone_e164, first_name, last_name, email, status, role, is_phone_verified, last_login_at, created_at}`.
  `role` is `bidder` | `admin` | `superadmin`.
- `PATCH /auth/me` — `{first_name?, last_name?, email?}`. `409` if the email is taken.

Hold the **access token in memory only**, never `localStorage`. Implement **single-flight refresh**:
at most one refresh in progress, other calls await it and retry once. Parallel refreshes replay a
rotated token, and the backend revokes the whole family on replay — that logs the operator out
permanently.

**After login, check `role`.** A `bidder` must be shown a clear "this account does not have admin
access" screen and offered logout — not dumped into a console where every request 403s.

**Superadmin matters.** Only `superadmin` may change roles. Hide or disable those controls for a
plain `admin` rather than letting them click into a `403`.

### Auctions

#### `POST /admin/auctions` → `201`

```json
{
  "slug": "spring-sale-2026", "name": "Spring Sale", "description": "string|null",
  "image_url": "string|null", "starts_at": "iso", "ends_at": "iso",
  "currency_code": "ZAR", "anti_snipe_window_seconds": 300,
  "anti_snipe_extension_seconds": 300, "max_extensions": 20
}
```

`slug` must match `^[a-z0-9][a-z0-9-]*$` — validate client-side and offer to auto-generate it from
the name. `currency_code` is optional and defaults server-side. Created as `draft`.

Response is `AuctionAdminOut`:
```json
{
  "id","slug","name","description","image_url",
  "status":"draft|scheduled|live|ended|settled|cancelled",
  "starts_at","ends_at","currency_code","anti_snipe_window_seconds",
  "anti_snipe_extension_seconds","max_extensions","created_by_user_id","created_at","updated_at"
}
```

Errors: `409` duplicate slug, `422` validation.

#### `GET /admin/auctions?status=&limit=50&offset=0` → array of `AuctionAdminOut`. Includes drafts.

#### `GET /admin/auctions/{auction_id}` → `AuctionAdminOut`.

#### `PATCH /admin/auctions/{auction_id}`

All fields optional: `name`, `description`, `image_url`, `starts_at`, `ends_at`, `currency_code`,
`anti_snipe_window_seconds`, `anti_snipe_extension_seconds`, `max_extensions`, plus
`confirm_shorten` (bool, default false).

Response is `AuctionMutationOut` — an auction plus **`lots_rescheduled`** and **`lots_cancelled`**,
so the operator sees the blast radius. Surface those numbers; do not swallow them.

**Field freezing.** Once **any lot in the auction has a bid**, these are frozen:
`currency_code`, `anti_snipe_window_seconds`, `anti_snipe_extension_seconds`, `max_extensions`.
Additionally, `starts_at` freezes once the auction is `live`, regardless of bids. Editing a frozen
field returns:

```json
{ "detail": { "message": "...", "field": "max_extensions" } }
```
with `409`. **Read `field` and highlight that input** rather than showing a generic banner. Better
still: fetch the auction's state and disable the frozen inputs up front, with a tooltip explaining
why.

**The `ends_at` cascade — explain it in the UI.** Changing `ends_at` moves every not-yet-ended lot
with it, preserving each lot's earned anti-snipe extensions as a delta. Before submitting a date
change on an auction with lots, show a confirmation summarising what will move.

**Shortening with live bidding requires `confirm_shorten: true`.** Without it you get a `409`. Do
not send it silently — put a distinct, deliberately uncomfortable confirmation in front of it, naming
how many lots are affected. This truncates bidding people are in the middle of.

`ends_at` in the past is `422`.

#### `POST /admin/auctions/{auction_id}/publish` → `AuctionAdminOut`

`draft` → `scheduled`, and promotes its draft lots to `scheduled`. Refuses with `409` if: the
auction has no lots, `starts_at` is in the past, or `ends_at <= starts_at`. **Validate all three
client-side first** and show what is blocking publication as a checklist, so the operator is never
guessing.

#### `POST /admin/auctions/{auction_id}/cancel`

Body: `{ "reason": "string" }` (1–500 chars). Returns `AuctionMutationOut`. Refuses with `409` if
any lot already ended sold. Cascades to lots and notifies watching bidders. Destructive — require
typing the auction name to confirm.

#### Increment rules

- `GET /admin/auctions/{auction_id}/increment-rules` → array of
  `{id, auction_id (null = global), min_price_minor, increment_minor}`.
- `POST /admin/auctions/{auction_id}/increment-rules` — `{min_price_minor, increment_minor}` →
  `201`. `min_price_minor >= 0`, `increment_minor > 0`. `409` on duplicate band floor.
- `DELETE /admin/auctions/{auction_id}/increment-rules/{rule_id}` → `204`.

**Explain what these do.** Increments are price-banded: the rule with the largest
`min_price_minor` that is `<=` the current price wins. An auction with no rules of its own falls
back to the global set. Render them as a sorted table with a plain-language preview: *"From R0:
bid in R10 steps. From R500: R50 steps."* Deleting all of an auction's rules restores the global
fallback — say so before deleting the last one.

### Lots

#### `POST /admin/auctions/{auction_id}/lots` → `201`

```json
{
  "title": "string", "description": "string|null", "starting_price_minor": 250000,
  "bid_increment_minor": null, "reserve_price_minor": null, "lot_number": null
}
```

`bid_increment_minor: null` means "use the auction's bands, else global" — express that in the UI as
a toggle between *Use auction increments* and *Override for this lot*, not as an empty number field.
`lot_number: null` auto-assigns the next free number; an explicit duplicate is `409`.

Response `LotAdminSummaryOut`:
```json
{
  "id","auction_id","lot_number","title","description",
  "status":"draft|scheduled|live|ended_sold|ended_unsold|ended_reserve_not_met|withdrawn|cancelled",
  "starting_price_minor","bid_increment_minor","reserve_price_minor",
  "scheduled_ends_at","effective_ends_at","extension_count",
  "current_bid_minor","current_leader_user_id","bid_count","bid_sequence","relisted_from_lot_id"
}
```

**Bulk entry matters more than it looks.** The operator lists many items in a sitting. Build a
create form that stays open and resets for the next lot, keeping the auction context and showing a
running list of what has been added.

#### `GET /admin/auctions/{auction_id}/lots` → array of `LotAdminSummaryOut`.

#### `PATCH /admin/lots/{lot_id}`

Optional: `title`, `description`, `starting_price_minor`, `bid_increment_minor`,
`reserve_price_minor`, `scheduled_ends_at`, `effective_ends_at`, `status`.

**Once this lot has a bid**, these freeze: `starting_price_minor`, `bid_increment_minor`,
`reserve_price_minor`, `scheduled_ends_at`, `effective_ends_at`. `title`, `description` and images
stay editable. Frozen edits return the structured `409` above.

The reserve is frozen deliberately — the escape hatch for a reserve set too high is
`accept-reserve` after the close, not moving it mid-auction. Say that in the UI when the field is
disabled, because it is the obvious thing an operator will try.

#### `POST /admin/lots/{lot_id}/withdraw`

Body `{ "reason": "string" }` → `LotAdminSummaryOut`. Allowed **even with bids** — this is the
escape hatch for a bad item. Bid history stands; auto-bids are deactivated; watching bidders are
notified. Destructive: confirm explicitly, and when the lot has bids, say how many and that bidders
will be told.

#### `DELETE /admin/lots/{lot_id}` → `204`

Permitted **only** for a `draft` lot with no bids; anything else is `409`. Only offer delete when
those conditions hold, and offer withdraw otherwise.

#### `POST /admin/lots/{lot_id}/accept-reserve`

Body `{ "reason": "string" }` → `LotAdminSummaryOut`. Valid **only** from
`ended_reserve_not_met`; any other status is `409`. Promotes the top bid to won and the lot to
`ended_sold`.

This is a **decision queue** and deserves its own screen — see M6. Show the reserve, the top bid,
and the shortfall in rands, prominently, before confirming. The operator is knowingly selling below
reserve.

#### `POST /admin/lots/{lot_id}/relist`

Body `{ "target_auction_id": "uuid", "lot_number": null }` → the **new** `LotAdminSummaryOut`.
Valid from `ended_unsold`, `ended_reserve_not_met`, or `withdrawn`. Copies descriptive fields and
image references into the target auction as a fresh `draft`; copies **no** bids, auto-bids, swipes,
extension counts or current-bid state. `relisted_from_lot_id` records provenance — show it as a link
back to the original.

#### `GET /admin/lots/{lot_id}` → `LotAdminOut`

The full bidder-detail shape **plus `reserve_price_minor` and `current_leader_user_id`**. This is
the only endpoint exposing a reserve. Fields: everything in the lot card, plus `description`,
`scheduled_ends_at`, `images[]`, `my_auto_bid_max_minor`, `am_i_leading`, `reserve_price_minor`,
`current_leader_user_id`.

Bid history for a lot is the shared `GET /lots/{lot_id}/bids?cursor=&limit=50` — newest first,
`cursor` is a `sequence` to resume before. Items:
`{id, sequence, amount_minor, status, is_auto, created_at, bidder_handle, is_mine}`.

#### `POST /admin/bids/{bid_id}/void`

Body `{ "reason": "string" }` →
```json
{ "bid_id","lot_id","status","current_bid_minor","current_leader_user_id","bid_count" }
```

Voids a bid and **recalculates the lot's leader and price** from the remaining live bids. This
rewrites a financial record — put it behind a confirmation that shows the bid, the bidder handle,
the amount, and what the lot's price will become. Require a reason; do not default it.

### Images

The API never sees image bytes. The flow is **presign → upload directly to storage → confirm**.

#### `POST /admin/lots/{lot_id}/images/presign`

Body `{ "content_type": "image/jpeg", "size_bytes": 1048576 }` →
```json
{ "url": "...", "fields": {"key":"...","policy":"...","x-amz-signature":"..."},
  "storage_key": "...", "max_bytes": 10485760, "expires_in": 3600 }
```

Allowed types: `image/jpeg`, `image/png`, `image/webp`. `422` otherwise or if too large.

#### Then upload

Build a `FormData`, append **every entry of `fields` first, in order**, then `file` **last** — S3
POST policies require the file to be the final field. `POST` it to `url` with **no**
`Authorization` header and **no** `Content-Type` (the browser sets the multipart boundary). A
successful upload returns `204`. Note the size cap is enforced by the storage policy itself, so a
too-large file fails here even if your client-side check is bypassed — surface that error clearly.

#### `POST /admin/lots/{lot_id}/images`

Body `{ "storage_key", "width": null, "height": null, "is_primary": false, "position": null }` →
`LotImageAdminOut` `{id, lot_id, storage_key, url, position, is_primary, width, height}`.

**Read `width`/`height` client-side from the loaded image and send them** — the server does not
decode the file. `422` if the object is not actually in storage.

#### `GET /admin/lots/{lot_id}/images` → array, ordered by position.
#### `PATCH /admin/lots/{lot_id}/images/{image_id}` — `{position?, is_primary?}`. Promoting a new primary demotes the old one server-side.
#### `DELETE /admin/lots/{lot_id}/images/{image_id}` → `204`.

Build a proper uploader: drag-and-drop, multi-file, per-file progress, client-side type and size
validation before presigning, thumbnail reordering by drag, and one-click "make primary". Exactly
one image is primary per lot. If none is flagged, the lowest `position` is treated as primary by the
bidder app — reflect that in the UI so what the operator sees matches what bidders get.

### Users

#### `GET /admin/users?search=&status=&role=&limit=50&offset=0`

`search` matches partial phone, first or last name. Returns `AdminUserOut`:
```json
{ "id","phone_e164","first_name","last_name","email","status","role",
  "is_phone_verified","last_login_at","created_at" }
```

**`phone_e164` is the most sensitive data in the system.** Show it where the operator needs it, but
never log it, never put it in a URL, and never send it to any analytics.

#### `GET /admin/users/{user_id}` → `AdminUserDetailOut` — the above plus
`{bid_count, lots_bid_on, lots_currently_winning, active_sessions}`.

#### `POST /admin/users/{user_id}/suspend` — `{ "reason": "string" }` → `AdminUserOut`

Revokes every refresh token **and closes their live WebSocket sessions**. Their bids stand — those
are financial records, not privileges. Say that in the confirmation so the operator is not left
wondering.

`409` if: suspending yourself, or the last active superadmin.

#### `POST /admin/users/{user_id}/reactivate` — `{ "reason": "string" }` → `AdminUserOut`.

Does **not** restore their old sessions; they log in again. Say so.

#### `POST /admin/users/{user_id}/role` — `{ "role": "bidder|admin|superadmin", "reason": "string" }`

**Superadmin only.** `403` for a plain admin — so hide the control unless `role === "superadmin"`.
`409` if: changing your own role, or demoting the last active superadmin.

### Real-time — the same socket the bidder app uses

- `POST /ws/ticket` → `{ "ticket", "expires_in": 30 }`. Single-use, 30s. `429` at 300/hour.
- `WS /ws?ticket=<ticket>` — mint a **fresh ticket before every connection attempt including
  reconnects**. A reused or expired ticket closes with **4401**; mint another and retry.

Client → server: `{"action":"subscribe","lot_ids":[...]}` (optional `"after_sequence": N` to catch
up in the same round trip), `unsubscribe`, `{"action":"resync","lot_id","after_sequence"}`, `ping`.

Server → client: `subscribed` / `unsubscribed`, `bid`, `lot_extended`, `lot_rescheduled`,
`lot_closed`, `lot_opened`, `resync_complete`, `resync_too_far`, `pong` / `ping`, `error`.

`bid` payload: `{type, lot_id, sequence, amount_minor, bidder_handle, bid_count, is_auto, created_at}`.

Limits: 200 lots per connection, 4 KB per message, 120 messages/minute, 120s idle timeout, 30s
server ping — **you must reply to a server `ping` with `pong`**.

Track the highest `sequence` per lot and reconnect with `after_sequence`. On `resync_too_far`,
refetch over REST.

**Where the admin app uses this:** the auction monitor (M7) subscribes to every lot in an open
auction so the operator watches bids land live. Respect the 200-lot cap — for larger auctions,
subscribe to what is visible and rely on polling for the rest.

## Design system

**Light, dense, professional.** The consumer app is dark and photo-led; this is deliberately not
that. Define as CSS variables in `globals.css`, exposed through Tailwind v4's `@theme`.

```
--bg:            #F7F8FA   app canvas
--surface:       #FFFFFF   cards, tables, panels
--surface-sunken:#F0F1F4   table headers, inset areas
--border:        #E2E4E9
--border-strong: #C7CAD1
--text:          #14161A
--text-muted:    #6B7280
--accent:        #2563EB   primary actions, links, focus
--accent-ink:    #FFFFFF
--danger:        #DC2626   destructive actions, errors
--warning:       #D97706   needs attention, reserve not met
--success:       #16A34A   live, sold, winning
```

**Status colours are semantic and must be consistent everywhere.** Define one `StatusBadge` that
maps every auction and lot status to a colour and label, and use it exclusively:
`draft` neutral · `scheduled` blue · `live` green with a subtle pulse · `ended_sold` green ·
`ended_unsold` neutral · `ended_reserve_not_met` **amber, because it needs a decision** ·
`withdrawn` / `cancelled` red.

**Density.** Compact table rows (~36–40px), 13–14px base text, tabular numerals for all money and
counts. Information over whitespace. This is a tool, not a landing page.

**Layout.** Persistent left sidebar (Auctions / Lots / Decisions / Users), a top bar with the
current auction context and the connection indicator, and content filling the rest. Collapse the
sidebar to icons below 1280px and to a drawer on mobile. It must be usable on a phone in a
warehouse, even if it is optimised for desktop.

**Destructive actions.** Never a bare button. Cancel auction and void bid require typing a
confirmation value. Withdraw and suspend require an explicit reason (the API demands one — do not
prefill it). Every destructive dialog states plainly what will happen to bidders.

**Keyboard.** Full tab-order through forms, `Cmd/Ctrl+K` command palette for jumping to an auction
or lot, `Esc` closes dialogs, `Enter` submits. The operator is doing repetitive data entry; the
mouse should be optional.

## Milestones

Each ends with the verification gate. Do not start the next until the current is green.

### M0 — Foundation

Dependencies, `.env.local` / `.env.example`, Tailwind tokens, folder structure:

```
app/                 routes
components/ui/       primitives
components/          feature components
lib/api/             client, endpoints, zod schemas
lib/auth/            session, refresh, device id — ISOLATED, swappable
lib/realtime/        socket client
lib/format/          money, dates, status labels
types/               shared types
```

Write `types/api.ts` covering **every** shape in this document, with matching zod schemas. Build the
API client: base URL, `Authorization` injection, typed errors distinguishing `{detail: string}` from
the structured frozen-field and bid-too-low shapes, `X-Next-Cursor` / `X-Has-More`, and
`Retry-After` handling. Implement **single-flight refresh** now.

**Gate:** `tsc --noEmit`, `eslint`, `next build` all clean.

### M1 — Authentication and the shell

`/login` (phone) and `/login/verify` (OTP). Stable `device_id`. Access token in memory. Role check
after login with a clear non-admin rejection screen. Auth guard preserving intended destination.

App shell: sidebar, top bar, toasts, error boundary, and primitives — `Button`, `Input`,
`MoneyInput`, `DateTimeInput` (local display, UTC submission, zone shown), `Select`, `Dialog`,
`ConfirmDialog` (with type-to-confirm), `Table`, `StatusBadge`, `Skeleton`, `EmptyState`,
`Countdown`.

**Gate**, plus a real login against the running backend with `+27820000001` / `0000`.

### M2 — Auctions list and creation

`/auctions` — table of all auctions including drafts: name, slug, status badge, starts/ends, lot
count, and a countdown for live ones. Filter by status, search by name, sort by date.

`/auctions/new` — create form with slug auto-generation from the name, date pickers, and an
increment-rules section explaining the bands. Validate `ends_at > starts_at` client-side.

**Gate.**

### M3 — Auction detail and editing

`/auctions/[auctionId]` — header with status, dates, countdown, and actions (Edit, Publish, Cancel).

Edit form with **frozen fields disabled and explained** based on whether any lot has a bid and
whether the auction is live. The `ends_at` change flow: show what will move before submitting, and
surface `lots_rescheduled` / `lots_cancelled` from the response afterwards. Shortening with live
bidding gets its own uncomfortable confirmation and sends `confirm_shorten: true`.

Publish shows a readiness checklist (has lots · `starts_at` in the future · `ends_at` after
`starts_at`) and only enables when all pass. Cancel requires typing the auction name.

An increment-rules editor: sorted table, add/delete, plain-language preview, and a warning before
deleting the last rule.

**Gate.**

### M4 — Lots

Lots tab on auction detail: dense table — number, thumbnail, title, status, starting price, reserve,
current bid, bid count, extensions, close time. Sortable, filterable by status, with bulk selection
for future bulk actions.

`/auctions/[auctionId]/lots/new` — create form that **stays open and resets** for rapid entry,
showing a running list of what has been added this session. Increment override as a toggle, not a
bare field.

`/lots/[lotId]` — full detail from `GET /admin/lots/{id}`, **including the reserve**. Edit form with
freeze rules applied and explained. Actions: Withdraw (reason required, states bidder impact),
Delete (only when draft with no bids), Relist (target auction picker), Accept Reserve (only from
`ended_reserve_not_met`). Bid history table with void action per row.

**Gate.**

### M5 — Images

The uploader on lot detail: drag-and-drop, multi-file, per-file progress, client-side type/size
validation, presign → direct upload → confirm, reading `width`/`height` from the loaded image.
Thumbnail grid with drag reordering (persisting `position`), one-click make-primary, and delete with
confirmation. Handle a storage rejection of an oversized file distinctly from an API validation
error.

**Gate**, plus a real upload against the running MinIO, verified visible in the bidder app.

### M6 — Decisions queue

`/decisions` — the screen that exists because the backend has a terminal-*pending* status nothing
else surfaces. Lists every lot in `ended_reserve_not_met` across all auctions, showing reserve, top
bid, **shortfall in rands**, bidder handle and close time.

Two actions per row: **Accept reserve** (confirmation showing the shortfall explicitly) and
**Relist** (auction picker). This should be the first thing an operator checks after an auction
closes — make it prominent in the sidebar with a count badge.

**Gate.**

### M7 — Live auction monitor

`/auctions/[auctionId]/monitor` — the operator's view while an auction runs.

Subscribe over WebSocket to the auction's lots (respect the 200 cap; subscribe to visible lots and
poll the rest). Live-updating grid: current bid, bid count, countdown, leader handle. New bids
pulse. Anti-snipe extensions are called out visibly — `lot_extended` means a lot just moved its own
clock and the operator should see that happen.

A live activity feed of incoming bids across the auction. Summary stats: lots live, lots ended,
total current bid value, lots with reserve not met.

Socket handling: exponential backoff with jitter, fresh ticket per attempt, `after_sequence` on
reconnect, `resync_too_far` → REST refetch, reply to server pings, and an honest connection
indicator.

**Gate**, plus verify live: bid from the bidder app, watch it appear here.

### M8 — Users

`/users` — table with search (phone, first, last name), status and role filters, pagination. Columns:
name, phone, role, status, last login, created.

`/users/[userId]` — detail with the activity summary (`bid_count`, `lots_bid_on`,
`lots_currently_winning`, `active_sessions`). Actions: Suspend (reason required; state that sessions
end and bids stand), Reactivate (state that sessions are not restored), Change role (**superadmin
only — hide entirely otherwise**).

Handle the `409` guard cases with clear messages: cannot act on yourself, cannot demote or suspend
the last superadmin.

**Gate.**

### M9 — Polish

Server-anchored time: compute the offset between the server `Date` header and local time at startup
and apply it to every countdown. An operator whose laptop clock is wrong must not see wrong close
times.

`Cmd/Ctrl+K` command palette (jump to auction, lot, or user). Loading skeletons everywhere, never a
full-page spinner. Meaningful empty states. Offline banner with recovery. Optimistic updates with
rollback on the common mutations. Full keyboard operability. Real page titles. WCAG AA contrast —
verify, do not assume.

**Gate.**

### M10 — Final verification

Run the gate, then walk the whole operator journey against the running backend and record it in
`NOTES.md`:

log in as `+27820000001` with `0000` → create an auction → add three lots, one with a reserve →
upload images to a lot → publish → bid from the bidder app or a second account → watch the monitor
update live → void a bid and confirm the leader recalculates → edit `ends_at` and confirm lots
cascade → withdraw a lot → let a lot close below reserve → accept the reserve from the decisions
queue → relist an unsold lot → find a user and suspend them → confirm their session ends.

Write `README.md`: what this is, prerequisites (backend running via `make dev`, `make seed`, MinIO
up for images), setup, environment variables, scripts, architecture in a paragraph, and a note that
authentication is phone OTP today and isolated in `lib/auth/` for a later swap.

## Definition of done

1. `npx tsc --noEmit` clean.
2. `npm run lint` clean.
3. `npm run build` succeeds.
4. Every milestone's screens exist and work against the live backend.
5. The M10 journey completes, with the result written into `NOTES.md`.
6. No `any` in application code except where a third-party type forces it, commented.
7. Every destructive action has a confirmation, and every reason field is operator-entered.
8. `reserve_price_minor` and `phone_e164` appear only where this document says they should.
9. Nothing deferred without an entry in `NOTES.md`.
10. `.env.example` documents every variable.
11. No git commits created.

## Report at the end with

- What you built, milestone by milestone.
- Every judgement call where this document left the choice open.
- Anything in the API that fought you, or that you would ask the backend to change.
- What you deferred and why.
- The M10 journey result, honestly — including anything that did not work.
