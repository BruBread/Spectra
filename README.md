# Spectra

Monorepo containing the Spectra web frontend and backend API. The existing
iOS app (Swift, built separately) consumes the backend API and is not part
of this repo.

## Stack

- **frontend-spectra** — Next.js (App Router) + React + TypeScript
- **backend-spectra** — Node.js + Express + TypeScript + MongoDB (Mongoose)
  - Includes a `lorawan-ingest` module for receiving device uplinks from a
    LoRaWAN network server (The Things Stack or ChirpStack) via webhook or
    MQTT, and storing readings in MongoDB.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm
- MongoDB running locally for LOCAL development (e.g. `mongod` on your
  machine, or `docker run -p 27017:27017 mongo`)

## Project structure

```
Spectra/
├── frontend-spectra/    Next.js app
├── backend-spectra/     Express API + lorawan-ingest module
├── run-frontend.bat     Windows script to install + run the frontend locally
└── run-backend.bat      Windows script to install + run the backend locally
```

## Environments

Both apps support three environments: **LOCAL**, **DEVELOPMENT**, and
**PRODUCTION**. Each app has a generic `.env.example` plus one ready-made
example file per environment:

- `.env.local.example`
- `.env.development.example`
- `.env.production.example`

Copy the one you need to the matching real filename (e.g.
`.env.local.example` → `.env.local`) and fill in real values. The real env
files are gitignored and must never be committed.

**LOCAL always uses `127.0.0.1` for MongoDB** (`mongodb://127.0.0.1:27017/spectra_local`)
so it connects to a database running on your own machine — never a shared
cluster.

### Backend (`backend-spectra`)

The backend picks its env file based on `APP_ENV` (`local` | `development`
| `production`, default `local`), loaded via `dotenv` in `src/config/env.ts`.

Key variables — see `backend-spectra/.env.example` for the full list:

| Variable | Purpose |
|---|---|
| `APP_ENV` | Selects which `.env.*` file to load |
| `PORT` | HTTP port (default `4000`) |
| `MONGODB_URI` | MongoDB connection string |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated. Cannot be `*` with cookie auth — see [Authentication](#authentication) |
| `SESSION_SECRET` | Signs the session cookie. Required in production |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE` | Session cookie config |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Bootstrap admin, seeded only when no user exists |
| `TTN_WEBHOOK_SECRET` / `CHIRPSTACK_WEBHOOK_SECRET` | Shared secrets verified on inbound LoRaWAN webhooks |
| `MOBILE_API_KEY` | **Development-only.** Scoped key for non-browser reading access; production refuses to start if set |
| `LORAWAN_READINGS_ALLOW_ANONYMOUS` | **Development-only.** Restores pre-auth public reads; default `false`, production refuses to start if `true` |
| `MQTT_ENABLED`, `MQTT_PROVIDER`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC` | Optional MQTT client config |

### Frontend (`frontend-spectra`)

Next.js loads `.env.local` in every environment, plus `.env.development` /
`.env.production` automatically based on `NODE_ENV`. Only variable needed:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the backend API |

## Running locally

### Windows

Double-click, or run from a terminal at the repo root:

```
run-backend.bat
run-frontend.bat
```

Each script copies the matching `.env.local.example` to `.env.local` on
first run (if one doesn't exist yet), installs dependencies if
`node_modules` is missing, and starts the dev server.

### macOS / Linux

```bash
cd backend-spectra
cp .env.local.example .env.local
npm install
npm run dev

# in a second terminal
cd frontend-spectra
cp .env.local.example .env.local
npm install
npm run dev
```

- Backend runs at `http://localhost:4000`
- Frontend runs at `http://localhost:3000`

Sign in with the admin account seeded from the backend's `ADMIN_EMAIL` /
`ADMIN_PASSWORD` — see [Authentication](#authentication).

> Use `localhost` (not `127.0.0.1`) for `NEXT_PUBLIC_API_BASE_URL`. Browsers
> treat `localhost` and `127.0.0.1` as different sites, so mixing them makes
> the session cookie cross-site and it gets dropped.

## Authentication

All admin API routes require an authenticated session. The frontend has no
client-side login of its own — it asks the backend who is signed in.

**Mechanism.** Server-side sessions (`express-session` + `connect-mongo`,
stored in the `sessions` collection) behind an **HTTP-only** cookie, so a
page script can never read the session, and signing out genuinely destroys it
server-side. Passwords are hashed with **scrypt** from node's standard library
(N=2^16, r=8, p=1), stored self-describing as `scrypt$N$r$p$salt$key` so the
cost can be raised later without invalidating existing passwords. The session
id is regenerated on login and on password change.

**Roles.** These govern the admin console and are deliberately separate from
the monitored-person roles (faculty, student, guard, …) of a later phase.

| Role | May do |
|---|---|
| `admin` | Everything: manage cameras, detection settings, AprilTag mappings, and (later) people, roles, credentials, and policies |
| `operator` | View cameras, alerts, notifications and device readings; submit detections; acknowledge/review/resolve alerts |

Unauthenticated requests get `401`; authenticated-but-not-permitted get `403`.

**Exceptions that stay public, by design:** `GET /api/health` (liveness
checks) and the LoRaWAN webhooks (`POST /api/lorawan/webhook/*`), which are
machine-to-machine and authenticate with `X-Webhook-Secret` instead — a
network server has no browser session.

### Local setup

`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend-spectra/.env.local` seed the
first admin **only when the users collection is empty**, so restarting never
resets a real account. `.env.local.example` ships with
`admin@spectra.com` / `spectra123` for local development. Credentials live in
env files (gitignored) and never in committed source.

To reset the demo account, delete the user and restart the backend:

```bash
mongosh spectra_local --eval 'db.users.deleteMany({})'
```

For any real deployment: set a unique `SESSION_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
set an explicit `CORS_ORIGIN`, and change the seeded password after first
sign-in. Production refuses to boot with a default/missing `SESSION_SECRET`
or a wildcard `CORS_ORIGIN`.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` → user; sets the session cookie |
| `POST` | `/api/auth/logout` | Destroys the session |
| `GET` | `/api/auth/me` | Current user, or `401` when signed out |
| `PATCH` | `/api/auth/me` | `{ name?, email? }` |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` (min 8 chars) |

### Testing it locally

```bash
# 401 until you sign in
curl -i http://localhost:4000/api/cameras

# sign in and keep the cookie
curl -c jar.txt -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@spectra.com","password":"spectra123"}'

# now authorized
curl -b jar.txt http://localhost:4000/api/auth/me
curl -b jar.txt http://localhost:4000/api/cameras

# sign out; the same cookie stops working
curl -b jar.txt -X POST http://localhost:4000/api/auth/logout
curl -i -b jar.txt http://localhost:4000/api/cameras
```

Health and webhooks stay reachable without a session:

```bash
curl http://localhost:4000/api/health
curl -X POST http://localhost:4000/api/lorawan/webhook/ttn \
  -H 'X-Webhook-Secret: local-ttn-webhook-secret' \
  -H 'Content-Type: application/json' -d '{}'
```

## Tests

Both suites are self-contained: they need **no running dev stack, no
installed MongoDB, no cameras and no hardware**, and they start whatever they
need themselves.

```bash
cd backend-spectra && npm test        # API + auth + alerts (node:test)
cd frontend-spectra && npm run test:e2e   # browser end-to-end (Playwright)
```

| Command | Where | What it does |
|---|---|---|
| `npm test` | `backend-spectra` | Runs `test/**/*.test.ts` on Node's built-in test runner |
| `npm run test:watch` | `backend-spectra` | The same, re-running on change |
| `npm run typecheck:test` | `backend-spectra` | Typechecks `src` **and** `test` (the default `typecheck` covers `src` only) |
| `npm run test:e2e` | `frontend-spectra` | Playwright; starts its own backend + frontend |
| `npm run test:e2e:ui` | `frontend-spectra` | The same in Playwright's watch UI |

First e2e run only: `npx playwright install chromium` to fetch the browser.

### Isolation

**Tests never touch your local database.** Each run starts a throwaway
in-memory MongoDB (`mongodb-memory-server`) and points the app at it, so
`spectra_local` — your real cameras, alerts and admin account — is
unreachable by construction rather than by convention. The database is
discarded when the run ends.

All fixtures are created by the tests themselves (obviously synthetic:
`test-camera-alpha`, `e2e-admin@example.test`) and no assertion depends on
any pre-existing record.

The e2e run starts its own backend on **4100** and frontend on **3100**, so a
dev stack on 3000/4000 can keep running. It builds into `.next-e2e` because
Next allows only one dev server per build directory.

### Layout

```
backend-spectra/test/
├── support/testServer.ts   in-memory Mongo + the real app on an ephemeral port
├── support/e2eServer.ts    the backend Playwright starts (+ a test-only reset)
├── support/factories.ts    seeded, test-owned fixtures
├── auth.test.ts            authentication, session lifecycle, operator vs admin
├── alerts.test.ts          lifecycle, filtering, counts, read state, grouping
├── readings.test.ts        session / scoped key / anonymous-blocked access
├── readings.anonymous.test.ts   the compatibility flag enabled
└── config.guards.test.ts   production refuses development-only settings

frontend-spectra/e2e/
├── support/api.ts          login + fixture seeding through the real API
├── auth.spec.ts            login, session, logout
└── notifications.spec.ts   real alerts, filters, actions, counts, empty/error states
```

Each `node:test` file runs in its own process, which is how the differing
environments (anonymous reads on vs off) stay isolated — `src/config/env.ts`
reads the environment once at import.

## Identity, zones and policy (backend)

Backend foundation for the MVP's identity model. **Nothing enforces these
yet** — no detector reads a zone, and no policy decision is written by alert
ingestion. Those arrive in later phases; this is the data and the admin API
they will build on.

All routes need a session. Reads are open to `admin` and `operator`; **every
mutation is `admin`-only**, matching the camera and vision routes.

### Roles

Roles here describe *people a camera may see* and are deliberately separate
from the `admin`/`operator` console roles in [Authentication](#authentication).

Two are seeded at first boot — `security_guard` and `staff` — **only when no
role exists at all**, so a role an administrator deactivates or removes is
never resurrected. Both start with **no permissions**: allowed in no zone,
exempt from nothing. Being permitted somewhere is a decision an admin makes,
not a default the software assumes. Admins can create further custom roles.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/roles?active=` | |
| `GET` | `/api/roles/:id` | |
| `POST` | `/api/roles` | `{ key, name, description?, permissions? }` |
| `PATCH` | `/api/roles/:id` | Name, description, `active` (deactivate), permissions. `key` is immutable — recorded decisions refer to it |
| `DELETE` | `/api/roles/:id` | `409` while any person or policy decision references it. Deactivate instead |

`permissions` carries two things and no more:

- `weaponExempt` — whether a possible-weapon detection may be suppressed for
  this role. It will only ever apply alongside a readable, registered
  AprilTag; configuration alone can't grant it.
- `zones: [{ zoneId, allowed }]` — per-zone access. **A zone absent from the
  list is denied**: absence is not permission.

There is deliberately **no unattended-object exemption**. Once the person who
left an object walks away, ownership can't be established from a frame, so no
role can be trusted to excuse it.

### People

One role each in this MVP. People are never deleted — deactivate them, so the
credentials they held stay accounted for.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/people?active=&roleId=&q=` | |
| `GET` | `/api/people/:id` | |
| `POST` | `/api/people` | `{ name, roleId, notes?, aprilTagId?, loraDeviceId?, active? }` |
| `PATCH` | `/api/people/:id` | Also how you deactivate (`active: false`) and reassign a role (`roleId`) |

`aprilTagId` and `loraDeviceId` are both optional and both **unique when
present** (`409` on a clash, `null` to release). A person may hold a badge and
no wristband, or a wristband and no badge — but a wristband alone will never
imply camera identity or grant permissions.

### LoRa device selection

`GET /api/lora-devices` lists every device id an admin could assign: the union
of ids seen in real `DeviceReading` uplinks and ids already assigned to
someone, each with `source` (`reading` | `manual`), `lastSeenAt`,
`readingCount` and `assignedTo`. Manually registering an id for hardware that
hasn't reported yet is just setting `loraDeviceId` on a person; it appears
here as `manual` so it can't silently vanish from the picker.

### Restricted zones

A zone is a named rectangle on one camera's frame, in relative (0–1)
coordinates so it means the same thing at any resolution.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/zones?cameraId=&active=` | |
| `GET` | `/api/zones/:id` | |
| `POST` | `/api/zones` | `{ name, cameraId, rect: { x, y, width, height } }` |
| `PATCH` | `/api/zones/:id` | Rename, move the rect, archive (`active: false`). `cameraId` is immutable — a rectangle only means something on its own camera |
| `DELETE` | `/api/zones/:id` | `409` once a recorded policy decision names it — archive instead. Otherwise deleted, and pulled out of every role's permissions so nothing dangles |

Zone names are unique per camera. Zones are **not wired into detection yet**.

### Policy decisions

`GET /api/policy-decisions` and `GET /api/policy-decisions/:id` — **read-only,
by design**. There is no create, update or delete route: an audit trail that
can be rewritten is not an audit trail.

Filters: `detectionType`, `cameraId`, `zoneId`, `personId`, `identityState`,
`decision`, `from`, `to`, `limit`. An invalid filter is rejected rather than
silently widening the view.

Each record stores the detection context inline — camera, zone, identity
state, optional person/role/AprilTag/LoRa details, the outcome, a
human-readable reason and an optional alert reference. That is deliberate: a
*suppressed* detection produces no alert, so the decision record is the only
trace it ever happened and has to stand on its own.

Nothing writes these yet.

## LoRaWAN ingest module

Location: `backend-spectra/src/modules/lorawan-ingest/`

Uplinks are normalized into a common shape and stored in the `DeviceReading`
MongoDB collection, regardless of which path they arrive through.

### Webhook (recommended)

Configure an HTTP/webhook integration in your network server console
pointing at:

- The Things Stack: `POST {API_BASE_URL}/api/lorawan/webhook/ttn`
- ChirpStack: `POST {API_BASE_URL}/api/lorawan/webhook/chirpstack`

Add a custom header `X-Webhook-Secret: <value>` on the integration matching
`TTN_WEBHOOK_SECRET` / `CHIRPSTACK_WEBHOOK_SECRET` in the backend's env
file — requests without a matching header are rejected with `401`.

### MQTT client (alternative)

Set `MQTT_ENABLED=true` plus `MQTT_PROVIDER`, `MQTT_BROKER_URL`,
`MQTT_USERNAME`, `MQTT_PASSWORD`, and `MQTT_TOPIC` in the backend env file to
have the server connect directly to the network server's application MQTT
broker and subscribe to uplinks instead of (or alongside) the webhook.

### Reading stored data

`GET {API_BASE_URL}/api/lorawan/readings?deviceId=<id>&limit=<n>` returns the
most recent readings, newest first. See
[Device readings access](#device-readings-access) for who may call it.

### Device readings access

This endpoint was public before authentication existed, and the separately
built iOS app already calls it with no credential. It now accepts three kinds
of caller. The webhooks above are unaffected — they authenticate with
`X-Webhook-Secret`.

| Caller | Credential | Scope | Environments |
|---|---|---|---|
| Admin console | Session cookie (`admin` or `operator`) | Full, including listing all devices | All |
| Mobile/device client | `X-Api-Key: <MOBILE_API_KEY>` | **Must** pass `?deviceId=` — cannot list all devices | **Local/development only** |
| Anonymous | none, only if `LORAWAN_READINGS_ALLOW_ANONYMOUS=true` | Full — **off by default** | **Local/development only** |

**Production refuses to start** if either `MOBILE_API_KEY` or
`LORAWAN_READINGS_ALLOW_ANONYMOUS=true` is set, with an error explaining why.
There is no production mobile/guest path yet — see
[Required follow-up](#required-follow-up).

```bash
# scoped key access (matches the documented iOS call shape)
curl -H 'X-Api-Key: local-mobile-api-key' \
  'http://localhost:4000/api/lorawan/readings?deviceId=abc-123&limit=10'
```

Admin-only operations are unaffected: the key grants nothing beyond reading
readings, and never reaches cameras, vision, or settings.

#### Security limitation (read before shipping)

**`MOBILE_API_KEY` is a temporary development bridge, not the design.** It is
a single static shared secret. Anyone who extracts it from a shipped app
binary can read any device's readings by knowing a device id. It
authenticates *"some copy of the mobile app"*, not *"this guest"*, and cannot
express which devices a given guest is entitled to. Requiring `deviceId`
limits blast radius (no bulk dump) but is not authorization. It is therefore
confined to local/development and rejected in production.

`LORAWAN_READINGS_ALLOW_ANONYMOUS=true` is weaker still — it restores the
old fully-public behavior for an already-deployed client that cannot yet send
a credential. It is a local/development stopgap only, off by default, and
likewise rejected in production.

#### Required follow-up

**Production mobile/guest access requires per-guest authentication issuing
short-lived, device-scoped access tokens.** Each token must identify an
individual guest and carry only the devices that guest is authorized for, so
access can be scoped, expired, and revoked per person rather than per app
build. Neither the shared key nor anonymous reads can express that, which is
why production accepts neither.

Build it once person/credential records and wristband assignment exist. The
scope check belongs exactly where the `deviceId` check lives today
(`readings.auth.ts`): swap "a deviceId is present" for "this device is in the
caller's authorized set", then retire the development key and the anonymous
flag entirely.

Until then, the iOS app can read readings in local/development only (via
`X-Api-Key`, or `LORAWAN_READINGS_ALLOW_ANONYMOUS=true` during a migration
window) and has no production path. The backend reports its access posture at
boot, so this never fails silently.

## Vision alerts API

Location: `backend-spectra/src/modules/vision/`

Alerts are AI-assisted signals for a human to review — never a confirmed
incident. Endpoints are under `{API_BASE_URL}/api/vision` and all require an
authenticated session. Reading and triaging alerts is open to `operator` and
`admin`; changing detection settings and AprilTag mappings is `admin` only
(see [Authentication](#authentication)).

### Alert shape

| Field | Notes |
|---|---|
| `_id` | Alert id |
| `cameraId` | Camera the detection came from |
| `type` | `unattended_object`, `apriltag`. Alerts recorded before the pose-based detectors were removed may also carry a retired type — see [Retired detection types](#retired-detection-types) |
| `severity` | `info` \| `warning` \| `critical` |
| `status` | `new` \| `acknowledged` \| `under_review` \| `resolved` \| `dismissed` |
| `read` | Read/unread state for notification badges |
| `zoneName` | Optional zone label the detection fired in |
| `confidence` | Detector confidence, 0–1 |
| `message` | Neutral, review-oriented description |
| `snapshot` | Optional base64 JPEG evidence frame |
| `metadata` | Detector-specific detail (e.g. `trackId`) |
| `occurrences` / `lastOccurredAt` | Repeat count and most recent repeat (see grouping) |
| `acknowledged` | **Legacy.** Kept in sync with `status`: `true` for any status other than `new` |
| `createdAt` | First occurrence |

Severity defaults per type when the client doesn't send one: `apriltag` is
`info`, everything else is `warning`. A client may send an explicit
`severity` to override it.

### Retired detection types

The pose-based behaviour heuristics — `drowning`, `fighting`, `running`,
`loitering`, `intoxication` — were **removed from the product**. They guessed
at intent from body geometry and were never reliable enough to act on, so
nothing raises them any more and `POST /alerts` rejects them with an
explanatory error.

Alerts those detectors already recorded are **not** rewritten or deleted:
they remain valid documents, keep their stored severity, stay filterable by
their own type, and render with a `(retired)` label so history is never
mistaken for something the system still watches for.

Their per-camera detector settings are stripped at boot
(`stripRetiredDetectorSettings`), which is required rather than cosmetic —
`getSettings()` saves the document, and a leftover retired detector config
would fail validation on the first read.

For a local or development database whose retired-type alerts are just stale
test data, an opt-in command removes them. It refuses to run against
production, where that history is real:

```bash
cd backend-spectra
npm run purge:retired-alerts              # dry run — reports what it would delete
npm run purge:retired-alerts -- --confirm # actually delete
```

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/alerts` | List alerts, newest first |
| `GET` | `/alerts/counts` | `{ unread, criticalOpen, new }` totals for badges |
| `POST` | `/alerts` | Create an alert (`201`), or group a repeat (`200`) |
| `POST` | `/alerts/read-all` | Mark every unread alert read → `{ modified }` |
| `PATCH` | `/alerts/:id/status` | Body `{ status }` — update review status |
| `PATCH` | `/alerts/:id/read` | Body `{ read }` (default `true`) |
| `PATCH` | `/alerts/:id` | **Legacy** acknowledge — same as `status: acknowledged` |

`GET /alerts` filters, combinable: `cameraId`, `type`, `severity`, `status`
(single or comma-separated, e.g. `status=new,under_review`), `zoneName`,
`read`, `from` / `to` (ISO dates, against `createdAt`), `limit` (default
`50`, max `200`), plus the legacy `acknowledged`. A filter that is present
but invalid returns `400` rather than silently returning unfiltered results.

Moving an alert out of `new` also marks it read — triaging it means a human
already looked at it.

### Duplicate grouping

A detection for the same camera + type + `metadata.trackId` arriving inside
that detector's configured `cooldownSeconds` folds into the existing alert:
`occurrences` increments and `lastOccurredAt` moves. The original record —
snapshot, confidence, `createdAt` — is never overwritten, and `read` is left
alone so repeats don't re-trigger the badge. Two limits keep events from
being hidden: only alerts still open (`new`/`acknowledged`/`under_review`)
absorb repeats, so a recurrence after an alert is resolved or dismissed
raises a fresh alert; and the window is measured from the original
`createdAt`, so a condition persisting past the cooldown raises a new alert
instead of incrementing one row forever.

### Migration

Alerts written before the status lifecycle existed are backfilled once at
boot (`vision.migration.ts`): `acknowledged: true` → `status: acknowledged`
+ `read: true`, `acknowledged: false` (or missing) → `status: new`, severity
from the alert's type, `occurrences: 1`, and `lastOccurredAt` set to the
original `createdAt`. It only matches documents with no `status`, so it is
idempotent and no manual database reset is needed.
