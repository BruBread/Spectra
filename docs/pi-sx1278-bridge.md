# Wristband Haptic Commands — Raspberry Pi + SX1278 Bridge Contract

This document defines the message contract between the Spectra backend and the
**future** hardware bridge that delivers haptic (vibration) commands to
wristbands.

> **Transport: SX1278 433 MHz private point-to-point (P2P).**
> This is a raw LoRa radio link between a Raspberry Pi and each wristband. It is
> **not** LoRaWAN — there is no TTN, no ChirpStack, no network server, and no
> gateway fleet. The existing `lorawan-ingest` module (webhooks/MQTT) is a
> completely separate ingest path and shares nothing with this bridge.

## Status

- **Today (simulation phase):** the bridge does not exist. An in-process
  `SimulatedGateway` fabricates a clearly labelled round-trip so the end-to-end
  workflow can be built and demoed without hardware. Everything it produces is
  stamped `simulated: true` and can never be presented as real delivery.
- **Future:** a `PiSx1278Gateway` (placeholder today) queues commands for the Pi
  to fetch over the HTTP endpoints below, and the wristband's acknowledgement
  returns the same way.

The seam is `HardwareGateway` (`backend-spectra/src/modules/devices/deviceGateway.types.ts`).
Swapping simulation for hardware is a matter of which gateway the factory
returns — the model, service, and API do not change.

## Roles

```
Wristband  ⇄  (SX1278 433 MHz P2P)  ⇄  Raspberry Pi bridge  ⇄  (HTTPS)  ⇄  Spectra backend
```

- The **wristband** receives a haptic command, vibrates, and replies with an ack.
- The **Pi bridge** is a trusted relay: it polls the backend for queued
  commands, transmits them over the radio, and relays acks and status uplinks
  back to the backend.
- The **backend** is the system of record. Every command and acknowledgement is
  a durable, append-only audit record.

---

## 1. Backend ⇄ Pi — HTTP contract

Base path: `/api/device-bridge`. There is **no session** here — the Pi is not a
browser. Every request is authenticated with a shared secret (`DEVICE_BRIDGE_SECRET`).

### Authentication

`DEVICE_BRIDGE_SECRET` is a shared secret distinct from any webhook secret
(**never reuse one**). When it is unset the bridge is **closed**: every request
is refused with `503`, never served unauthenticated. In production a missing
secret is a hard boot error.

Every request carries three headers:

| Header | Meaning |
| --- | --- |
| `X-Bridge-Timestamp` | Unix seconds when the request was signed |
| `X-Bridge-Nonce`     | A unique random token, one per request |
| `X-Bridge-Signature` | Hex HMAC-SHA256 over the signing string below |

**Signing string:**

```
`${timestamp}.${METHOD}.${originalUrl}.${sha256hex(rawBody)}`
```

- `METHOD` is upper-case (`GET`, `POST`).
- `originalUrl` is the full path including query string, exactly as sent
  (e.g. `/api/device-bridge/commands?deviceId=wristband-001`).
- `sha256hex(rawBody)` is the hex SHA-256 of the exact request body bytes; for an
  empty body it is the SHA-256 of the empty string.
- The signature is `HMAC-SHA256(DEVICE_BRIDGE_SECRET, signingString)`, hex-encoded,
  compared in constant time.

**Replay protection:** the timestamp must be within a **±300s** freshness window,
and a nonce already seen inside that window is rejected. (Reference
implementation: `backend-spectra/src/modules/devices/bridge.auth.ts`.)

Rejections return `401` (bad/missing auth, stale timestamp, replayed nonce) or
`503` (bridge not configured).

### Endpoints

#### `POST /api/device-bridge/uplinks` — wristband status (device → backend)

Relay a wristband status report.

```jsonc
// request body
{
  "deviceId": "wristband-001",
  "batteryPct": 88,        // optional
  "status": "ok",          // optional, device-defined
  "rssi": -60,             // optional
  "snr": 7,                // optional
  "receivedAt": "2026-07-18T09:00:00Z"  // optional; defaults to now
}
// 202 Accepted
{ "accepted": true, "id": "..." }
```

#### `GET /api/device-bridge/commands?deviceId=...` — poll pending (backend → device)

Returns the queued, still-fresh haptic commands for one device and atomically
marks them `delivered`. Expired queued commands are swept to `expired` and never
handed out.

```jsonc
// 200 OK
{
  "deviceId": "wristband-001",
  "commands": [
    {
      "nonce": "9f2c…",                 // echo this in the ack
      "commandType": "haptic_vibrate",
      "params": { "pattern": "double-pulse", "pulses": 2, "durationMs": 600, "intensity": 3 },
      "expiresAt": "2026-07-18T09:02:00Z"
    }
  ]
}
```

The response carries only what the device needs to act and to acknowledge —
nothing more goes on the air.

#### `POST /api/device-bridge/commands/:nonce/ack` — acknowledge (device → backend)

Records that the wristband received/executed the command identified by `nonce`.
**Idempotent:** re-acking an already-acknowledged command returns `200`
unchanged (covers a Pi retrying a lost response). An unknown nonce returns `404`.

```jsonc
// request body
{
  "deviceStatus": "ok",    // optional, device-defined
  "executedAt": "2026-07-18T09:00:03Z",  // optional
  "rssi": -55,             // optional
  "snr": 8                 // optional
}
// 200 OK
{ "acknowledged": true, "status": "acknowledged", "nonce": "9f2c…" }
```

---

## 2. Pi ⇄ Wristband — SX1278 433 MHz P2P frame contract

The over-the-air frames are **not** specified by HTTP; this is the recommended
binding so the HTTP `nonce` and shared-secret model carry through to the radio.

Each wristband shares a **per-device secret** with the bridge (provisioned out of
band; may be derived from `DEVICE_BRIDGE_SECRET` + `deviceId` via HKDF, or stored
per device). Both frame types are authenticated with a truncated HMAC (MAC) so a
replayed or forged frame is rejected at the link layer.

### Command frame (Pi → wristband)

| Field | Bytes | Notes |
| --- | --- | --- |
| `deviceId` | var | target wristband id |
| `nonce` | 16 | the command nonce from the poll response (hex-decoded) |
| `commandType` | 1 | `0x01` = `haptic_vibrate` |
| `params` | 4 | `pattern` code, `pulses`, `durationMs/50`, `intensity` |
| `mac` | 8 | `HMAC-SHA256(deviceSecret, deviceId‖nonce‖commandType‖params)` truncated to 8 bytes |

The wristband recomputes the MAC and drops the frame on mismatch; it also
rejects a `nonce` it has already executed (replay protection at the device).

### Acknowledgement frame (wristband → Pi)

| Field | Bytes | Notes |
| --- | --- | --- |
| `nonce` | 16 | echoes the command nonce — this is what makes the ack idempotent |
| `deviceStatus` | 1 | `0x00` = ok, non-zero = device-defined error |
| `mac` | 8 | `HMAC-SHA256(deviceSecret, nonce‖deviceStatus)` truncated to 8 bytes |

The Pi verifies the MAC, then forwards the ack to
`POST /api/device-bridge/commands/:nonce/ack`.

---

## Contract invariants

- **Device ID** identifies the wristband end to end (assigned to a `Person` in
  Access Control). A command's `deviceId` is always the assigned device of the
  targeted person.
- **Command nonce** is server-issued (128-bit random), unique, echoed in the
  ack. It provides idempotent acknowledgement and replay rejection on both the
  HTTP and radio legs.
- **Acknowledgement** is preserved for every command, real or simulated, along
  with the full labelled delivery trail — the audit record is append-only.
- **Shared-secret authentication** gates the HTTP bridge (`DEVICE_BRIDGE_SECRET`)
  and, per-device, the radio frames. It is never a webhook secret.
- **Simulation is never real.** The simulated transport stamps `simulated: true`
  on every event and ack, is enabled only in local/development, and is refused at
  boot in production.
