# Consignment Warehouse — admin portal

The operator's console for the Consignment Warehouse auction business. This is
where someone creates an auction, lists the stock in it, publishes it, watches
bidding come in, and decides what happens to the lots that did not sell.

It is an internal tool for people handling real money under time pressure —
dense tables, keyboard-first, and every destructive action behind a
confirmation that says plainly what will happen to bidders. It is deliberately
not styled like the bidder-facing app.

The backend and the bidder web app are separate projects. **This repository
never modifies the backend**; requests for it are collected in
[NOTES.md](NOTES.md).

## Prerequisites

- **Node.js 20.9+** (Next.js 16 minimum).
- **The backend running locally.** From the backend repo:
  ```bash
  make dev-all # API on http://localhost:8000, Postgres, Valkey, MinIO, and the
               # worker that closes lots when their clock runs out
  make seed    # seeded superadmin, admin, bidders, and a live auction with lots
  ```
  `make dev` alone is enough for everything except lots actually closing — the
  monitor and the decisions queue need the worker running.
- **MinIO up** — photo uploads go directly from the browser to object storage.
  `make dev` brings it up with the rest of the stack.

Seeded accounts (while the backend runs with `APP_ENV=local`, **the OTP code is
always `0000`**):

| Number          | Role       |
| --------------- | ---------- |
| `+27820000000`  | superadmin |
| `+27820000001`  | admin      |
| `+27820000002`  | bidder     |
| `+27820000003`  | bidder     |
| `+27820000004`  | bidder     |

Role changes are superadmin-only, so use `+27820000000` to exercise them.

## Setup

```bash
npm install
cp .env.example .env.local   # defaults already match a local backend
npm run dev                  # http://localhost:3100
```

**Why 3100?** The backend's CORS allowlist is `http://localhost:3000` for the
bidder-facing app and `http://localhost:3100` for this portal, so both can talk
to the same backend at once. `npm run start` uses the same port. Running the
portal on any other port will make every request fail preflight.

## Environment variables

| Variable                   | Purpose                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the REST API, no trailing slash. Called directly from the browser, so it must allow this origin with credentials — the refresh token is an `HttpOnly` cookie. |
| `NEXT_PUBLIC_WS_URL`       | WebSocket endpoint for the live auction monitor. A single-use ticket is minted over REST before every connection attempt. |

Both are documented in [.env.example](.env.example). In production neither comes
from a file — Amplify holds them as branch environment variables, set by
Terraform. See [Deployment](#deployment).

## Scripts

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Dev server on port 3100                             |
| `npm run build`     | Production build                                    |
| `npm run start`     | Serve the production build on 3100                  |
| `npm run lint`      | ESLint (includes the React Compiler rules)          |
| `npm run typecheck` | `tsc --noEmit`                                      |

## Architecture

A client-heavy SPA living inside the Next.js App Router. The server side is a
thin shell: the root layout, per-segment metadata, and route files that await
`params` and hand the id to a client component. Everything interactive is a
client component, because bearer auth and a live WebSocket mean server-rendering
authenticated data buys nothing and costs plumbing. Server state is TanStack
Query; the small amount of genuinely global client state (session, socket
status, current auction, command palette) is Zustand. Tables are TanStack Table
v9; forms are React Hook Form with zod where validation is conditional, and
plain controlled state where it is not. `lib/api` holds a transport layer, an
authenticated client that validates every response against a zod schema, and
one typed function per endpoint; `lib/format` owns money, dates, statuses and
the server-anchored clock, so no screen formats a rand or a timestamp on its
own.

**Authentication is phone OTP today**, the same mechanism bidders use, because
that is what the backend has. It is isolated behind a single module,
[`lib/auth/`](lib/auth), with one `AuthProvider` interface: send a challenge,
exchange the response for tokens, refresh, sign out, load the current user.
Swapping in Google OIDC means writing a second provider and changing the one
line in `lib/auth/provider.ts` that picks the active one — the login screen
already reads its labels and flow shape from the provider rather than knowing
anything about SMS. The access token is held in memory only, never
`localStorage`, and refresh is single-flight: the backend rotates the refresh
token on every call and revokes the whole family if a rotated token is replayed,
so two parallel refreshes would log the operator out permanently.

## Layout

```
app/                 routes — thin server shells + (console) route group
components/ui/       primitives: Button, MoneyInput, DateTimeInput, Dialog, …
components/          feature components by area (auctions, lots, users, monitor)
lib/api/             transport, authenticated client, endpoints, react-query hooks
lib/auth/            session, refresh, device id — isolated and swappable
lib/realtime/        WebSocket client and the monitor's event folding
lib/format/          money, dates, statuses, increments, server-anchored clock
lib/ui/              small client-side stores and hooks
types/api.ts         every API shape, as zod schemas with inferred types
```

## Conventions worth knowing before editing

- **Money is always an integer of cents.** Division by 100 happens once, at
  render, in `lib/format/money.ts`. `MoneyInput` is the only place rands become
  cents.
- **Timestamps are ISO 8601 UTC strings** end to end. `DateTimeInput` takes and
  emits UTC and shows the operator's zone; `formatDateTime` is the only way they
  reach the screen.
- **Countdowns read `useNow()`**, which is anchored to the server's `Date`
  header, not the device clock.
- **`reserve_price_minor` and `phone_e164` are sensitive.** The reserve is only
  available from `GET /admin/lots/{id}` and appears on the lot screen, the
  lots table and the decisions queue. Phone numbers appear on the users screens
  and never in a URL, a log, or an analytics call.
- **Every destructive action goes through `ConfirmDialog`**, and every reason
  field is typed by the operator — nothing is prefilled.

## Deployment

Hosted on **AWS Amplify** (`platform = WEB_COMPUTE`, Next.js SSR), defined in
[terraform/](terraform/): a reusable module in `shared/modules/amplify` and a
root in `deployment/` that calls it.

### Region: `eu-west-1`

**Amplify Hosting is not offered in `af-south-1`**, where the API runs, so the
portal cannot sit next to it. Ireland is the closest well-connected region that
does offer it — the west-coast submarine cables out of South Africa land in
Europe, which makes Dublin a shorter round trip from Johannesburg than any US
region and roughly the same as Frankfurt.

The distance matters far less than it appears:

- **Static assets** are served from CloudFront edges, which include Johannesburg
  and Cape Town. They do not travel from Ireland after the first request.
- **All data** goes from the browser straight to the API in `af-south-1`. No API
  or WebSocket traffic passes through Amplify.
- Only a **hard load of a server-rendered route** crosses regions — see
  [Rendering](#rendering) for what that costs and why it is worth knowing about.

### Applying, DNS, CORS and first sign-in

All of it lives in **[terraform/README.md](terraform/README.md)**, which is the
single place for infrastructure detail: the AWS account, the remote-state
bootstrap, connecting the private repository without putting a token in state,
why Amplify owns the DNS records rather than a human, the exact production
origin to allowlist, and the manual promotion that has to happen before anyone
can sign in.

The short version:

- Origin: `https://admin.consignment-warehouse.com`, in AWS account
  `982055099067`.
- The Route 53 hosted zone is in that same account, so **Amplify creates and
  manages the DNS records itself** — there is nothing to paste into a control
  panel and no `aws_route53_record` here.
- `https://admin.consignment-warehouse.com` must appear verbatim in the API's
  `CORS_ALLOWED_ORIGINS`, which it does. Exact match: a trailing slash or a
  `www.` prefix fails as a bare 400 with no CORS headers, which the browser
  reports as a network error.
- **Nobody can use the portal until the first operator is promoted to
  `superadmin` in the production database.** There is no bootstrap endpoint.

### Build

[amplify.yml](amplify.yml) runs install → typecheck → lint → build. Amplify
aborts on the first non-zero exit, so **a type error or a lint failure fails the
build instead of deploying**. The spec lives in the repository rather than in
Terraform because a spec in the repo root takes precedence over an app-level one
anyway; defining both would leave the losing copy looking authoritative in the
console.

## Rendering

Five routes are server-rendered per request (`ƒ` in the build output):

```
ƒ /auctions/[auctionId]        ƒ /lots/[lotId]
ƒ /auctions/[auctionId]/lots/new   ƒ /users/[userId]
ƒ /auctions/[auctionId]/monitor
```

Everything else is prerendered. They are dynamic because they are dynamic
segments with no `generateStaticParams` — the ids are unbounded, so Next cannot
enumerate them at build time.

**What that server render produces is a loading skeleton.** Measured against the
production build: the HTML for `/lots/{id}` is 14.6 kB against 14.0 kB for a
static route, contains nine skeleton placeholders, no lot data, and its only
visible text is the page title. Every one of these screens is a thin server shell
that awaits `params` and hands off to a client component, which then fetches with
a bearer token held in memory — so the server *cannot* render the data even in
principle.

The cost of that, per hard load, is a round trip to Ireland (~150–170 ms from
Johannesburg) plus a compute invocation, to receive markup the client replaces as
soon as its own request to `af-south-1` returns. Client-side navigation is
unaffected — it never touches the origin. So the round trip buys nothing on these
routes.

Making the shells static would remove it, and the work is small, but it is a
routing change: the id would have to be read client-side rather than from
`params`, which is a different shape for these five files. **Not done here** —
flagged, measured, and left for a decision.
