# Admin portal — how it works, and how to test it

Two things in one document. The first half explains every screen and what each field actually
does. The second half is a numbered test plan with expected results, so you can walk the whole
system and spot anything odd.

Read the first half once. Work through the second half with both apps open.

---

## Before you start

Three things need to be running, from the backend repo:

```bash
make dev-all    # the API *and* the lifecycle worker
make seed       # test accounts and a sample auction
```

MinIO also needs to be up (it comes with `make dev-all`'s dependencies) or image upload will fail.

**`make dev-all`, not `make dev`.** The lifecycle worker is a separate process, and it is what
opens lots when an auction starts, closes them when the clock runs out, and decides whether each
one sold. Without it nothing ever opens or closes, the Decisions queue stays permanently empty,
and you will spend an hour thinking the app is broken.

Then, in this repo:

```bash
npm run dev     # http://localhost:3100
```

**Port 3100 is not optional.** The backend only allows `localhost:3000` (the bidder app) and
`localhost:3100` (this one) as origins. On any other port every request fails with an opaque
network error that looks exactly like the backend being down.

### Accounts

While the backend runs locally, **the OTP code is always `0000`**. You never need to read it from
a log.

| Phone | Role | Use it for |
|---|---|---|
| `+27820000000` | superadmin | Changing anyone's role |
| `+27820000001` | admin | Everyday operator work |
| `+27820000002/3/4` | bidders | Bidding from the web app |

Numbers must be full E.164 — `+27820000001`, not `082...`. The backend does not guess a country.

---

## The shell

**Sidebar** — Auctions, Lots, Monitor, Decisions, Users.

*Lots* and *Monitor* follow whichever auction you are currently working inside. There is no
meaningful "all lots" screen, so when no auction is selected they are disabled and say why.

*Decisions* carries a count badge. That number is lots that closed below their reserve and are
waiting for you to decide what happens. It is the one number worth glancing at every day.

**Top bar** — the current auction context, the connection indicator, and the theme control
(Light / Dark / System). Light is the default; dark exists for working in the evening.

The connection indicator refers to the live WebSocket. It is quiet when healthy. If it says
anything, the figures on the Monitor may be a moment behind.

---

## Auctions

### The list

Every auction including drafts, which bidders never see. Filter by status, search by name.

**Status means:**

| Status | What it means |
|---|---|
| `draft` | Being built. Invisible to bidders. Fully editable. |
| `scheduled` | Published and waiting for its start time. |
| `live` | Open. Bidders can see and bid on its lots. |
| `ended` | Every lot has finished. |
| `cancelled` | Called off. |
| `settled` | Reserved for payment/settlement, which is not built yet. |

### Creating one

| Field | What it does |
|---|---|
| **Name** | What bidders see. |
| **Slug** | The URL-safe identifier — lowercase letters, numbers and hyphens. Auto-generated from the name; you can override it. Must be unique. |
| **Description / image** | Optional, shown to bidders on the auction card. |
| **Starts at** | When the worker flips it to `live` and its lots open. |
| **Ends at** | The baseline close time for **every lot in it**. Each lot copies this when it is created. |
| **Currency** | ISO code, defaults to ZAR. |
| **Anti-snipe window** | If a bid lands within this many seconds of a lot's close, the close moves. Default 300 (5 min). |
| **Anti-snipe extension** | How much time that bid adds. Default 300. |
| **Max extensions** | The cap. After this many, bids are still accepted right up to the deadline — they just stop moving it. Default 20. |

Times are entered and displayed in **your local timezone with the zone named**, and submitted as
UTC. Check the zone label before saving a close time.

An auction starts as `draft`. Nothing is visible to bidders until you publish.

### Anti-snipe, in plain terms

Without it, the winner is whoever bids in the last second. With it, a late bid gives everyone else
a few more minutes to respond, and the lot only closes once bidding actually stops.

**The extension applies per lot, not to the auction.** A contested lot moves its own clock; every
other lot in the auction is unaffected. That is deliberate — otherwise one hot item would hold the
whole sale open indefinitely.

### The Overview / Lots / Increments tabs

**Overview** — status, dates, a countdown, and the actions: Edit, Publish, Cancel.

**Lots** — everything in this auction. Covered below.

**Increments** — how much the price steps up. Covered below.

### Publishing

Publish shows a checklist and only enables when all three pass:

- **Has at least one lot**
- **Opens in the future**
- **Closes after it opens**

Publishing moves the auction to `scheduled` and its draft lots to `scheduled` too. From there the
worker opens everything at the start time.

### Cancelling

Requires a reason and typing the auction name. It cascades to the lots and tells anyone watching.
It is refused if a lot has already ended sold — settle those first.

### Editing, and what freezes

Everything is editable while nothing has been bid on. After that:

| Freezes when | Fields |
|---|---|
| **Any lot in the auction has a bid** | Currency, anti-snipe window, anti-snipe extension, max extensions |
| **The auction goes live** | Starts at |

Frozen inputs are disabled with the reason on screen. If one slips through, the server refuses it
and the form highlights that specific field.

**Why:** bidders committed money under those terms. Changing the anti-snipe rules mid-auction
changes what they agreed to.

### Changing the close time — read this before you do it

Changing **Ends at** moves every lot that has not already ended.

Lots that earned anti-snipe extensions **keep them**. If a lot was due at 17:00 and had been pushed
to 17:15, moving the auction to 19:00 puts that lot at 19:15 — the fifteen earned minutes travel
with it. Lots that already ended are untouched; their clocks are history.

**Shortening an auction that has live bidding** requires a separate, deliberately uncomfortable
confirmation. It truncates bidding people are in the middle of. The dialog tells you how many lots
are affected.

After saving, the response tells you how many lots were rescheduled or cancelled. Read it.

### Increments

The price does not step up by a fixed amount — it steps by **bands**. Under R500 it might move in
R10 steps; over R5 000 in R250 steps. The band with the highest floor at or below the current price
wins.

The seeded defaults, in rands:

| From | Step |
|---|---|
| R0 | R10 |
| R500 | R50 |
| R5 000 | R250 |
| R50 000 | R1 000 |

An auction with no rules of its own uses these global defaults. Adding **one** rule to an auction
means that auction now uses **only its own** rules — so add the full ladder, not a single band.
Deleting the last one restores the global fallback, and the UI warns you before that happens.

An individual lot can override the whole thing with a single fixed increment. That is a per-lot
escape hatch, not the normal path.

---

## Lots

A lot is one item. Everything a bidder sees is a lot.

### Creating them

| Field | What it does |
|---|---|
| **Title / description** | What bidders read. |
| **Starting price** | Where bidding opens. The first bid is at this price, not above it. |
| **Reserve price** | Optional, secret. Below this you are not obliged to sell. Bidders see only "reserve not met", never the number. |
| **Bid increment** | Leave on *Use auction increments* unless this lot genuinely needs a fixed step. |
| **Lot number** | Auto-assigned; set it yourself if you number your own stock. Duplicates are refused. |

The create form **stays open and resets** so you can list a pile of items in one sitting, with a
running list of what you have added.

### Lot status

| Status | Meaning |
|---|---|
| `draft` | Not published yet. |
| `scheduled` | Published, waiting to open. |
| `live` | Open for bidding. |
| `ended_sold` | Closed with a winner. |
| `ended_unsold` | Closed with no bids. |
| `ended_reserve_not_met` | Closed with bids, but below the reserve. **Waiting on you** — appears in Decisions. |
| `withdrawn` | Pulled by an operator. |
| `cancelled` | The auction was cancelled. |

### What freezes on a lot

Once **this lot** has a bid: starting price, increment, **reserve**, and both close times. Title,
description and images stay editable.

The reserve is frozen on purpose. If you set it too high, the fix is to accept the top bid after the
close — not to move the goalposts while people are bidding.

### Withdraw, delete, relist

**Withdraw** — the escape hatch for a bad item. Works even with bids. The bid history stands as a
record, automatic bidding stops, and watchers are told. Requires a reason.

**Delete** — only for a `draft` lot with nothing bid on it. Anything else must be withdrawn.

**Relist** — copies an unsold, withdrawn or reserve-not-met lot into another auction as a fresh
draft. Copies the description and images. Copies **no** bids, no bidding history, no extensions. The
new lot links back to the original.

### Images

Photos go straight from your browser to storage; the API never handles the bytes.

Drag and drop, or pick multiple files. JPEG, PNG and WebP. Drag thumbnails to reorder. One image is
**primary** — the one bidders see on the card. If none is marked, the first by position is used, so a
card can never render blank.

If a file is too large, storage rejects it directly. That error wording differs from a validation
error on purpose: it means the bytes never landed.

### Bid history and voiding

Every bid on the lot, newest first, with the bidder's pseudonymous handle. Bids marked automatic
were placed by the proxy engine on someone's behalf — that is why the price sometimes moves without
anyone doing anything.

**Void** rewrites a financial record. It requires a reason, and it recalculates the lot's leader and
price from the remaining bids. Voiding the winning bid promotes the next one.

---

## Monitor

The live view while an auction runs. Current bid, bid count, countdown and leader for every lot,
updating over the WebSocket as bids land. New bids pulse. Extensions are called out — that is
anti-snipe firing, and it means a lot just moved its own clock.

If the connection drops and comes back with a gap too large to replay, the screen reloads its figures
over the API and tells you it did. That message is deliberate: silently reconciled numbers are a lie
about how fresh they are.

---

## Decisions

Every lot that closed below its reserve, across all auctions, soonest-closed first. Reserve, top bid,
**shortfall**, bidder and close time.

Two choices:

**Accept reserve** — sell anyway at the top bid. The confirmation shows the shortfall explicitly,
because you are knowingly selling under. Promotes the bid to won and the lot to sold.

**Relist** — put it in another auction as a fresh draft.

Doing nothing is also valid; the lot simply waits.

---

## Users

Search by phone or name, filter by status and role.

Detail shows their activity: bids placed, lots bid on, lots currently winning, and active sessions.

**Suspend** — ends every session immediately, including any open live connection, and blocks sign-in.
Their existing bids stand; those are financial records, not privileges. Requires a reason.

**Reactivate** — lets them sign in again. Does not restore their old sessions.

**Change role** — **superadmin only**. If you are a plain admin the control is not shown at all.
You cannot change your own role, and the last remaining superadmin cannot be demoted or suspended.

---

## Things that surprise people

**Bidding is proxy bidding.** A bidder enters the most they will pay. The system bids the minimum
needed on their behalf, one increment at a time, up to that ceiling. So the visible price can climb
with nobody actively doing anything — that is two hidden maximums competing.

**A bid can be outbid the instant it is placed.** If a rival's ceiling is higher, the engine
counter-bids immediately. From the bidder's side that looks like being outbid before the confirm
sheet closes. It is correct.

**Status lags the clock by a few seconds.** Between a lot's close time passing and the worker's next
pass, it still reads `live` while any bid on it is already refused. Trust the countdown, not the
label.

**The reserve is never visible to bidders** — only a "reserve met" flag. It appears in exactly one
place in this app: the lot detail screen.

---

# Test plan

Work through these in order. Each says what to do and what should happen. Anything that does not
match is worth writing down.

You will want three browser contexts: this portal as admin, and two separate windows on the bidder
app (`localhost:3000`) signed in as **different** bidders — use a private window for the second, or
the sessions will collide.

## A. Setup

**A1 — Sign in.** `+27820000001`, code `0000`.
*Expect:* the Auctions list. No errors in the console.

**A2 — Sign in as a bidder here.** Sign out, sign in as `+27820000002`.
*Expect:* a clear "no admin access" screen, not a broken console full of 403s. Sign back in as admin.

**A3 — Create an auction.** Name it something you will recognise. Set **Starts at** about 2 minutes
out and **Ends at** about 20 minutes out. Leave the anti-snipe defaults.
*Expect:* created as `draft`, slug auto-generated, times displayed in your zone.

**A4 — Try to publish it empty.**
*Expect:* the checklist blocks it — "Has at least one lot" fails.

**A5 — Add three lots.** Starting price R100 each. Give **lot 2 a reserve of R5 000** you know will
not be met. Give **lot 3 a fixed increment override** of R50.
*Expect:* the form stays open and resets; lot numbers 1, 2, 3 assigned automatically.

**A6 — Upload images** to lots 1 and 2. Reorder them. Make a different one primary.
*Expect:* upload progress, thumbnails appear, exactly one primary at a time.

**A7 — Try an oversized file** (>10MB).
*Expect:* refused, with wording that makes clear the file never uploaded.

**A8 — Publish.**
*Expect:* checklist all green, auction becomes `scheduled`, lots become `scheduled`.

**A9 — Wait for the start time.**
*Expect:* within a few seconds of the start, the auction becomes `live` and the lots open — **without
you refreshing anything**. If this never happens, the lifecycle worker is not running.

## B. The bidder side (web app, `localhost:3000`)

**B1 — Sign in** as `+27820000002`, code `0000`.
*Expect:* your new auction in the list, showing its lot count and a countdown.

**B2 — Open it.** You should land on the card stack.
*Expect:* one card per lot, photo, title, starting price, countdown. **No reserve amount anywhere.**

**B3 — Swipe left** on lot 3.
*Expect:* it leaves the stack. It is now under My bids → Passed, and can be un-passed.

**B4 — Swipe right** on lot 1.
*Expect:* the bid sheet opens. **No bid has been placed yet.**

**B5 — Dismiss the sheet without confirming.**
*Expect:* no bid. The lot has left the stack but is reachable under My bids → Interested.

**B6 — Bid on lot 1 with a maximum of R500.**
*Expect:* accepted, you are winning, and the price shows **R100** — not R500. The sheet should have
told you that before you confirmed.

Check the admin Monitor: the bid appears live.

## C. Proxy bidding

**C1 — In the second bidder window, bid R200 on lot 1** (maximum R200).
*Expect:* the bid is **accepted** and you are **immediately outbid**. The price jumps to just above
R200, and bidder one is still winning — their R500 ceiling beat it. This must read as a normal
outcome, not an error.

**C2 — Look at bidder one's window.**
*Expect:* the price updated live, and they were told they are still winning.

**C3 — In bidder one's window, raise the maximum to R900** from lot detail.
*Expect:* the price does **not** move. No event reaches bidder two — raising your own ceiling must
not signal anything to rivals.

**C4 — Bidder two bids R1 000.**
*Expect:* bidder two takes the lead at roughly R900 plus one increment, capped at their own maximum.
Bidder one is told they have been outbid.

**C5 — Check the bid history on lot detail.**
*Expect:* automatic bids are distinguishable from manual ones, handles are pseudonymous, and **no
maximums are shown**.

## D. Anti-snipe

**D1 — Set up a lot closing soon.** As admin, edit the auction's **Ends at** to about 4 minutes out
(inside the default 5-minute anti-snipe window).
*Expect:* a confirmation showing what will move, and afterwards a count of rescheduled lots. Both
bidder windows update their countdowns without a refresh.

**D2 — Bid on a lot from a bidder window.**
*Expect:* the countdown **jumps out** by the extension. Both bidder windows and the admin Monitor
show it. The Monitor should mark the extension visibly.

**D3 — Have the leading bidder raise their own maximum.**
*Expect:* **no extension.** Raising your ceiling does not move the price, so it must not move the
clock — otherwise a leader could hold a lot open forever.

## E. Closing and decisions

**E1 — Let the auction run out.**
*Expect:* within a tick of the close, lots move to their terminal status without a refresh. Lot 1
`ended_sold`. Lot 3, if nobody bid, `ended_unsold`. Lot 2 (the R5 000 reserve) `ended_reserve_not_met`.

**E2 — Check the bidder app.**
*Expect:* closed lots show as closed and cannot be bid on. Winning and losing should read
differently — "you won" is not the same message as "it ended".

**E3 — Open Decisions.**
*Expect:* lot 2 listed, with the reserve, the top bid and the shortfall in rands. The sidebar badge
matches.

**E4 — Accept the reserve.**
*Expect:* the confirmation states the shortfall explicitly. Afterwards the lot is `ended_sold` and it
leaves the queue.

**E5 — Relist an unsold lot** into a new draft auction.
*Expect:* a fresh `draft` lot with the description and images copied, **no bids**, no extensions, and
a link back to the original.

## F. Intervention

**F1 — Void a winning bid** on a closed lot with several bids.
*Expect:* a confirmation showing the bid, the handle and the amount. Afterwards the lot's leader and
price recalculate to the next live bid.

**F2 — Withdraw a lot that has bids.**
*Expect:* the dialog says how many bids and that bidders will be told. Afterwards the bid history is
still there, and the bidder app shows the lot as closed.

**F3 — Try to delete a lot that has bids.**
*Expect:* refused, with withdraw offered instead.

**F4 — Try to edit a frozen field** — change the starting price on a lot that has a bid.
*Expect:* the input is disabled with the reason. If you force it, the server refuses and that field
highlights.

## G. Users and permissions

**G1 — Find a bidder** by partial phone number.
*Expect:* the search matches; the detail screen shows their bid activity.

**G2 — Suspend them** while they are signed in on the bidder app.
*Expect:* their session ends. They cannot sign back in. **Their bids remain** in the histories.

**G3 — Reactivate them.**
*Expect:* they can sign in again, with a fresh session.

**G4 — As a plain admin, look for the role control.**
*Expect:* it is not shown at all.

**G5 — Sign in as superadmin** (`+27820000000`) and change a bidder to admin.
*Expect:* it works. Then try to change your own role — refused. Try to demote yourself as the last
superadmin — refused.

## H. Resilience

**H1 — On the Monitor, disconnect the network briefly**, place a bid from a bidder window, then
reconnect.
*Expect:* the Monitor catches up — either by replaying what it missed or by reloading and saying so.
The figures must match the bidder app afterwards. **Compare them explicitly.**

**H2 — Same on the bidder app**, watching a lot.
*Expect:* the same. No gap in the bid history, no duplicated bids.

**H3 — Double-tap a confirm button** in the bid sheet.
*Expect:* exactly one bid.

**H4 — Bid rapidly** on one lot from a bidder window.
*Expect:* eventually a rate-limit message with a sensible wait, not a crash. (60 per minute per lot.)

**H5 — Request an OTP six times in an hour** for one number.
*Expect:* refused with a wait. Note this locks that number out for the rest of the hour — use a
different one to carry on.

## I. Presentation

**I1 — Switch this portal to Dark**, then walk every screen: auctions, lot detail with disabled
frozen fields, the image uploader, a destructive dialog, the Monitor, Decisions, Users.
*Expect:* everything legible, status colours still distinguishable, disabled inputs still obviously
disabled.

**I2 — Same on the bidder app** in Light.
*Expect:* the accent still readable, photos still dominant, prices clear.

**I3 — Set both to System** and change your OS theme.
*Expect:* both follow immediately, no reload, no white flash on either.

**I4 — Reload each app on each setting.**
*Expect:* no flash of the wrong theme at any point.

---

## Recording what you find

For anything that does not match, note: which step, what you expected, what happened, and whether it
reproduces. Screenshots help for anything visual. If a number is wrong somewhere, **check the same
number in the other app** before reporting it — knowing whether both are wrong or only one narrows
it enormously.
