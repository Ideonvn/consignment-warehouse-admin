# Admin portal — how it works, and how to test it

Two documents in one. The first half explains every screen and what each field actually does. The
second half is a test plan with expected results, built around the seeded dataset so you spend your
time testing rather than setting things up.

Read the first half once. Work through the second half with both apps open.

---

## Before you start

From the backend repo:

```bash
make dev-all      # the API *and* the lifecycle worker
make seed-fresh   # wipe and rebuild the test dataset
```

**`make dev-all`, not `make dev`.** The lifecycle worker is a separate process, and it is what
opens auctions at their start time, closes lots when the clock runs out, decides whether each one
sold, and raises the ledger charges for winners. Without it nothing opens or closes, the Decisions
queue stays empty, and no statement ever shows a purchase.

MinIO must be up (it comes with the dev dependencies) or images fail.

Then here:

```bash
npm run dev       # http://localhost:3100
```

**Port 3100 is not optional.** The backend allows `localhost:3000` (bidder app) and `localhost:3100`
(this one) as origins. On any other port every request fails with an opaque network error that looks
exactly like the backend being down.

Handy when you get rate-limited during testing: **`make reset-limits`** in the backend clears the
OTP, WebSocket-ticket and bid counters instantly. You never need to wait an hour.

### The seeded dataset

`SEED.md` in the backend repo is generated on every seed and lists every account, every auction, and
a "start here" table pointing at the interesting lots. **Keep it open while you test.** The numbers
below are stable across seeds, but the exact lot ids are not.

The OTP is **`0000`** for every account.

| Phone | Role |
|---|---|
| `+27820000000` | superadmin — the only account that can change roles |
| `+27820000001` | admin — everyday operator work |
| `+27820000005/6/7` | more admins |
| `+27820000002/3/4` | bidders with R20 000 credit each |

Five auctions, one per lifecycle state:

| Slug | Status | Deposit | Premium | What it is for |
|---|---|---|---|---|
| `winter-estate-draft` | draft | R2 500 | 15% | Must never appear in the bidder app |
| `autumn-jewellery-scheduled` | scheduled | R5 000 | 10% | Opens a few minutes after seeding |
| `spring-collectables` | live | **R0** | 15% | The main testing ground — ungated, so anyone can bid |
| `midweek-closing-soon` | live | R1 000 | none | Closes minutes after seeding |
| `summer-antiques-ended` | ended | R2 000 | 15% | Populates the Decisions queue |

**Two auctions are time-sensitive.** `midweek-closing-soon` closes about eight minutes after you
seed, and `autumn-jewellery-scheduled` opens about four minutes after. If you want to watch either
happen, re-seed first.

---

## The shell

**Sidebar** — Auctions, Lots, Monitor, Decisions, Users.

*Lots* and *Monitor* follow whichever auction you are working inside; with none selected they are
disabled and say why. *Decisions* carries a count badge — lots that closed below their reserve and
are waiting on you. It is the one number worth checking daily.

**Top bar** — the current auction, the connection indicator, and the theme control (Light / Dark /
System). Light is the default; dark is for working in the evening. The connection indicator refers
to the live WebSocket: quiet when healthy, and if it speaks, the Monitor's figures may be a moment
behind.

---

## Money: the account model

Every bidder has **one running balance**, not a wallet per auction. Positive means they are in
credit, negative means they owe. Deposits and payments add credit; winning a lot subtracts.

R10 000 deposited then R12 000 won leaves them at **−R2 000** — they owe you R2 000. Or they pay the
full R12 000 and keep R10 000 on account as the deposit for the next auction. There are no buckets
and nothing to reconcile between them; there is only ever one number per person.

**Each auction states what a bidder must have on account to bid in it.** Bigger lots, bigger
deposit. Someone with standing credit from a previous auction is automatically eligible for the next
one — you do not approve anybody.

**Two rules that shape everything you can do here:**

**The ledger is append-only.** Nothing is ever edited or deleted. A mistake is corrected by posting
a **reversal** that points at the original, leaving both on the record. That is what lets a
statement be reconciled against a bank statement. There is no edit button, and if a screen looks
like it wants one, the answer is a reversal. An entry can be reversed once; a second attempt is
refused.

**You enter a positive amount and the type decides the direction.** A deposit always adds credit; a
refund always subtracts. There is no plus/minus control anywhere and a negative amount cannot be
typed. `adjustment` is the one exception — it has no inherent direction, so it makes you choose
credit or debit explicitly.

---

## Auctions

### The list

Every auction including drafts, which bidders never see.

| Status | Meaning |
|---|---|
| `draft` | Being built. Invisible to bidders. Fully editable. |
| `scheduled` | Published, waiting for its start time. |
| `live` | Open. Bidders can see and bid. |
| `ended` | Every lot has finished. |
| `cancelled` | Called off. |
| `settled` | Reserved for settlement, which is not built yet. |

### Creating one

| Field | What it does |
|---|---|
| **Name** | What bidders see. |
| **Slug** | URL-safe identifier — lowercase, numbers, hyphens. Auto-generated, overridable, unique. |
| **Description / image** | Optional. The image can be uploaded or linked from a URL — both are first-class. |
| **Starts at** | When the worker flips it to `live` and its lots open. |
| **Ends at** | The baseline close for **every lot in it**. Each lot copies this at creation. |
| **Currency** | ISO code, defaults to ZAR. |
| **Deposit** | What a bidder must have on account to bid here. Zero means ungated. |
| **Buyer's premium** | A percentage added to the hammer price and charged to the winner. Stored as basis points — 1500 is 15%. Zero means none. |
| **Anti-snipe window** | A bid inside this many seconds of a lot's close moves the close. Default 300. |
| **Anti-snipe extension** | How much time that bid adds. Default 300. |
| **Max extensions** | The cap. Past it, bids are still accepted right up to the deadline; they just stop moving it. |

Times display in **your local zone with the zone named** and submit as UTC. Check the zone label
before saving a close time.

### Anti-snipe, in plain terms

Without it the winner is whoever bids last-second. With it, a late bid gives everyone a few more
minutes, and the lot closes only once bidding actually stops.

**The extension applies per lot, not to the auction.** A contested lot moves its own clock; nothing
else is affected. Otherwise one hot item would hold the whole sale open.

### Publishing

A checklist that only enables when all three pass: **has at least one lot**, **opens in the future**,
**closes after it opens**. Publishing moves the auction to `scheduled` and its draft lots with it.

### Cancelling

Requires a reason and typing the auction name. Cascades to lots and tells anyone watching. Refused
if a lot already ended sold — settle those first.

### Editing, and what freezes

Everything is editable while nothing has been bid on. After that:

| Freezes when | Fields |
|---|---|
| **Any lot in the auction has a bid** | Currency, deposit, buyer's premium, anti-snipe window, anti-snipe extension, max extensions |
| **The auction goes live** | Starts at |

Frozen inputs are disabled with the reason shown. If one slips through, the server refuses it and the
form highlights that field.

**Why the money fields freeze:** raising the premium after bidding starts changes what someone owes
for a lot they have already bid on. Raising the deposit is worse — it retroactively disqualifies
bidders who are currently winning, whose automatic bids keep running but who can no longer respond
by hand. The escape hatch for either is a per-user ledger adjustment.

### Changing the close time

Changing **Ends at** moves every lot that has not ended.

Lots that earned anti-snipe extensions **keep them**. A lot due at 17:00 that had been pushed to
17:15 lands at 19:15 when you move the auction to 19:00 — the fifteen earned minutes travel with it.
Lots that already ended are untouched.

**Shortening an auction with live bidding** needs a separate, deliberately uncomfortable
confirmation, and tells you how many lots are affected. Afterwards the response reports how many
lots were rescheduled or cancelled. Read it.

### Increments

The price steps by **bands**, not a fixed amount. The band with the highest floor at or below the
current price wins. Global defaults, in rands:

| From | Step |
|---|---|
| R0 | R10 |
| R500 | R50 |
| R5 000 | R250 |
| R50 000 | R1 000 |

An auction with no rules of its own uses these. Adding **one** rule means that auction now uses
**only its own** — so add the full ladder, not a single band. Deleting the last one restores the
global fallback, with a warning first. An individual lot can override everything with a single fixed
increment; that is an escape hatch, not the normal path.

---

## Lots

| Field | What it does |
|---|---|
| **Title / description** | What bidders read. |
| **Starting price** | Where bidding opens. The first bid is *at* this price, not above it. |
| **Reserve price** | Optional, secret. Below it you are not obliged to sell. Bidders see only "reserve not met". |
| **Bid increment** | Leave on *use auction increments* unless this lot genuinely needs a fixed step. |
| **Lot number** | Auto-assigned; set your own if you number your stock. Duplicates refused. |

The create form **stays open and resets** so you can list a pile of items in one sitting.

| Status | Meaning |
|---|---|
| `draft` | Not published. |
| `scheduled` | Published, waiting to open. |
| `live` | Open for bidding. |
| `ended_sold` | Closed with a winner. The winner has been charged. |
| `ended_unsold` | Closed with no bids. |
| `ended_reserve_not_met` | Closed with bids below the reserve. **Waiting on you** — appears in Decisions. |
| `withdrawn` | Pulled by an operator. |
| `cancelled` | The auction was cancelled. |

**Once a lot has a bid**, its starting price, increment, **reserve** and both close times freeze.
Title, description and images stay editable. The reserve is frozen deliberately: if you set it too
high, the fix is accepting the top bid after the close, not moving the goalposts mid-auction.

**Withdraw** — the escape hatch for a bad item, allowed even with bids. History stands, automatic
bidding stops, watchers are told. Requires a reason.

**Delete** — only a `draft` lot with no bids. Anything else must be withdrawn.

**Relist** — copies an unsold, withdrawn or reserve-not-met lot into another auction as a fresh
draft, with description and images but **no** bids, history or extensions. The new lot links back to
the original.

### Images

Photos go from your browser straight to storage; the API never handles the bytes. JPEG, PNG, WebP.
Drag to reorder. One image is **primary** — the one bidders see on the card. If none is flagged, the
lowest position is used, so a card can never render blank.

Auction cover images work the same way, and can also be a pasted URL. Three states, and the screen
tells you which: no image, an external link someone else hosts, or a file you uploaded.

If a file is too large, storage rejects it directly — that wording differs from a validation error
on purpose, because it means the bytes never landed.

### Bid history and voiding

Newest first, with pseudonymous handles. Bids marked automatic were placed by the proxy engine on
someone's behalf — that is why the price sometimes moves with nobody acting.

**Void** rewrites a financial record. It requires a reason, recalculates the lot's leader and price
from the remaining bids, and if the lot had already been won, **posts reversals of the winner's
charges**. Voiding the winning bid promotes the next one.

---

## Monitor

The live view while an auction runs. Current bid, count, countdown and leader for every lot,
updating as bids land. New bids pulse. Extensions are called out — that is anti-snipe firing.

If the connection drops and returns with a gap too large to replay, the screen reloads its figures
over the API and says so. That message is deliberate: silently reconciled numbers are a lie about
how fresh they are.

---

## Decisions

Every lot that closed below its reserve, across all auctions, soonest-closed first. Reserve, top
bid, **shortfall**, bidder and close time.

**Accept reserve** — sell anyway at the top bid. The confirmation shows the shortfall, because you
are knowingly selling under. Promotes the bid to won, the lot to sold, and charges the winner.

**Relist** — put it in another auction as a fresh draft.

Doing nothing is also valid; the lot waits.

---

## Users and their ledgers

Search by phone or name, filter by status and role. Detail shows their activity — bids placed, lots
bid on, lots currently winning, active sessions — and their **ledger**.

The balance is stated as a sentence: *"R2 000,00 owing"* or *"R10 000,00 in credit"*. Below it, the
statement: what each entry was, when, the amount, the reference, and the balance after it.

**Recording a payment** is the daily job. You check the bank, see a deposit, record it here: type,
amount, reference, description. The balance moves immediately, and if that person was short for an
auction, they become eligible the moment you save — no approval step.

**Reversing an entry** is the correction path. It requires a reason, and the confirmation says
plainly that the original stays on the record with a correcting entry added. An entry already
reversed cannot be reversed again.

**Suspend** ends every session immediately, including any open live connection, and blocks sign-in.
Existing bids stand — financial records, not privileges. **Reactivate** lets them sign in again but
does not restore old sessions. **Change role** is superadmin-only; a plain admin does not see the
control at all. Nobody can change their own role, and the last superadmin cannot be demoted or
suspended.

---

## Participants

On an auction: who can and cannot bid in it. Name, handle, balance, what this auction requires, the
shortfall, and whether they have bid. It defaults to the **ineligible** list, because that is the
working list — the people to chase.

**There is no approval step and no participant table.** This is computed live from balances. Record
someone's deposit and they become eligible immediately; that is the whole workflow.

---

## Things that surprise people

**Bidding is proxy bidding.** A bidder enters the most they will pay; the system bids the minimum
needed on their behalf, up to that ceiling. The visible price can climb with nobody acting — that is
two hidden maximums competing.

**A bid can be outbid the instant it is placed**, if a rival's ceiling is higher.

**Status lags the clock by a few seconds.** Between a lot's close passing and the worker's next pass
it still reads `live` while bids on it are already refused. Trust the countdown.

**The reserve is never visible to bidders** — only a "reserve met" flag. It appears in exactly one
place in this app: lot detail.

**A winner is charged automatically** when their lot closes: the hammer price, and a separate
buyer's premium line if the auction has one. You do not raise those by hand.

---

# Test plan

Work through these in order. Each says what to do and what should happen. Anything that does not
match is worth writing down.

You want three browser contexts: this portal as admin, and two bidder windows on `localhost:3000`
signed in as **different** bidders — use a private window for the second.

Re-seed first (`make seed-fresh`) so the time-sensitive auctions are fresh.

## A. Orientation

**A1 — Sign in** as `+27820000001`, code `0000`.
*Expect:* the auctions list showing all five seeded auctions, including the draft.

**A2 — Sign in as a bidder here** (`+27820000002`).
*Expect:* a clear "no admin access" screen, not a console full of 403s. Sign back in as admin.

**A3 — Open `spring-collectables`.**
*Expect:* 29 lots, prices spread across the increment bands, thumbnails on most.

## B. Money — the newest code, test it hardest

**B1 — Open `+27820000015`'s ledger** (Refilwe Molefe).
*Expect:* deposit, payment, both adjustment directions and a refund. Charges and credits visually
distinct. Running balance ending at R11 400.

**B2 — Open `+27820000016`'s ledger** (Anele Jacobs).
*Expect:* a reversal shown as its own line — **not** netted away against the entry it corrects — and
labelled as a correction rather than "reversal".

**B3 — Open `+27820000020`'s ledger** (Kagiso Maseko, −R65 392,50).
*Expect:* the balance stated as **owing**, in plain language. A `lot_won` charge and a separate
`buyers_premium` charge, not one combined line.

**B4 — Record a deposit** of R1 000 for `+27820000026`.
*Expect:* no plus/minus control anywhere. The balance moves immediately. Try to type a negative
amount — it should be impossible, not merely rejected.

**B5 — Reverse that deposit.**
*Expect:* a reason required. Both entries remain visible afterwards; the balance returns.

**B6 — Reverse the same entry again.**
*Expect:* a clear message that it has already been reversed, not a generic error.

**B7 — Post an adjustment.**
*Expect:* it forces you to choose credit or debit. The other entry types do not offer that choice.

**B8 — Open Participants on `autumn-jewellery-scheduled`** (R5 000 deposit).
*Expect:* defaults to the ineligible list. `+27820000013` (exactly R5 000) is **eligible**;
`+27820000014` (R4 999,99) is **not**, with a shortfall of one cent. That boundary is where this
screen and the bid gate must agree.

**B9 — Record one cent for `+27820000014`, then re-check the list.**
*Expect:* they flip to eligible with no approval step.

**B10 — Look for an "approve" control anywhere.**
*Expect:* there isn't one. Eligibility follows from the balance.

## C. Auctions

**C1 — Create an auction.** Starts ~2 minutes out, ends ~20 minutes out. Set a **deposit of
R3 000** and a **premium of 12,5%**.
*Expect:* the premium field echoes what was stored in basis points (1250). After saving, reopen it
and confirm **both values persisted** — this specific round-trip has been broken before.

**C2 — Try to publish it empty.**
*Expect:* blocked by the checklist.

**C3 — Add three lots.** R100 each, one with a **reserve of R5 000** you know will not be met.

**C4 — Upload images** to two of them. Reorder. Change which is primary.
*Expect:* controls visible without hovering, exactly one primary at a time.

**C5 — Set the auction's cover image**, first by uploading, then replace it with a pasted URL.
*Expect:* the state label changes each time. Try `ftp://example.com/x.png` — refused inline.

**C6 — Publish, then wait for the start time.**
*Expect:* it goes `live` on its own within seconds. If not, the worker is not running.

**C7 — Bid on one of its lots** from a bidder window with enough credit, then return here and try to
change the deposit or the premium.
*Expect:* both disabled with the reason. The other bidding rules too.

**C8 — Change Ends at** to a couple of minutes further out.
*Expect:* a confirmation showing what will move, then a count of rescheduled lots. Bidder countdowns
update without a refresh.

**C9 — Shorten it** while it has live bidding.
*Expect:* a separate, harder confirmation naming the affected lot count.

## D. Lots and images

**D1 — Open `spring-collectables` lot 9** (255 bids).
*Expect:* history pages rather than loading everything. Automatic bids distinguishable. No maximums
shown for anyone.

**D2 — Open lot 3 of any auction** (no images).
*Expect:* a sensible placeholder, and the card is fine in the bidder app too.

**D3 — Open lot 4 of any auction** (images, none flagged primary).
*Expect:* the lowest-position image acts as primary, in both apps.

**D4 — Open lot 5** (6 images, primary is not the first).
*Expect:* the flagged image leads, not the first by position.

**D5 — Open lot 7** (R333 increment override).
*Expect:* the override shown, and the bidder app's minimum next bid steps by R333.

**D6 — Withdraw a lot that has bids.**
*Expect:* the dialog states the bid count and that bidders will be told. History survives.

**D7 — Try to delete a lot with bids.**
*Expect:* refused, withdraw offered instead.

**D8 — Void the winning bid** on a `summer-antiques-ended` lot that sold.
*Expect:* leader and price recalculate. **Then check the winner's ledger** — the `lot_won` and
`buyers_premium` charges should have reversals against them.

## E. Live monitoring

**E1 — Open the Monitor** on `spring-collectables` and bid from a bidder window.
*Expect:* it appears within a moment, pulsing. Leader handle updates.

**E2 — Bid inside the anti-snipe window** on `midweek-closing-soon`.
*Expect:* the countdown jumps out and the extension is visibly marked.

**E3 — Drop the network briefly**, bid from the other window, reconnect.
*Expect:* the Monitor catches up, or reloads and says so. **Compare its price against the bidder
app** — they must agree.

## F. Decisions

**F1 — Open Decisions.**
*Expect:* `summer-antiques-ended` lots 3, 4 and 5, with reserve, top bid and shortfall. The sidebar
badge matches the row count.

**F2 — Accept the reserve on one.**
*Expect:* the shortfall stated explicitly in the confirmation. Afterwards the lot is sold, it leaves
the queue, and **the winner is charged** — check their ledger for both lines.

**F3 — Watch the bidder app** while you do it.
*Expect:* the bidder sees it update live, without navigating away and back.

**F4 — Relist another one** into your new auction.
*Expect:* a fresh draft with description and images, no bids, no extensions, and a link back.

## G. Users

**G1 — Search `0000001`.**
*Expect:* partial phone matching works.

**G2 — Suspend `+27820000002`** while they are signed in on the bidder app.
*Expect:* their session ends promptly. They cannot sign back in. **Their bids remain.**

**G3 — Reactivate them.**
*Expect:* they can sign in again.

**G4 — As a plain admin, look for the role control.**
*Expect:* not shown.

**G5 — Sign in as `+27820000000`** and change a bidder to admin.
*Expect:* works. Changing your own role is refused; demoting yourself as the last superadmin is
refused.

## H. Presentation

**H1 — Switch to Dark** and walk every screen: auctions, lot detail with frozen fields disabled, the
uploader, a destructive dialog, the Monitor, Decisions, a ledger, Participants.
*Expect:* legible throughout, statuses still distinguishable, disabled inputs still obviously
disabled, charges and credits still distinct.

**H2 — Set to System** and change your OS theme.
*Expect:* follows immediately, no reload, no flash.

---

## Recording what you find

Note the step, what you expected, what happened, and whether it reproduces. For any figure that
looks wrong, **check the same figure in the bidder app first** — knowing whether both are wrong or
only one narrows it enormously. For anything about money, check the ledger too: the ledger is the
source of truth and a screen disagreeing with it is a different bug from the ledger itself being
wrong.
