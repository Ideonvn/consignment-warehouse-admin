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
  make dev     # API on http://localhost:8000, Postgres, Valkey, MinIO
  make seed    # seeded admin, bidders, and a live auction with lots
  ```
- **MinIO up** — photo uploads go directly from the browser to object storage.
  `make dev` brings it up with the rest of the stack.

Seeded accounts (while the backend runs with `APP_ENV=local`, **the OTP code is
always `0000`**):

| Number          | Role   |
| --------------- | ------ |
| `+27820000001`  | admin  |
| `+27820000002`  | bidder |
| `+27820000003`  | bidder |
| `+27820000004`  | bidder |

## Setup

```bash
npm install
cp .env.example .env.local   # defaults already match a local backend
npm run dev                  # http://localhost:5173
```

**Why 5173 and not 3000?** The backend's CORS allowlist contains only
`http://localhost:3000` and `http://localhost:5173`, and 3000 belongs to the
bidder-facing app. Running the portal on 5173 lets both apps talk to the same
backend at once. `npm run start` uses the same port.

## Environment variables

| Variable                   | Purpose                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the REST API, no trailing slash. Called directly from the browser, so it must allow this origin with credentials — the refresh token is an `HttpOnly` cookie. |
| `NEXT_PUBLIC_WS_URL`       | WebSocket endpoint for the live auction monitor. A single-use ticket is minted over REST before every connection attempt. |

Both are documented in [.env.example](.env.example).

## Scripts

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Dev server on port 5173                             |
| `npm run build`     | Production build                                    |
| `npm run start`     | Serve the production build on 5173                  |
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
