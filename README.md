# Spectra

Monorepo containing the Spectra web frontend and backend API. The existing
iOS app (Swift, built separately) consumes the backend API and is not part
of this repo.

Licensed under **AGPL-3.0** — see [License](#license).

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

## AI models

The browser detection pipeline loads two ONNX models from
`frontend-spectra/public/models/`, **committed to this repo** so a clone works
on any machine with no extra setup:

- `objects_yolo11.onnx` — stock Ultralytics YOLO11s (COCO classes: people,
  valuables, weapon look-alikes). Regenerate any time with
  `yolo export model=yolo11s.pt format=onnx imgsz=640 opset=12 simplify=True`.
- `possible_weapon_yolo11.onnx` — fine-tuned single-class weapon detector
  (produced by the training workspace; absent until a trained version is
  committed).

If a model file is missing the app still runs — that detector just stays
inactive and its model status shows an error instead of `ready`.

Device notes:
- Detection runs in the viewer's browser (WebGPU when available, WASM
  fallback — first load fetches the WASM runtime from a CDN, so the browser
  needs internet access at least once).
- **Local-device cameras require a secure context**: they work on
  `http://localhost` (each teammate running the app on their own machine —
  see the run scripts) but NOT over plain `http://<lan-ip>` from another
  device. HLS-stream cameras work from anywhere the stream is reachable.

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
| `DEVICE_SIMULATION_ENABLED` | **Development-only.** Runs the simulated haptic transport; default on in local/dev, production refuses to start if `true` — see [Wristband haptic commands](#wristband-haptic-commands-pi--sx1278-bridge) |
| `DEVICE_BRIDGE_SECRET` | Shared secret the future Pi bridge signs with. Distinct from webhook secrets; empty closes the bridge; required in production |

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
| `admin` | Everything: manage cameras, detection settings, people, roles, zones and policy |
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
├── config.guards.test.ts   production refuses development-only settings
├── identity.test.ts        roles, people, credential uniqueness, LoRa listing
├── identityMigration.test.ts  the pre-catalog role permission shape → action rules
├── actionCatalog.test.ts   the catalog, the restrict default, and its read-only API
├── unidentifiedPolicy.test.ts  the reserved subject's rules and attribution
├── zones.test.ts           zone CRUD, rectangle validation, archive vs delete
├── policyDecisions.test.ts the read-only audit API and its storage shape
├── deviceCommands.test.ts  test haptic, simulated delivery/ack, bridge auth + poll
└── deviceCommands.disabled.test.ts  simulation-off / bridge-closed (production) posture

frontend-spectra/e2e/
├── support/api.ts          login + fixture seeding through the real API
├── auth.spec.ts            login, session, logout
├── notifications.spec.ts   real alerts, filters, actions, counts, empty/error states
└── access-control.spec.ts  people, roles, zones, decision log, operator read-only
```

The e2e backend seeds the two roles a real deployment boots with (and
re-seeds them after each reset), plus a second **operator** account — the API
has no user-creation endpoint, so the read-only specs need one seeded.

Each `node:test` file runs in its own process, which is how the differing
environments (anonymous reads on vs off) stay isolated — `src/config/env.ts`
reads the environment once at import.

## Identity, zones and policy (backend)

Backend foundation for the MVP's identity model. **`restricted_area` is now
enforced** — a camera observation of a person entering a restricted zone is
evaluated server-side and either alerts or is suppressed and audited (see
[Restricted-area enforcement](#restricted-area-enforcement)). **`possible_weapon`
is now enforced the same way** — a browser reports a possible weapon and its
holder, and the server resolves the holder's identity from their AprilTag and
applies the global rule: an allowed role (a security guard) is suppressed and
audited, everyone else raises a critical alert (see
[Possible-weapon enforcement](#possible-weapon-enforcement)). `unattended_object`
has no role exemption.

All routes need a session. Reads are open to `admin` and `operator`; **every
mutation is `admin`-only**, matching the camera and vision routes.

### Action Catalog

`GET /api/action-catalog` — the actions policy can be written about. **Code-defined
and closed**: no route adds, edits or removes one, not even for an admin. An
action carries detection behaviour, severity, evidence requirements and policy
semantics, none of which an administrator can express by typing a name into a
form. New actions ship in code, reviewed and tested.

Every rule anywhere resolves to `restrict` unless an administrator wrote
otherwise (`DEFAULT_RULE`).

| Action | Scope | Detector | Configurable | Enforced |
|---|---|---|---|---|
| `restricted_area` | per zone | **live** | **yes** | **yes** |
| `possible_weapon` | global | **live** | **yes** | **yes** |
| `unattended_object` | global | live | no — always alerts | no |

`detector`, `configurable` and `policyEnforced` are three separate fields
because those rows occupy three different combinations of them. `restricted_area`
was configurable before it was enforced; the phase that shipped restricted-area
detection flipped its `detector` and `policyEnforced` flags in one file, and the
console reflects the change automatically.

`unattended_object` has **no role exemption, by design**. Once the person who
left an object walks away, ownership can't be established from a frame, so no
role can be trusted to excuse it. `possible_weapon` proposes candidates only —
the alert always says *possible*, a human always reviews, and nothing here
claims a weapon is confirmed. It **is** configurable and enforced: a role may be
granted a global allow (the security-guard exemption), and identity for that
exemption comes from an AprilTag alone — see
[Possible-weapon enforcement](#possible-weapon-enforcement).

### Roles

Roles here describe *people a camera may see* and are deliberately separate
from the `admin`/`operator` console roles in [Authentication](#authentication).

Two are seeded at first boot — `security_guard` and `staff` — **only when no
role exists at all**, so a role an administrator deactivates or removes is
never resurrected. Both start with **no rules at all**, which means allowed
nothing. Being permitted somewhere is a decision an admin makes, not a default
the software assumes. Admins can create further custom roles.

`unidentified_person` is a **reserved key** and rejected: it names the policy
subject every decision records, and a role sharing it would make a decision's
origin ambiguous.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/roles?active=` | |
| `GET` | `/api/roles/:id` | |
| `POST` | `/api/roles` | `{ key, name, description?, permissions? }` |
| `PATCH` | `/api/roles/:id` | Name, description, `active` (deactivate), permissions. `key` is immutable — recorded decisions refer to it |
| `DELETE` | `/api/roles/:id` | `409` while any person or policy decision references it. Deactivate instead |

`permissions` is `{ actions: [{ action, zoneId, rule }] }` — explicit rules
drawn from the [Action Catalog](#action-catalog). `rule` is `allow` or
`restrict`; `zoneId` is required for a zone-scoped action and `null` for a
global one. **A rule that isn't written restricts**: absence is not
permission, so a role with no rules is allowed nothing.

An explicit `restrict` and a missing rule have the same effect but are stored
differently on purpose — one records that somebody considered the case and
decided.

### People

One role each in this MVP. People are never deleted — deactivate or remove them,
so the credentials they held stay accounted for.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/people?active=&roleId=&q=` | |
| `GET` | `/api/people/:id` | |
| `POST` | `/api/people` | `{ name, roleId, notes?, loraDeviceId?, active? }` — the server allocates the AprilTag |
| `PATCH` | `/api/people/:id` | Also how you deactivate (`active: false`) and reassign a role (`roleId`) |
| `POST` | `/api/people/:id/issue-apriltag` | Allocate the next free tag to an existing active person who has none |
| `POST` | `/api/people/:id/remove` | Archive the person and release both credentials back to the pool |

**AprilTags are server-allocated, never client-chosen.** Every newly created
person automatically receives the lowest available valid **AprilTag 36h11** id;
a client-supplied `aprilTagId` on `POST` or `PATCH` is rejected with `400`. The
valid id range (0–586) is derived from the *same* installed js-aruco2 36h11
dictionary the frontend generator renders from, so the server can never allocate
an id the generator would refuse to draw. When the pool is exhausted, `POST`
returns `409`. An existing active person without a tag (registered before
automatic assignment, or reactivated after a release) is given one via
`issue-apriltag`.

`loraDeviceId` stays optional and independent of the tag, and is **unique when
present** (`409` on a clash, `null` to release).

**Remove and release** (`/remove`) is the only path that frees an AprilTag. It
keeps the Person record (so past policy/device audit rows still resolve) but sets
`active: false` and clears both `aprilTagId` and `loraDeviceId`, returning both
to the available pool and hiding the person from the default active list. An
ordinary deactivation (`active: false` via `PATCH`) never frees a tag — a
deactivated person keeps their credential reserved.

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

Zone names are unique per camera. Zones **drive restricted-area enforcement**
(see below); a zone must actually frame the doorway/floor for it to work.

### Unidentified / No Credential policy

`GET /api/unidentified-policy` (any session) and `PUT /api/unidentified-policy`
(admin) — policy for people the cameras **cannot identify**.

This is a reserved subject, not a Role and not a Person: it can't be assigned
to anybody, deleted, or created by an administrator. Somebody is evaluated
against it whenever there is no readable, registered AprilTag — including when
a LoRa device is right there, because a wristband is not a credential.

Everything restricts by default, so there is nothing to seed and no code path
that produces a permissive default. `GET` answers with an empty rule list
rather than a 404 when nobody has configured it: "no rules" is the real,
meaningful state, not a missing one. Reading it does not create the document.

Rules use the same `{ action, zoneId, rule }` shape as a role, validated by the
same code — a rule that validates in one place and not the other would be a way
around the other's review. Each rule carries its own `updatedBy`/`updatedAt`:
`allow` here admits *everyone* the cameras cannot identify, so who granted it
survives an unrelated edit to a different rule. Re-saving an unchanged rule
keeps its original author.

There is no `DELETE`: removing the policy would be indistinguishable from never
having configured one. Withdrawing permission means writing `restrict`.

### Policy decisions

`GET /api/policy-decisions` and `GET /api/policy-decisions/:id` — **read-only,
by design**. There is no create, update or delete route: an audit trail that
can be rewritten is not an audit trail.

Filters: `action`, `cameraId`, `zoneId`, `personId`, `subject`,
`unidentifiedReason`, `ruleSource`, `ruleApplied`, `decision`, `from`, `to`,
`limit`. An invalid filter is rejected rather than silently widening the view.

Each record stores the detection context inline — camera, zone, subject,
optional person/role/AprilTag/LoRa details, the rule and where it came from, a
human-readable reason and an optional alert reference. That is deliberate: a
*suppressed* detection produces no alert, so the decision record is the only
trace it ever happened and has to stand on its own.

Three fields carry the reasoning:

- `subject` — `person` (identified, evaluated against their role) or
  `unidentified_person`.
- `unidentifiedReason` — why nobody could be identified: `no_apriltag` (which
  covers a nearby wristband and no tag), `unregistered_apriltag`,
  `ambiguous_apriltag`, `inactive_person`, `inactive_role`.
- `ruleSource` — `role`, `unidentified_policy`, or `default` (nobody wrote a
  rule and the restrict default caught it). **`unidentified_policy` is what
  tells a reviewer the no-credential policy applied**, rather than something
  attached to a person.

Restricted-area enforcement writes these. Each also stores the `trackId` of the
camera track it was about, so repeats of one entry fold into a single episode.

### Restricted-area enforcement

`POST /api/vision/observations` (any session — an operator's browser posts it)
is where a camera reports a person entering a restricted zone. **The browser
sends CV facts only; the server makes every decision.** The payload carries no
identity, no rule and no outcome — the browser cannot make a policy decision,
by construction:

```jsonc
{
  "cameraId": "…", "zoneId": "…", "trackId": "…",
  "frame": { "width": 1000, "height": 1000 },
  "personBox": [x, y, w, h],          // video pixels
  "enteredFromOutside": true,          // CV: track was seen outside the zone first
  "framesInside": 5, "dwellMs": 2000,
  "aprilTags": [7],                    // raw decoded tag numbers, never resolved client-side
  "snapshot": "data:image/jpeg;base64,…"
}
```

**This is 2D camera-zone enforcement, not 3D tracking.** A person's *ground
point* is the bottom-centre of their box; they are "in" a zone when that point
falls inside the zone rectangle. Cameras must therefore be positioned to capture
the doorway/floor of the area they guard.

The server re-derives every quality gate from the payload — it never trusts the
client's copy — and drops the observation, writing nothing, unless it clears all
of them:

- the box is not clipped by the **bottom, left or right** edge (feet/sides cut
  off make the ground point unreliable; a clipped **top** is fine),
- the box is neither too small (far away / not a person) nor too large (too
  close, occluding the lens), by configurable height/area fractions,
- the ground point is inside the named zone,
- the track has been confirmed inside for a configurable number of frames and
  milliseconds — a single frame never fires,
- `enteredFromOutside` is true, so someone already standing inside when
  monitoring starts is not treated as an entry.

Only then does policy run, **entirely server-side**:

1. **Identity** comes from AprilTags alone. A LoRa wristband never identifies
   anyone — a nearby device with no readable tag is `no_apriltag`, exactly like
   carrying nothing.
2. **The rule** for that person (or the unidentified-person policy) in that zone
   is resolved, defaulting to `restrict`.
3. `allow` **suppresses** the alert and writes a `PolicyDecision`; anything else
   creates a **`restricted_area` alert** with its evidence snapshot, feeds the
   notification list, and writes a decision. Either way there is an audit
   record; a suppressed one is the only trace that detection happened.

Thresholds live on `VisionSettings.restrictedArea` (per camera). `restricted_area`
is a **server-only alert type**: `POST /api/vision/alerts` rejects it, so a
client cannot fabricate one and skip evaluation.

### Possible-weapon enforcement

`POST /api/vision/weapon-observations` is the weapon equivalent of the
restricted-area path, and works the same way: **the browser sends CV facts only;
the server makes every decision.** The browser runs the on-device YOLO11 weapon
model, applies its own veto / holder / N-of-M gates, and posts the surviving
box, the person holding it, that person's decoded AprilTag numbers, the model
confidence, and a snapshot. It never sends identity, a rule, or an outcome.

```jsonc
{
  "cameraId": "…", "trackId": "…",
  "frame": { "width": 1000, "height": 1000 },
  "weaponBox": [x, y, w, h],   // video pixels
  "personBox": [x, y, w, h],   // the holder, video pixels
  "confidence": 0.9,
  "framesConfirmed": 3,        // the browser's N-of-M count
  "aprilTags": [7],            // raw tag numbers on the holder, never resolved client-side
  "snapshot": "data:image/jpeg;base64,…"
}
```

`possible_weapon` is a **global** action (no zone). The server re-derives what it
can — the confidence floor, the confirmation count, and that the weapon box is
actually held (from the two boxes) — then resolves the holder's identity **from
AprilTags alone** and applies the global rule:

1. An `allow` rule for the holder's role — the **security-guard exemption** —
   suppresses the alert and writes a `PolicyDecision`, exactly like a suppressed
   restricted-area entry. A permitted carry is audited, not silent.
2. Anyone unidentified (no readable tag — a nearby LoRa wristband is **not** a
   credential), or with no `allow` rule, raises a **critical `weapon` alert**
   with its snapshot and full provenance.

**Honest limitation.** Unlike restricted-area geometry, the *presence* of a
weapon is a model inference the browser makes and the server cannot re-derive —
there is no model server-side. The server owns identity and policy; it trusts
the browser that a weapon was detected. The system fails toward safety: if the
guard's tag isn't readable at that moment, they are unidentified and it alerts.

`weapon` is a **server-only alert type**: `POST /api/vision/alerts` rejects it
(pointing the client at `/weapon-observations`), so a client cannot fabricate a
weapon alert and skip the exemption check. The catalog action key is
`possible_weapon`; the alert `type` stays `weapon`.

## Access Control (admin UI)

`/access-control` in the admin site is the front end for everything in
[Identity, zones and policy](#identity-zones-and-policy-backend). It is
**configuration only**: no detector reads a zone and no policy engine reads a
permission, so nothing configured here changes what the cameras do today. The
UI says so on the Roles, Zones and Unidentified tabs rather than leaving it to
be assumed.

Five tabs, each selectable via `?tab=` so a view can be linked to:

| Tab | Backed by |
|---|---|
| People | `/api/people`, `/api/roles`, `/api/lora-devices` |
| Roles | `/api/roles`, `/api/zones`, `/api/action-catalog` |
| Restricted Zones | `/api/zones`, `/api/roles`, `/api/cameras` |
| Unidentified | `/api/unidentified-policy`, `/api/zones`, `/api/action-catalog` |
| Decision Log | `/api/policy-decisions` |

Every screen reads a real authenticated endpoint. There is no mock data, no
localStorage fallback, and no fabricated device, person or zone. A failed
request shows an error state — never an empty list, which would read as "there
is nothing" when the truth is "we could not ask".

**Permissions.** Mutation controls render only for an `admin`; an `operator`
sees the data with a read-only notice and no write controls, matching the
admin-only mutation routes on the backend.

**People.** Each person shows whether they have an AprilTag, a LoRa device,
both, or neither, and the UI states what that combination means: only a
readable, registered AprilTag lets a camera recognize someone and apply their
role. A LoRa device corroborates that a registered wristband is active nearby
— it never identifies the person in a frame and grants no permissions. The
LoRa picker lists the real `/api/lora-devices` result with assignment state;
manual entry exists for hardware that has not reported yet, which is the only
device-registration flow the backend has.

**Roles.** A shared, catalog-driven editor renders every action from
`/api/action-catalog` — the UI never invents an action, its label, or its
reason for being unconfigurable. `restricted_area` shows a per-zone
Allow/Restrict control (controls appear only once a real zone exists);
`possible_weapon` and `unattended_object` render read-only with the catalog's
own reason, because neither is configurable yet. Allow writes a rule and
Restrict leaves the target unwritten — both deny, and a two-state control
can't express the difference between "denied" and "considered and denied", so
it never fabricates the latter. A rule for an unconfigurable action (a weapon
exemption carried across by the migration, say) is shown labelled *not
enforced* rather than hidden, and survives an unrelated edit rather than being
dropped by the wholesale replace.

**Unidentified / No Credential.** The same editor, backed by
`/api/unidentified-policy`, for everyone the cameras cannot identify.
Everything restricts by default. Because an `allow` here waves through *every*
unidentified person in that context — not one named individual — switching a
zone to Allow opens a confirmation naming the zone and stating the
consequence, and the Allow state is styled cautionary. Cancelling writes
nothing.

**Zones.** Rectangles are drawn with the same `ZoneDrawer` the Live Monitor
uses. This page doesn't run the vision pipeline, so it shows the grid rather
than a stale or fabricated frame preview. A zone's camera is fixed after
creation, mirroring the backend rule.

**Decision Log.** Read-only. Restricted-area enforcement writes to it now: each
row records the reasoning the audit trail exists for — subject (identified
person vs unidentified), the rule applied, and its source (a role rule, the
unidentified policy, or the restrict default). It stays empty only until a
camera actually observes an entry; nothing here is ever simulated.

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

## Wristband haptic commands (Pi + SX1278 bridge)

Location: `backend-spectra/src/modules/devices/`

Sends haptic (vibration) commands to a person's wristband. **No LoRa hardware
exists yet**, so this ships as a hardware-independent simulation with a clean
seam for the future radio bridge. Full message contract:
[`docs/pi-sx1278-bridge.md`](docs/pi-sx1278-bridge.md).

> The transport is **SX1278 433 MHz private point-to-point** — a raw LoRa link
> between a Raspberry Pi and each wristband. It is **not** LoRaWAN and shares
> nothing with the [LoRaWAN ingest module](#lorawan-ingest-module) above.

### The gateway seam

`HardwareGateway` (`deviceGateway.types.ts`) is the only thing that knows how a
command physically reaches a wristband:

- `SimulatedGateway` — the default in local/development. It fabricates a labelled
  round-trip (a `SIMULATED WRISTBAND`, a delivery, a vibration, an inline ack),
  stamps `simulated: true` on every event, and never touches hardware.
- `PiSx1278Gateway` — a placeholder that throws until the bridge exists. When
  built it will queue commands for the Pi to poll and receive the device's ack
  over HTTP.

`DEVICE_SIMULATION_ENABLED` selects the simulator. It defaults on in
local/development and the server **refuses to boot** with it set in production —
simulated delivery must never be mistaken for real hardware.

### Admin: Test Haptic

Access Control → People shows a **Test Haptic** action (admin only) on any
**active** person with an **assigned LoRa device**, and only while simulation is
enabled. It opens a clearly labelled simulation panel showing the fabricated
device, the delivery and vibration events, and the acknowledgement. No mock
people, devices, or commands are ever added to normal data — the simulated
device exists only inside the command's audit trail.

`POST /api/device-commands/test-haptic` `{ personId }` creates the command;
`GET /api/device-commands` lists them; `GET /api/device-commands/capabilities`
tells the console whether simulation is available (so it never offers an action
that could only 403).

### The bridge API (future Pi)

Under `/api/device-bridge`, authenticated by a shared-secret HMAC
(`DEVICE_BRIDGE_SECRET`, **never** a webhook secret) with timestamp-freshness and
nonce-replay protection — no session:

- `POST /api/device-bridge/uplinks` — submit a wristband status uplink.
- `GET /api/device-bridge/commands?deviceId=` — poll queued haptic commands
  (marks them delivered).
- `POST /api/device-bridge/commands/:nonce/ack` — acknowledge a command
  (idempotent on the nonce).

When `DEVICE_BRIDGE_SECRET` is unset the bridge is **closed** (`503`), never open;
production refuses to boot without it. See
[`docs/pi-sx1278-bridge.md`](docs/pi-sx1278-bridge.md) for the on-air frame
format and the full HTTP contract.

## Vision alerts API

Location: `backend-spectra/src/modules/vision/`

Alerts are AI-assisted signals for a human to review — never a confirmed
incident. Endpoints are under `{API_BASE_URL}/api/vision` and all require an
authenticated session. Reading and triaging alerts is open to `operator` and
`admin`; changing detection settings is `admin` only (see
[Authentication](#authentication)).

### Alert shape

| Field | Notes |
|---|---|
| `_id` | Alert id |
| `cameraId` | Camera the detection came from |
| `type` | `unattended_object` (client-posted), or `restricted_area` / `weapon` (server-only, from policy enforcement). Alerts recorded before the pose-based detectors were removed, or before AprilTag went silent, may also carry those types — see [Retired and silent detection types](#retired-and-silent-detection-types) |
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
| `policy` | Provenance for a policy-created alert (subject, rule source, unidentified reason, person/role, decision id). Set on `restricted_area` alerts; null on client-posted alerts, which were never evaluated |
| `createdAt` | First occurrence |

Severity defaults to `warning` when the client doesn't send one. A client may
send an explicit `severity` to override it.

### Retired and silent detection types

**AprilTag no longer alerts.** A tag is an identity credential: it says *who*
somebody is, which is an input to policy rather than an incident. Alerting on
it put a person's identity into the notification feed every time they walked
past a camera — noise, and a leak. Decoding still runs every tick and is still
tunable (`confidenceThreshold` sets decode strictness); it simply never reaches
the feed, and `POST /alerts` rejects `type: apriltag` with an explanatory
error. Resolving a tag to a person happens on the backend, so the browser never
learns who anyone is — the live overlay draws a tag *number* and nothing more.

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

For a local or development database whose alerts of these types are just stale
test data, an opt-in command removes them (retired types **and** `apriltag`).
It refuses to run against production, where that history is real. Worth knowing
for AprilTag specifically: a recorded one names a tag, so those rows are the
one place a past sighting can still surface in the feed — a reason to consider
purging them, not a reason to do it automatically:

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
| `POST` | `/alerts` | Create an alert (`201`), or group a repeat (`200`). Rejects `restricted_area` and `weapon` — those types are server-only, see [restricted-area](#restricted-area-enforcement) and [possible-weapon](#possible-weapon-enforcement) enforcement |
| `POST` | `/observations` | Report a restricted-zone entry for server-side evaluation → `{ status, outcome?, rejection? }` |
| `POST` | `/weapon-observations` | Report a possible weapon + its holder for server-side evaluation → `{ status, outcome?, rejection? }` (see [Possible-weapon enforcement](#possible-weapon-enforcement)) |
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

## License

This repository is licensed under the **GNU Affero General Public License
v3.0** — see [LICENSE](LICENSE). AGPL was chosen deliberately: the weapon
detector is trained with [Ultralytics YOLO11](https://github.com/ultralytics/ultralytics)
(AGPL-3.0), and this app serves the trained model to every browser, which is
distribution — open-sourcing the whole codebase under AGPL-3.0 is what makes
that use compliant.

The trained weights (`frontend-spectra/public/models/*.onnx`) are deploy
assets, gitignored, never committed. Training data licensing is tracked per
source in the training workspace, and no unlicensed model or dataset is used.
