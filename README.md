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

| Caller | Credential | Scope |
|---|---|---|
| Admin console | Session cookie (`admin` or `operator`) | Full, including listing all devices |
| Mobile/device client | `X-Api-Key: <MOBILE_API_KEY>` | **Must** pass `?deviceId=` — cannot list all devices |
| Anonymous | none, only if `LORAWAN_READINGS_ALLOW_ANONYMOUS=true` | Full — **off by default** |

```bash
# scoped key access (matches the documented iOS call shape)
curl -H 'X-Api-Key: local-mobile-api-key' \
  'http://localhost:4000/api/lorawan/readings?deviceId=abc-123&limit=10'
```

Admin-only operations are unaffected: the key grants nothing beyond reading
readings, and never reaches cameras, vision, or settings.

#### Security limitation (read before shipping)

**`MOBILE_API_KEY` is a temporary bridge, not the design.** It is a single
static shared secret. Anyone who extracts it from a shipped app binary can
read any device's readings by knowing a device id. It authenticates *"some
copy of the mobile app"*, not *"this guest"*, and cannot express which devices
a given guest is entitled to. Requiring `deviceId` limits blast radius (no
bulk dump) but is not authorization.

`LORAWAN_READINGS_ALLOW_ANONYMOUS=true` is weaker still — it restores the
old fully-public behavior for an already-deployed client that cannot yet send
a credential. Use it only as a stopgap during a migration window, prefer the
key, and never leave it on in production.

#### Required follow-up

Replace both with per-guest authentication issuing short-lived tokens that
carry the guest's authorized device scope, once person/credential records and
wristband assignment exist. The scope check belongs at the same place the
`deviceId` check lives today (`readings.auth.ts`): swap "a deviceId is
present" for "this device is in the caller's authorized set", then retire the
shared key and the anonymous flag.

Until the iOS app ships a build that sends `X-Api-Key`, either set
`LORAWAN_READINGS_ALLOW_ANONYMOUS=true` for the migration window, or accept
that it cannot read readings. The backend warns at boot about whichever
posture is in effect, so this never fails silently.

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
| `type` | `unattended_object`, `loitering`, `running`, `fighting`, `drowning`, `intoxication`, `apriltag` |
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

Severity defaults per type when the client doesn't send one: `drowning` and
`fighting` are `critical`, `apriltag` is `info`, everything else is
`warning`.

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
