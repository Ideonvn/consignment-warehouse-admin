@AGENTS.md

# Consignment Warehouse — admin portal

## What this is

The operator's console for a real-money auction business. One or two people
live in this tool for hours: listing stock, watching auctions close, and
deciding things worth money — often under time pressure, sometimes on a phone
in a warehouse. A misclick here cancels an auction people are actively bidding
in.

Two other repos exist and this one never modifies them: the **backend** (FastAPI,
the source of truth for every rule below) and the **bidder-facing web app**
(dark, photo-led, consumer). Requests for the backend go in `NOTES.md`.

**This is deliberately not the consumer app.** Light, dense, table-first:
~36–40px rows, 13–14px base text, tabular numerals on every money column and
count. Information over whitespace. If a change makes this look more like the
bidder app — bigger type, more air, photo-forward cards — it is going the wrong
way. Colour tokens live in `app/globals.css`; status colours are semantic and
`StatusBadge` is the only thing allowed to map a status to a colour, so the same
state never looks like two different things on two screens.

## Stack, and why

Locked. Each of these earns its place:

- **Next.js 16 App Router + React 19** — the server side is a thin shell only.
  Bearer auth and a live WebSocket mean server-rendering authenticated data buys
  nothing and costs plumbing, so route files await `params` and hand off to a
  client component.
- **TanStack Query** — server state, caching, invalidation after mutations.
- **TanStack Table v9** — the operator lives in tables; sorting and column
  control are not worth hand-rolling.
- **Zustand** — the small amount of genuinely global client state: session,
  socket status, current auction, command palette.
- **zod** — every API response is parsed against a schema, so a backend change
  fails loudly at the boundary instead of quietly rendering `undefined`.
- **react-hook-form + @hookform/resolvers** — used where validation is
  conditional; plain controlled state where it is not.
- **sonner** toasts, **clsx** + **tailwind-merge**, **date-fns**.

**No component library, and do not add one.** MUI/Chakra/Ant bring their own
density, spacing and colour opinions, which are precisely the thing this app is
opinionated about. The primitives in `components/ui/` are small and exist to be
edited. No charting library either — nothing here charts.

## Authentication

Phone OTP today, the same mechanism bidders use, because that is what the
backend has. Google and email sign-in do not exist server-side.

**It was written expecting to be replaced.** Everything OTP-specific stops at
`lib/auth/`, behind one `AuthProvider` interface (`lib/auth/types.ts`): start a
challenge, exchange the response for tokens, refresh, sign out, load the current
user. Swapping to Google OIDC is a second provider plus the one line in
`lib/auth/provider.ts` that picks the active one — the login screen already
reads its labels and flow shape (`kind: "challenge-response" | "redirect"`) from
the provider rather than knowing anything about SMS.

**So: depend on the interface, never on the implementation.** Nothing outside
`lib/auth/` should import `phone-otp.ts` or assume a code is involved.

Two details that are load-bearing:

- The access token is held **in memory only**, never `localStorage`.
- **Refresh is single-flight.** The backend rotates the refresh token on every
  call and revokes the whole token family if a rotated one is replayed. Two
  parallel refreshes would do exactly that and log the operator out
  permanently. A 401 from refresh is terminal — clear state, go to login, never
  retry.

## The rules that are load-bearing

Each of these exists because breaking it costs money or trust.

**Money is an integer of minor units (cents).** `250000` is R2 500,00. Divide by
100 exactly once, at render, via `lib/format/money.ts`. **`MoneyInput` is the
only place rands become cents** — if you find yourself parsing an amount
anywhere else, stop. It rejects ambiguous input rather than guessing: in en-ZA
`"1,500"` could be R1.50 or R1 500, and a silently misread amount is a real-money
mistake, so the field asks instead of assuming.

**Datetimes display local with the zone named, and submit UTC.** `DateTimeInput`
owns that conversion; `formatDateTime` is how they reach the screen. Getting an
auction close time wrong by two hours is expensive and irreversible. Countdowns
read `useNow()` (`lib/ui/hooks.ts`), which is anchored to the server's `Date`
header — an operator whose laptop clock is wrong must not see wrong close times.

**Field freezing.** Auction bidding rules (`currency_code`, both anti-snipe
fields, `max_extensions`) freeze once **any** lot in that auction has a bid.
`starts_at` freezes once the auction is `live`. A lot's money and timing freeze
once **that** lot has a bid; title, description and images stay editable.
Do both: **disable the inputs up front with the reason on screen**, so the
operator is never guessing, **and** handle the structured `409`
(`{detail: {message, field}}`) as a backstop by highlighting that field. The
backend is the authority; the client-side rules are a mirror that can drift.

**The `ends_at` cascade.** Changing an auction's `ends_at` moves every
not-yet-ended lot with it and preserves each lot's earned anti-snipe extensions
as a delta. Show what will move before submitting, and surface
`lots_rescheduled` / `lots_cancelled` from the response afterwards — never
swallow them. **Shortening an auction that has live bidding requires
`confirm_shorten: true`**, and it gets its own deliberately uncomfortable
dialog with type-to-confirm, because it truncates bidding people are in the
middle of. Note it fires on *any lot having a bid*, not on the auction being
`live` — a bid can land while an auction is still `scheduled`.

**The reserve is frozen on purpose.** Once a lot has a bid the reserve cannot
move. That is the design, not an oversight: the escape hatch for a reserve set
too high is `accept-reserve` after the close, not moving the goalposts
mid-auction. Say so in the UI where the field is disabled, because moving it is
the first thing an operator will try.

**Every destructive action needs a confirmation and an operator-entered
reason.** Cancel auction and void bid also require typing a confirmation value.
**Never prefill a reason** — it is the operator's words, and it is recorded.
Every destructive dialog states plainly what happens to bidders.

**Role changes are superadmin-only.** Hide the control for a plain admin rather
than letting them click into a 403. The same applies anywhere else a permission
is knowable in advance.

**`reserve_price_minor` and `phone_e164` are admin-only data.** The reserve is
exposed by exactly one endpoint (`GET /admin/lots/{id}`) plus the admin lot
lists. Never log either. **Never put a phone number in a URL** — that is why the
two-step login carries the number in memory between steps and a refresh sends
you back to step one, rather than passing it as a query parameter.

**Optimistic updates are limited to photo ordering and make-primary.** They are
frequent, reversible and carry no money. Everything touching money, bids or lot
state — void, withdraw, accept reserve, cancel, publish, suspend — waits for the
server and shows the server's answer. An optimistic void that rolls back would
show the operator a price that was never true.

**The live monitor's socket overlay must be cleared before a gap-triggered
refetch.** The monitor renders a REST snapshot with a socket overlay folded on
top, and **the overlay takes precedence**. When the server answers
`resync_too_far` the client falls back to a REST refetch — but the overlay was
built from events now known to be incomplete, so if it survives, it pins a stale
price on screen while the bid count updates around it. That is the exact failure
the fallback exists to prevent. **This was a real bug** (R3 050 displayed
against R4 050 on the server); `lib/realtime/use-monitor.ts` clears the overlay
in `onNeedsRefetch` for that reason. Do not remove it. Related: the fallback is
also *visible* — a gap filled silently while the socket looks healthy is a lie
about staleness.

**Images: presign → direct upload to storage → confirm.** The API never sees the
bytes. Append **every entry of `fields` to the `FormData` first, then the file
last** — S3 POST policies require the file to be the final field — and POST to
the presigned URL with **no `Authorization` header and no `Content-Type`** (the
browser must set the multipart boundary). Read `width`/`height` from the loaded
image and send them; the server does not decode the file. The size cap is
enforced by the storage policy itself, so an oversized file fails at the storage
step even if the client-side check is bypassed — that rejection needs different
wording from an API validation error, because one means the bytes never landed.

## Structure

```
app/            routes: thin server shells and the (console) route group
components/ui/  primitives — Button, MoneyInput, DateTimeInput, Dialog, DataTable…
components/     feature components by area: auctions, lots, users, monitor, app-shell
lib/api/        transport, authenticated client, one function per endpoint, query hooks
lib/auth/       session, refresh, device id — isolated and swappable
lib/realtime/   WebSocket client and the monitor's event folding
lib/format/     money, dates, statuses, increments, server-anchored clock
lib/ui/         small client-side stores and hooks
types/api.ts    every API shape as a zod schema with its inferred type
```

## Running it

```bash
npm run dev        # http://localhost:3100
npm run typecheck  # tsc --noEmit
npm run lint       # eslint, including the React Compiler rules
npm run build
```

**`dev` and `start` are pinned to port 3100 and must stay there.** 3100 is the
origin the backend allows for this app; 3000 belongs to the bidder app. On any
other port every preflight is rejected with a bare 400 and no CORS headers,
which the browser reports as an opaque network failure — indistinguishable from
the backend being down, and a genuinely confusing hour if you do not know it.

The backend must be running: `make dev-all` (API plus the lifecycle worker that
opens and closes lots — without it nothing ever closes, so the monitor and the
decisions queue have nothing to show), `make seed`, and MinIO up for images.

While the backend runs with `APP_ENV=local` the **OTP code is always `0000`**.
Seeded: superadmin `+27820000000`, admin `+27820000001`, bidders
`+27820000002`–`4`. The OTP endpoint is rate-limited per phone *and* per source
address, so scripted logins run out quickly — reuse a session rather than
logging in repeatedly.

Two lint rules bite in this Next version: `Date.now()` during render and
`setState` inside an effect are both errors. Use `useNow()` for the former and
reconcile derived state during render for the latter.

## Guardrails

- **No new dependencies** unless they map to a gap in the stack above, and say
  why. Prefer the platform: `<dialog>` gives Esc, focus trapping and a top layer
  for free; native drag-and-drop handles the photo reordering.
- **No component library.** See above.
- **Do not couple to the auth implementation** — only to the `AuthProvider`
  interface.
- **Do not create git commits.**
- Keep `NOTES.md` current when you defer something or find a backend gap; that
  is where those live.

## Known gaps

Deliberate, with reasons — see `NOTES.md` for the full list.

- **Bulk lot actions.** The lots table has multi-select wired up and the toolbar
  says plainly that the backend has no bulk endpoints yet. The UI is ready; do
  not fake it by looping single calls client-side.
- **Bid history paging.** `GET /lots/{id}/bids` is cursor-based and the client
  reads `X-Next-Cursor` / `X-Has-More`, but the lot screen loads only the first
  50 and says so. Nothing in the operator's day has needed deeper history.
- **No profile screen.** `PATCH /auth/me` is typed in `types/api.ts` and unused.
- **The last-superadmin guard is unreachable through the role endpoint.** With
  one superadmin left, the only account that could demote them is their own, and
  the self-change 409 fires first. The guard is real and reachable through
  *suspend* (an admin suspending the last superadmin gets a 409). Do not go
  looking for a bug here.
