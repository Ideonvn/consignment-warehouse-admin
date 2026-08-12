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

**Light is the default and the reference.** A dark theme exists for evening
readability, nothing more — same density, same layout, same semantics. It is not
a second design and not licence to drift toward the bidder app's dark photo-led
styling. See "Theming" below before touching a colour.

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

**The credit ledger is append-only, and the sign is not the operator's to
choose.** Two rules, both structural:

*Append-only.* Nothing is ever edited or deleted. A mistake is corrected by
posting a **reversal** that points at the original, leaving both on the record —
that is what lets a statement be reconciled against a bank statement. There is
no edit affordance to build, and if a screen seems to want one, the answer is a
reversal. An entry can be reversed once; a second attempt is a 409 and should say
so plainly rather than surfacing a generic error.

*Sign comes from the entry type.* `amount_minor` is posted as a positive
magnitude and the backend applies the direction: `deposit` and `payment` add
credit, `refund` and the charge types subtract. A negative amount is not
representable, so **never build a +/− toggle** — collect a positive amount and
show the direction as a consequence of the type. `adjustment` is the sole
exception: it has no inherent direction and must send
`direction: "credit" | "debit"`. Omitting it there is a 422, and sending it on
any other type is also refused, so it is a required choice on that type and
absent everywhere else.

On the way *out* `amount_minor` is signed, which is how an adjustment's
direction is recoverable (the read shape carries no `direction`). The statement
splits it into Charge and Credit columns; balances are stated as sentences —
"R2 000,00 owing", "R10 000,00 in credit" — because a misread minus sign means
chasing the wrong person. `lib/format/ledger.ts` owns that wording and the
entry-type labels (`lot_won` is "Lot won", `buyers_premium` is "Buyer's
premium", `reversal` is "Correction").

**Participants are a query, not a roster.** `GET /admin/auctions/{id}/participants`
is computed on read — there is no participant table, no registration and no
approval step, so **do not build an "approve" control**. Eligibility falls out of
the balance against the auction's deposit, which means recording a deposit is
what makes someone eligible; the screen defaults to the ineligible filter
because that is the working list, and every row links to that person's ledger.

**The buyer's premium is basis points.** `buyers_premium_bps` of 1500 is 15%.
Operators enter a percentage and `parsePercentToBps` converts; the field always
echoes the stored bps back, because a rate that silently means a hundredth of
what was intended shows up on an invoice rather than in the form. Both
`deposit_amount_minor` and `buyers_premium_bps` **freeze once any lot has a
bid**, through the same `freezeReasons` map as the other bidding rules.

**The auction cover image is not frozen.** Auctions keep name, description and
image editable after bidding starts, so the image control sits *outside*
`AuctionEditForm` — that component is where the freeze rules live, and anything
put inside it risks inheriting them. Two fields describe three states and the
operator should be able to tell which one they are in: no `image_url` is "none";
`image_url` without `image_storage_key` is an external link someone else hosts;
both set is an upload of ours. `auctionImageState()` in `types/api.ts` is the one
place that mapping lives. Uploading and linking are peers — neither is the
"proper" way — and `image_storage_key` is admin-only, used only to tell the
states apart, never rendered.

Replacement is server-side: setting a new image drops the old object either way
round, so never build a delete-then-upload flow. Presign is scoped to an auction
that already exists, which is why the create form collects the file and applies
it *after* creation — and why a failed image there is reported but never
discards the created auction.

**Images: presign → direct upload to storage → confirm.** The API never sees the
bytes. Append **every entry of `fields` to the `FormData` first, then the file
last** — S3 POST policies require the file to be the final field — and POST to
the presigned URL with **no `Authorization` header and no `Content-Type`** (the
browser must set the multipart boundary). Read `width`/`height` from the loaded
image and send them; the server does not decode the file. The size cap is
enforced by the storage policy itself, so an oversized file fails at the storage
step even if the client-side check is bypassed — that rejection needs different
wording from an API validation error, because one means the bytes never landed.

That whole sequence is `useDirectUpload` (`lib/api/use-direct-upload.ts`), shared
by the lot gallery and the auction cover image, sitting on the transport rules in
`lib/api/upload.ts`. It owns the validate → presign → upload → confirm state
machine, per-file progress, and the storage-vs-API error wording. A third
uploader calls the hook with different presign/confirm callbacks — do not copy
the sequence, it is exactly the kind of thing that drifts.

## Theming

Three settings — Light / Dark / System — with **Light as the default**, so the
existing look is what you get out of the box.

**Adding a theme is a token override, not a restructure.** `app/globals.css`
holds raw tokens in `:root` and maps them to `--color-*` through
`@theme inline`. Dark therefore overrides the raw tokens under
`[data-theme="dark"]` and every existing utility class follows automatically.
Do not restructure that; do not reach for `dark:` variants in components.

**Nothing may hardcode a colour.** Components used to carry literal hexes for
tinted surfaces (`bg-[#eff6ff]` and friends). Those bypass the token layer
entirely, so they would have stayed light-on-light in dark mode — they are now
`--info-tint`, `--warning-tint`, `--danger-tint`, `--success-tint` and their
`*-tint-border` partners. If you find yourself typing a hex in a component,
the token is missing; add it in both themes.

### The `*-ink` inversion — the trap

`--danger-ink`, `--warning-ink`, `--success-ink` and `--accent-ink-on-light` are
**darkened** in light, because the raw status hues are too light for AA text on
white. **In dark that reasoning reverses exactly**: those darkened readings fail
against a dark surface, so the dark theme makes them *lighter* than the raw
hues. `--border-strong` has the same history in the other direction — it was
darkened from `#C7CAD1` to `#898C94` in light because 1.64:1 is nowhere near the
3:1 WCAG 1.4.11 wants for an input boundary, and dark needed its own value
checked the same way.

Two token pairs exist because one colour cannot do two jobs:

- `--accent` (button fill, contrasts with its own ink) vs `--focus` (ring,
  contrasts with the page). They coincide in light; in dark the ring brightens
  to `#5A93F7` because `#2563EB` is only 2.4:1 against the dark canvas.
- `--warning-fill-ink` / `--danger-fill-ink` for text sitting *on* a solid
  status fill, as `--accent-ink` is for the accent fill.

### Verify numerically, in both themes

4.5:1 for body text, 3:1 for non-text boundaries and large text. **Do not
eyeball it** — the originally specified `--border-strong` failed by more than
half, and white-on-amber was shipping at 3.19:1 on the sidebar decision badge
and the monitor's extension marker until the theme work measured it. Measured
ratios for the pairings that matter (light / dark):

| Pairing | Light | Dark |
| --- | --- | --- |
| body text on surface | 18.11 | 14.05 |
| muted text on sunken (table headers) | 5.43 | 8.14 |
| link text on surface | 6.70 | 8.20 |
| primary button ink on fill | 5.17 | 5.17 |
| danger button ink on fill | 4.83 | 4.83 |
| ink on amber fill (decision badge) | 4.86 | 4.86 |
| danger ink on danger tint | 7.60 | 8.22 |
| warning ink on warning tint | 6.84 | 8.55 |
| success ink on success tint | 4.79 | 7.96 |
| input outline vs surface | 3.36 | 3.59 |
| focus ring vs canvas | 4.86 | 6.21 |
| primary button fill vs surface | 5.17 | 3.30 |

`StatusBadge` is the single status→colour map and all six tones stay legible and
separable in both themes; the amber `ended_reserve_not_met` must stay easy to
spot at night, since it is the one that needs a decision. Badge *borders* are
decorative — the label text and dot carry the status, so 1.4.11's 3:1 does not
bind there; they are held to a visibility floor instead.

### No flash of the wrong theme

The theme is applied by an inline script in `<head>` (`app/layout.tsx`), so it
lands during head parsing, before anything paints. next-themes ships an
equivalent script but renders it inside `<body>`, which is late enough for the
body background to have painted — an operator opening this at night would get a
white flash. The head script mirrors next-themes' resolution exactly (stored
value, `system` resolved through `matchMedia`, default light) so the two never
disagree. `<html>` carries `suppressHydrationWarning` because that script
legitimately changes the element before React hydrates.

`color-scheme` follows the active theme. That is what makes native date pickers,
scrollbars and autofill follow it too — `DateTimeInput` and `MoneyInput` lean on
native controls constantly, so getting this wrong is very visible.

`next-themes` is the one dependency added for this. It is zero-dependency and
handles the OS theme changing while the app is open, cross-tab sync, and the SSR
mismatch. Hand-rolling all four is about a hundred lines of fiddly code with a
nasty failure mode.

### Where the control lives

Three segmented buttons in the app shell's top bar, next to the connection
indicator, showing which is active and what System currently resolves to. An
operator switching at dusk reaches it in one click. It is deliberately **not** on
a settings or profile screen — there is no profile screen in this app (a
recorded known gap) and one should not be created for this.

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
- **Theme is stored per device, in `localStorage` only** (`cw.admin.theme`) —
  not on the user record. That is a decision, not a missing feature: the same
  operator uses a warehouse laptop in daylight and a phone at night, so syncing
  the setting would carry the wrong choice to the wrong device. It also means no
  backend field and no profile screen are needed for it.
- **The last-superadmin guard is unreachable through the role endpoint.** With
  one superadmin left, the only account that could demote them is their own, and
  the self-change 409 fires first. The guard is real and reachable through
  *suspend* (an admin suspending the last superadmin gets a 409). Do not go
  looking for a bug here.
