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

### Phone entry — the same logic lives in two repos

The login field accepts `0820000001`, `+27 82 000 0001` or `820000001` and
composes one E.164 string. That logic is **ported from the bidder app**:
`lib/auth/phone.ts` and `lib/auth/countries.ts` here mirror the same paths in
`consignment-warehouse-web`. There is no shared package, on purpose; a package
for ~100 lines across two apps is not worth the infrastructure. **A fix to
either copy must be carried across to the other.** The differences today are
marked "Admin-only" in `phone.ts` and listed in `NOTES.md`.

Only the logic is shared. The field itself (`lib/auth/PhoneField.tsx`) is this
app's `Select` + `Input` at this app's density; do not port the bidder field's
look. It reaches the login screen through `AuthProvider.IdentifierInput`, so
`app/login/page.tsx` still knows nothing about phones.

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

**The create form's defaults are a product decision, not placeholders**, and two of them
changed on 2026-10-09 on stakeholder feedback:

- **`max_extensions: 1000`** — the API's own ceiling (`le=1000`), not a tuned figure. They want
  anti-snipe to keep firing for as long as people keep bidding, which is what "going, going,
  gone" means at a live sale. At the 300s/300s anti-snipe defaults beside it, 1000 extensions is
  days of possible extension, so read it as "until the bidding stops" rather than as a count
  anyone reaches. **Four nines was asked for and is not possible**: the backend refuses anything
  above 1000 with a 422, and raising that is a backend change nobody has asked for.

  ⚠️ **The cost, which is real and belongs with the decision.** Only each LOT's clock extends —
  the auction's own `ends_at` never moves — and an auction goes `ended` only once its last lot
  has finished. So invoicing for a whole sale now waits on its single most contested lot, which
  can be hours or days past the advertised close. It also means deferred counter-bids keep
  deferring for as long as extensions last, where before they stopped once the cap was spent.
  If that becomes a problem the answer is a shorter extension window, not a lower cap: the cap
  is what the stakeholders asked for and the window is what makes it expensive.

- **`commission_bps: 1500`** — 15%, the rate the approved invoice design prints and the one every
  sale has used. It was `0`, which meant an operator had to remember to set it on every auction
  and a forgotten one billed no commission at all. It stays editable until the first bid.

Neither changes the BACKEND's defaults (`AuctionCreateIn` still has `max_extensions=20`,
`commission_bps=0`). That divergence is deliberate for now — the portal is the only thing that
creates auctions, so the form default is the effective one, and changing the API default would
silently re-price any other caller. Worth revisiting if a second client ever creates auctions.

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

**A `deleted` account shows no Reactivate button**, which is that same rule
applied to a state that only became reachable on 2026-10-02, when users could
first close their own accounts (`DELETE /auth/me`). `status !== "active"` is no
longer the same as "suspended", and the backend refuses to reactivate a deleted
account — so the control is absent rather than present and failing, and a note
says what survived: name, contact details and addresses gone; bids, ledger and
deposit entries kept as financial records; `payment_reference` kept so a
historical bank line can still be matched.

**There is deliberately no admin delete control**, and the backend has no route
for one. An admin-initiated deletion is a different act — a POPIA request
arriving by email — and deserves its own handling rather than a button that
reuses the self-service path.

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
magnitude and the backend applies the direction: `payment` adds credit,
`refund` and the charge types subtract. A negative amount is not
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
entry-type labels (`lot_won` is "Lot won", `commission` is "Commission",
`reversal` is "Correction").

**There are TWO books, and the deposit one is not the ledger.** Security deposits
left the ledger on 2026-10-02. `LedgerEntryType.deposit` is retired — the backend
refuses a new one, so it is `postable: false` in `lib/format/ledger.ts` and
labelled "Deposit (historic)"; the member stays only because rows posted before
the split still have to render. Everything about a deposit now goes through
`/admin/users/{id}/deposit` and `/admin/deposit/{id}/reverse`, with its own
types, its own wording file (`lib/format/deposits.ts`) and its own panel
(`components/users/UserDeposit.tsx`).

Keep them separate. The duplication between the two format files and the two
panels is deliberate, exactly as it is in the backend: one shared "money panel"
with a type dropdown covering both books is how a deposit gets spent against an
invoice. `describeHeld` deliberately does not say "in credit" — a held deposit is
not credit, because it reduces nothing anyone owes.

**Which number answers which question.** `held_minor` is what the bid gate reads
and the only thing that makes someone eligible; `balance_minor` is what they owe
for lots. Winning a lot charges the ledger and cannot move the deposit, so
someone can owe money and still bid, and be in credit and still be refused.

**Both figures are in the user page's header strip, and that is what lets the
rest of the screen be tabbed** (2026-10-07). The deposit *panel* used to be
first, on the reasoning that "why can this person not bid" is the question an
operator arrives with and the balance is never the answer. That reasoning is
unchanged — but it was an argument against hiding the *figure*, not against
tabbing the work, and the screen had grown to five stacked panels. So the
numbers never move and the panels do:

| Tab | Holds |
| --- | --- |
| **Account** (default, no `?tab=`) | balance, Record money, invoices |
| **Deposit** | held, Record a deposit, movements |
| **Statement** | the ledger history and its reversals |
| **Details** | phone, email, ID number, payment reference, sessions |

**Record money and the invoice list are on one tab deliberately.** An allocation
rides on the same `POST /admin/users/{id}/ledger` as the payment, so they are one
request; splitting them would put half an operation on another tab.

`UserLedger.tsx` exports **two** components for this — `UserLedgerAccount` and
`UserStatement` — sharing one `useLedgerInvalidate` hook. Two copies of that
invalidation list is how a correction comes to move one tab's figure and not the
other's. Both read `useUserLedger`, and the header reads page 0 of each book, so
the same query key serves however many are mounted; switching tabs unmounts a
panel, which is exactly why the header figures have their own queries rather than
reading off a mounted child.

**Outstanding is a query too, and settling is just a `payment`.**
`GET /admin/outstanding` is computed from the ledger the same way participants
are — most owing first, `X-Has-More` and all. There is no mark-as-paid endpoint
and there should not be one: the row action posts an ordinary `payment` through
`POST /admin/users/{id}/ledger`, so the ledger keeps one write path and a
settlement is reversible like anything else. **Render `amount_owing_minor`, never
`-balance_minor`** — the magnitude is carried explicitly so a forgotten minus
sign cannot turn a credit into a debt on the screen the operator chases people
from. The amount and reference stay **editable in the confirm dialog**, because a
bank line rarely matches a balance to the cent and a one-click button beside a
list of names is how the wrong person gets credited.

The sidebar badge counts **people, not rands**: the operator works the list name
by name, a total moves without the worklist getting shorter, and no rand figure
is readable at badge size. The total belongs on the screen, where there is room.

**`payment_reference` is the default, everywhere money is recorded.** It comes
with the user record, so the ledger form and the mark-as-paid dialog both
pre-fill it — editable, since a mistyped bank line has to be correctable — and
it is shown on the user detail screen because it is what an operator quotes when
someone asks how to pay. It arrives after the form mounts, so the default is
reconciled during render and only while the field is untouched.

**Since 2026-10-05 an INVOICE asks for its own number instead**, so one bank line maps to one
document and the allocation is unambiguous. The per-person reference stays and is still the
right default here, because there is no invoice to name when someone pays a deposit in or tops
up on account — which is most of the money. The rule is the surface, not the person: *paying a
document* quotes the document, *paying onto an account* quotes the account. The invoice detail
screen therefore labels the snapshot **"Account reference at issue"** rather than "Payment
reference"; it is kept because payments made before the change quote it.

**The user detail screen shows `id_number`, and the user list deliberately does not.** It is
on the backend's detail shape only, the same way the list carries no address: a table of
identity numbers is a worse thing to leave on a screen than one record an operator opened
deliberately. It is free text — no checksum, no uniqueness, because a passport number is a
legitimate answer — so render it as given and never offer to validate it.

**Invoices are documents, and nothing on this portal edits one.** Added 2026-10-05. An invoice
bills ledger entries that already exist and never recalculates them — a document that recomputed
its total from the auction's current `commission_bps` would disagree with the ledger the day
someone edited that rate. So there is no edit, no delete and no regenerate route, and no screen
offers one: a mistake is corrected on the ledger, and the next invoice bills what is actually
owed. The only write is **issuing**, on the auction's own Invoices tab.

**The invoice detail shows what the DOCUMENT printed, not what the user record says today.**
`bill_to_first_name`, `bill_to_last_name`, `bill_to_id_number` and `bill_to_phone` are snapshots
taken at issue, labelled "(printed)" on screen for exactly that reason. An operator fielding
"this invoice has my old number on it" needs the frozen value; the live one is one click away
under "Billed to". They are on the **detail** shape only — the invoice list carries neither the
ID number nor the phone.

**`status` is not a column — do not render it from anything but the server.** Paid, part-paid and
overdue are derived from the allocations and the clock in one backend function, in one precedence
order: paid beats overdue beats part-paid. The `?unpaid=` filter is applied to that same
derivation, so a screen that worked the status out for itself would eventually disagree with the
rows it was handed. `INVOICE_STATUS_META` in `lib/format/status.ts` is labels and tones only, and
`InvoiceStatusBadge` renders it — the usual rule that `StatusBadge` is the single status→colour
map applies here too.

**One consequence of that derivation worth knowing: `?unpaid=true` filters AFTER the page is
read.** The server sums the allocations, then drops the settled rows, so a page can come back
shorter than the limit with more behind it and `X-Has-More` describes the query rather than the
rows. Page on `hasMore`, never on "did I get a full page", and the list says so on screen.

**Line amounts are positive magnitudes; the same charges are negative on the ledger.** There they
reduce a balance, here they are amounts owed, and a minus sign on a document reads as a credit.
`vat_number` and `tax_rate_bps` are snapshots taken at issue, never today's settings — a VAT
number that appeared on a document someone holds cannot be unprinted by editing configuration.

**An invoice becomes paid by ALLOCATING a payment, and there is no other way.** Settling is still
an ordinary `payment` entry through `POST /admin/users/{id}/ledger` — one write path, as before —
and `allocations` rides along on that same request, applied in the same transaction. A payment
that committed while its allocation did not would read as on-account credit against an invoice
still showing unpaid, and nothing on screen would distinguish that from an allocation the operator
forgot. A payment with no allocations is **on-account credit**, which is ordinary rather than an
incomplete request, so nothing in the control is required.

`components/invoices/AllocateToInvoices.tsx` is one component used by **both** payment forms — the
ledger screen and the outstanding list's Mark-paid dialog — and that is not tidiness. Most payments
are recorded from Outstanding, so allocation only on the ledger screen would mean invoices stay
unpaid while balances settle, the two numbers drifting apart for a reason nothing on screen
explains. It disappears entirely for someone with no open invoices.

**Over-allocating is refused, never clamped, in both directions** — more than the payment is
worth, or more than the invoice still owes — and the refusal takes the payment down with it. Both
forms check before submitting, so the operator fixes a number rather than losing the entry.

**`MarkInvoicePaidButton` settles one invoice from the row it is on** (2026-10-07), on all three
invoice lists: the console, the auction's Invoices tab, and the user's own Account tab. It is
**not** a mark-as-paid route and there still is not one — it posts the same ordinary `payment`
with the allocation riding along, reversible like any other entry. It exists because the
navigation was the whole cost: most invoices are settled one bank line at a time, and opening a
person's account for each is four clicks of travel around one click of work. It is on
`UserInvoices` too, which looks redundant until you picture making an operator leave the row in
front of them to settle it.

Three rules it carries:

- **The amount defaults to what is still outstanding**, floored at the document total. The floor
  cannot bite — `paid_minor` is summed from allocations and the server refuses an over-allocation,
  so outstanding is always within `[0, total]` — and it is written anyway, because the default
  lands in a `MoneyInput` that posts real money.
- **The allocation sent is `min(amount, outstanding)`, not the amount.** An operator who types more
  than this document owes gets the excess as on-account credit, which is ordinary and which the
  dialog says on screen. Sending the full amount would be an over-allocation, which is refused and
  takes the payment with it.
- **The reference defaults to the invoice NUMBER**, not the person's standing reference — the rule
  above about which surface quotes which, applied where it bites.

It renders nothing for a settled document, and that guard sits **after** every hook: an early
return above `useMutation` changes hook order between a paid row and an unpaid one, which is a
lint error and a real bug in a table whose rows change status under React.

⚠️ **There is no un-allocate and no allocation reversal, and none should be built.** An allocation
is not money: the ledger entry it points at is untouched and immutable, so an allocation whose
entry has been reversed simply stops counting. **Reversing the payment IS the correction**, which
the ledger already allows exactly once. That is why the table needs no second way to be wrong.

**"Bill anything outstanding" is safe to press repeatedly**, which is why it has no confirmation.
The worker already issues invoices when a sale ends, in the same transaction; the button is for
the leftovers, commonly a reserve accepted days later. It bills *unbilled* charges, so a second
press creates nothing and says so — and a unique index on the billed ledger entry makes that true
even if two operators press it at once.

**The PDF is streamed through the API, never a presigned URL**, so the download cannot be an
`<a href>`: `apiRequestBlob` carries the bearer token through the same single-flight refresh as
every other call. A presigned link is a bearer capability that survives being pasted into a chat,
and an invoice names a person and what they owe. The operator and the bidder share one renderer
and one stored object, so there can be no operator-only version of a document.

**Visibility is not a status, and not a frozen field.** `auctions.visibility` is
`public` or `private`, default private, and it is orthogonal to
`AuctionStatus` — a `live` auction may be either. Two consequences, both
load-bearing:

- **It does not go through `StatusBadge`.** That is the single status→colour
  map; visibility is a different axis, and two meanings sharing one visual
  language on one row is worse than two languages. The auctions table marks the
  **public** case only, with a 14px globe inside the existing line box:
  private is the default and the majority, and a mark on every row is one nobody
  reads. `PublicMark` in `components/auctions/VisibilityMark.tsx`.
- **The control sits outside `AuctionEditForm`**, beside the cover image, for
  exactly the reason the image does: that component is where the freeze rules
  live, and visibility is never frozen. It stays changeable mid-auction because
  an operator who published by mistake must be able to unpublish, and it should
  not queue behind the form's batched "Save changes".

**Lots inherit their auction's visibility — there is no per-lot flag.** Do not
add one; a second axis would make "can this be seen" the product of two
settings, and every query and test would have to cover the grid.

**Public is a second gate, not the only one.** A **draft** auction marked public
still 404s on `/api/v1/public/*`; publishing is a separate gate. An `ended` one
does return 200. The visibility panel says so for a draft rather than promising
browsing the API will not deliver.

**Going private on a live auction with bids gets a dialog.** It strands anyone
browsing anonymously and kills links already shared — a lot posted into a
WhatsApp group stops opening — and the API cannot explain itself, because a
private auction is indistinguishable from one that never existed. That dialog
deliberately has **no type-to-confirm and no reason field**: those belong to
cancel-auction and void-bid, which are irreversible and touch money. This is
reversible in one click and touches nothing, and ceremony out of proportion to
risk teaches operators to click through ceremonies. Going the other way needs no
dialog at all.

**Links into the bidder app are built in one place**,
`lib/config/bidder-app.ts`, from `NEXT_PUBLIC_BIDDER_APP_URL`. The bidder app's
canonical URL shape is still settling in that repository, so if it lands
differently this is one line rather than a search. The base falls back to
production, never to localhost: a share link is pasted to someone else, so a
localhost link is broken rather than merely degraded.

**Participants are a query, not a roster.** `GET /admin/auctions/{id}/participants`
is computed on read — there is no participant table, no registration and no
approval step, so **do not build an "approve" control**. Eligibility is the bid
gate's own rule: **the deposit we hold** covers the requirement, **or** the person
has already bid in that auction (voided bids included). It is earned once and not
revoked, so recording a deposit is what makes someone *new* eligible. The screen
defaults to the ineligible filter, which is exactly "never bid here and short of
the deposit", and every row links to that person's account.

The row shows `deposit_held_minor` **and** `balance_minor`, in that order. Both,
because an operator reading either one alone draws the wrong conclusion about why
a bid was refused; in that order, because only the first one decides it. Both come
from the one grouped query the backend already runs — there is nothing to fetch
per row.

**An eligible row with a shortfall is correct, not a bug.** `admitted_by_bid`
says a bid let them in; `has_bid` counts live bids only, so "voided only" is a
real row. Since the split, the way an admitted bidder ends up short is a
*refunded deposit* rather than a win. **Participants answers "can this person bid", never "who owes money".**
That is `/outstanding`. Do not surface debt here: two screens answering one
question is how they drift.

**The commission is basis points.** `commission_bps` of 1500 is 15%.
Operators enter a percentage and `parsePercentToBps` converts; the field always
echoes the stored bps back, because a rate that silently means a hundredth of
what was intended shows up on an invoice rather than in the form. Both
`deposit_amount_minor` and `commission_bps` **freeze once any lot has a
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

That whole sequence is `useDirectUpload` (`lib/api/use-direct-upload.ts`), sitting
on the transport rules in `lib/api/upload.ts`. It owns the validate → presign →
upload → confirm state machine, per-file progress, and the storage-vs-API error
wording. **Three callers now share it** — the lot gallery
(`components/lots/LotImages.tsx`), the auction cover image
(`components/auctions/AuctionImage.tsx`) and the lot create form
(`components/lots/LotCreateForm.tsx`) — each passing its own presign/confirm
callbacks. A fourth should do the same: do not copy the sequence, it is exactly
the kind of thing that drifts.

`upload()` returns a per-file outcome so a caller can act on the failures. The
create form needs that; the other two only render the progress rows.

**A lot has two status axes, and `progress` is the one that says whether bidders
can see it.** `status` is the lot's own state; `progress` (`live`,
`waiting_for_worker`, `waiting_for_auction_publish`, `needs_publish`,
`abandoned`, `terminal`) is what will move it next, and it is the only thing that
tells the three quite different `draft` cases apart. Both come from the API —
never re-derive either from the auction's status.

`LotProgressBadge` renders **nothing** when the progress only repeats the status
badge beside it: `live` next to "Live" is noise, and so is `terminal` next to
"Sold". What survives that rule is exactly the set a bidder cannot see, so a
progress badge on a row always means "this one is not on the market". It uses the
same map and the same tones as `StatusBadge`, because two colour languages on one
row would be worse than none.

**A lot added to an already-published auction is stranded until someone publishes
it.** The worker only opens `scheduled` lots and an auction that is not `draft`
cannot be published again, so `needs_publish` is a real state an operator must
resolve with `POST /admin/lots/{id}/publish` — from the lots table without
opening each one, since listing stock is repetitive. It is a confirmation and not
a one-click action for one reason, which the dialog states: publishing exposes
the lot, and the first bid freezes its starting price and reserve. `abandoned`
(a draft lot whose auction has finished) can never open, so it is shown as dead
and **never offered publish** — relisting is the way out. There is deliberately
no bulk publish: the backend has no bulk endpoint and looping single calls is
exactly what the lots toolbar already says it will not do.

**Both create forms collect images before the thing they belong to exists.**
Presign is scoped to a lot or an auction, so nothing can be uploaded until one
has been created. Lots and auctions therefore hold files locally — object URLs
for preview, order and primary chosen up front — and attach them immediately
after creation. Two rules follow, and they are the whole point:

- **A failed image never discards the created record.** The lot or auction is
  kept and said to exist; the photos that failed are reported with the
  storage-vs-API distinction and offered a retry in place, plus a link to the
  screen where the gallery already works. The operator has typed a title,
  description and prices — losing that over one photograph would be indefensible.
- **Revoke object URLs.** The lot form stays open for the next lot, so every
  discard path revokes: successful attach, removed thumbnail, cleared form,
  unmount. Twenty lots of held previews is a real leak, and photos surviving a
  reset would attach lot 7's pictures to lot 8.

### Demo sign-ins — the one superadmin-only screen

`/settings` → **Demo sign-ins** (`components/settings/DemoLogins.tsx`). Phone OTP is the only
way into this product, so an app store reviewer cannot sign in at all; a demo sign-in gives
one number a fixed code and no SMS. The backend is the authority — see its CLAUDE.md under
*Demo sign-ins* for the model, the never-retrofit guard and the rate-limit note.

**The portal generates the code, and that is a decision rather than convenience.**
`components/settings/demo-code.ts` draws six digits from `crypto.getRandomValues` and refuses
the same shapes the backend refuses — a single repeated digit, a consecutive run — because the
portal picks the code, so a generator that can produce something the API rejects turns a
one-click action into a confusing 422. **Those rules are duplicated on purpose and must stay in
step**; the backend remains the authority and this only keeps us from asking for a no. Bytes
above 249 are discarded rather than taken `% 10`, which would make 0–5 likelier than 6–9: a
measurable bias is not theoretical in a code that never expires.

⚠️ **Six digits is a constant at every end, not a setting.** `LENGTH` here, `OTP_CODE_LENGTH` in
the backend's `app/core/config.py`, and literals in both bidder clients. It was briefly a
per-client env var set to `4` locally, which is exactly how this generator came to produce codes a
local bidder build could not accept — the backend now owns the number and refuses a dev code of
any other length. Changing it means changing every end in one release.

⚠️ **The code is shown twice and then never again.** The backend stores a one-way HMAC, so
nothing can read it back — not the screen, not the API, not the database. It is on the create
form (the operator wants it in App Store Connect before pressing anything) and again on the
confirmation step, whose only job is to say that this is the last time. A lost code is replaced
by removing the row and creating another; there is no recovery and the dialog says so rather
than implying one.

A new code is drawn on every opening of the dialog, including after a cancel. Reusing one
across two numbers would make a single leak open two accounts.

**`last_used_at` is rendered as "never" rather than left blank.** It is the only thing that
distinguishes a row that can be removed with confidence from one a review may be depending on,
and blank reads as missing data. It is **not** a usage cap.

**Settings is hidden from an ordinary admin, not shown disabled.** The sidebar's
`disabledReason` is for state the operator can change ("open an auction to see its lots"), and
a role is not that — a greyed-out item they can never use is a standing question with no
answer. The page itself still renders a refusal rather than redirecting, because an admin who
followed a link from a superadmin deserves an answer, and `useDemoLogins` is gated in `enabled`
so they never fire a request that returns 403 and surfaces as an error state.

**That gating lives in two places today and should collapse to one.** Everything on `/settings`
is superadmin-only, so the nav item, the page and the query are all conditional. The moment a
section an ordinary admin should see is added, the gate moves down to the demo sign-ins section
and the nav item stops being conditional. The current arrangement is the smaller of the two, not
a claim that settings are inherently privileged.

**It is deliberately not in the command palette.** The palette's static list is a curated
subset — Outstanding and Invoices are not in it either — and a destination most operators
cannot reach does not belong in a search everyone uses.

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
components/     feature components by area: auctions, lots, users, monitor, settings, app-shell
lib/api/        transport, authenticated client, one function per endpoint, query hooks
lib/auth/       session, refresh, device id — isolated and swappable
lib/realtime/   WebSocket client and the monitor's event folding
lib/format/     money, dates, statuses, increments, server-anchored clock
lib/ui/         small client-side stores and hooks
types/api.ts    every API shape as a zod schema with its inferred type
```

## Running it

```bash
npm run dev        # http://localhost:3410
npm run typecheck  # tsc --noEmit
npm run lint       # eslint, including the React Compiler rules
npm run build
```

**`dev` and `start` are pinned to port 3410 and must stay there.** 3410 is the
origin the backend allows for this app; 3400 belongs to the bidder app. On any
other port every preflight is rejected with a bare 400 and no CORS headers,
which the browser reports as an opaque network failure — indistinguishable from
the backend being down, and a genuinely confusing hour if you do not know it.

**Reversal, 2026-10-01: this was pinned to 3100 (bidder app 3000, API 8000) and
that pin said it must stay there.** The rule never was about 3100 — it is about
matching `CORS_ALLOWED_ORIGINS` exactly — and a second product on this machine
now holds `:3000` and `:8000`, so Consignment Warehouse moved to its own dev
block: **API 8400, bidder web 3400, this portal 3410.** The backend's allowlist
default moved with it. The failure mode above is unchanged, and **production is
untouched**.

**The same rule applies in production, at a new address.** The portal is served
from `https://admin.consignment-warehouse.com` and the API's
`CORS_ALLOWED_ORIGINS` carries that string and the bidder app's apex, matched
exactly — never a wildcard, never a prefix. A trailing slash, a `www.` in front
of `admin.`, or `http` instead of `https` is a different origin and fails
identically to the wrong port locally. The refresh cookie is `SameSite=Lax` and
is set on `api.consignment-warehouse.com`; it reaches the portal only because
`admin.`, the apex and `api.` share the registrable domain
`consignment-warehouse.com`. Serving this app from anywhere else — an
`amplifyapp.com` address, a vanity domain — makes that cookie cross-site and the
session dies on the first reload. See `terraform/README.md`.

The backend must be running: `make dev-all` (API plus the lifecycle worker that
opens and closes lots — without it nothing ever closes, so the monitor and the
decisions queue have nothing to show), `make seed`, and object storage up for images.

While the backend runs with `APP_ENV=local` the **OTP code is always `000000`**.
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
  not fake it by looping single calls client-side. This includes publishing:
  publish is per-row, however many lots need it.
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
