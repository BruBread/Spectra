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
| `CORS_ORIGIN` | Allowed frontend origin |
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

- Backend runs at `http://127.0.0.1:4000`
- Frontend runs at `http://localhost:3000`

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
most recent readings, newest first — this is what the iOS app (or the
frontend) should call to display device data.

## Vision alerts API

Location: `backend-spectra/src/modules/vision/`

Alerts are AI-assisted signals for a human to review — never a confirmed
incident. Endpoints are under `{API_BASE_URL}/api/vision`.

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
