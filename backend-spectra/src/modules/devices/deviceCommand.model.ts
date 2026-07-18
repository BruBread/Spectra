import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * A single command sent to a wristband/device — today only a haptic vibrate.
 *
 * The record is the audit trail: it captures who issued it, which device it was
 * aimed at, the transport that carried it, every delivery event, and the
 * acknowledgement. Nothing is deleted, so a simulated command and a future real
 * one leave the same durable history.
 */

export const COMMAND_TYPES = ['haptic_vibrate'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export const COMMAND_STATUSES = ['queued', 'delivered', 'acknowledged', 'failed', 'expired'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/** The two ways a command can reach a device. `simulation` never touches hardware. */
export const COMMAND_TRANSPORTS = ['simulation', 'pi_sx1278_p2p'] as const;
export type CommandTransport = (typeof COMMAND_TRANSPORTS)[number];

/** Where the command originated. Extensible; only the admin test button exists now. */
export const COMMAND_ORIGINS = ['admin_test'] as const;
export type CommandOrigin = (typeof COMMAND_ORIGINS)[number];

/** One labelled step in the command's life, e.g. "queued", "vibration", "acknowledged". */
const deliveryEventSchema = new Schema(
  {
    at: { type: Date, required: true },
    label: { type: String, required: true },
    detail: { type: String, default: '' },
    /**
     * True when the event was produced by the simulator rather than real
     * hardware. Carried on every simulated event so the UI can never present a
     * fake buzz as a real one.
     */
    simulated: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/** The device's report back. Null until the device (or simulator) acknowledges. */
const ackSchema = new Schema(
  {
    receivedAt: { type: Date, required: true },
    executedAt: { type: Date, default: null },
    deviceStatus: { type: String, default: '' },
    rssi: { type: Number, default: null },
    snr: { type: Number, default: null },
    simulated: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const deviceCommandSchema = new Schema(
  {
    /** The LoRa device id of the target wristband. */
    deviceId: { type: String, required: true, trim: true, index: true },
    /** Who it was aimed at, for the audit trail. Kept even if the person changes. */
    personId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    personName: { type: String, default: '' },
    commandType: { type: String, enum: COMMAND_TYPES, required: true },
    params: {
      /** A short label for the haptic shape, e.g. "double-pulse". */
      pattern: { type: String, default: 'double-pulse' },
      pulses: { type: Number, default: 2 },
      durationMs: { type: Number, default: 600 },
      /** 1–5, device-defined strength. */
      intensity: { type: Number, default: 3 },
    },
    /**
     * Server-issued, unique. The device echoes it in its ack, which makes the
     * acknowledgement idempotent and lets the P2P link reject replays.
     */
    nonce: { type: String, required: true, unique: true, index: true },
    transport: { type: String, enum: COMMAND_TRANSPORTS, required: true },
    /** True whenever the command was handled by the simulator. Never real hardware. */
    simulated: { type: Boolean, required: true, default: false },
    status: { type: String, enum: COMMAND_STATUSES, required: true, default: 'queued', index: true },
    origin: { type: String, enum: COMMAND_ORIGINS, required: true, default: 'admin_test' },
    /** The admin who triggered it. */
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    issuedByEmail: { type: String, default: '' },
    delivery: {
      events: { type: [deliveryEventSchema], default: [] },
    },
    ack: { type: ackSchema, default: null },
    error: { type: String, default: null },
    /** Set when the command left `queued` for a device. */
    deliveredAt: { type: Date, default: null },
    /** Set when the ack landed. */
    acknowledgedAt: { type: Date, default: null },
    /** Queued commands stale out after this. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// The command list and the bridge poll both read newest-first by device.
deviceCommandSchema.index({ deviceId: 1, createdAt: -1 });

export type DeviceCommandDocument = HydratedDocument<InferSchemaType<typeof deviceCommandSchema>>;

export const DeviceCommand = model('DeviceCommand', deviceCommandSchema);
