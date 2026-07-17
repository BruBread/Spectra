import { AprilTagMapping, VisionAlert, VisionSettings } from './vision.model.js';
import {
  DETECTION_TYPES,
  OPEN_ALERT_STATUSES,
  acknowledgedForStatus,
  defaultDetectorConfigs,
  defaultSeverityForType,
  type AlertSeverity,
  type AlertStatus,
  type DetectionType,
} from './vision.types.js';

export async function getSettings(cameraId: string) {
  let settings = await VisionSettings.findOne({ cameraId });

  if (!settings) {
    settings = await VisionSettings.create({
      cameraId,
      processingIntervalMs: 500,
      retentionDays: 14,
      detectors: defaultDetectorConfigs(),
    });
    return settings;
  }

  const existingTypes = new Set(settings.detectors.map((detector) => detector.type));
  const missing = DETECTION_TYPES.filter((type) => !existingTypes.has(type));
  if (missing.length > 0) {
    const backfill = defaultDetectorConfigs().filter((detector) => missing.includes(detector.type));
    settings.detectors.push(...(backfill as (typeof settings.detectors)[number][]));
    await settings.save();
  }

  return settings;
}

export async function replaceSettings(
  cameraId: string,
  update: { processingIntervalMs?: number; retentionDays?: number; detectors?: unknown },
  actorId: string,
) {
  const settings = await VisionSettings.findOneAndUpdate(
    { cameraId },
    {
      $set: {
        ...(update.processingIntervalMs !== undefined && { processingIntervalMs: update.processingIntervalMs }),
        ...(update.retentionDays !== undefined && { retentionDays: update.retentionDays }),
        ...(update.detectors !== undefined && { detectors: update.detectors }),
        updatedBy: actorId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return settings;
}

export function listAprilTagMappings() {
  return AprilTagMapping.find().sort({ tagId: 1 });
}

export function createAprilTagMapping(
  data: { tagId: number; label: string; loraDeviceId: string; notes?: string },
  actorId: string,
) {
  return AprilTagMapping.create({ ...data, createdBy: actorId, updatedBy: actorId });
}

export function updateAprilTagMapping(
  id: string,
  data: Partial<{ label: string; loraDeviceId: string; notes: string }>,
  actorId: string,
) {
  return AprilTagMapping.findByIdAndUpdate(id, { $set: { ...data, updatedBy: actorId } }, { new: true });
}

export function deleteAprilTagMapping(id: string) {
  return AprilTagMapping.findByIdAndDelete(id);
}

interface ListAlertsParams {
  cameraId?: string;
  type?: DetectionType;
  severity?: AlertSeverity;
  status?: AlertStatus[];
  zoneName?: string;
  read?: boolean;
  /** Legacy filter, still honoured for existing clients. */
  acknowledged?: boolean;
  from?: Date;
  to?: Date;
  limit: number;
}

export function listAlerts({
  cameraId,
  type,
  severity,
  status,
  zoneName,
  read,
  acknowledged,
  from,
  to,
  limit,
}: ListAlertsParams) {
  const query: Record<string, unknown> = {};
  if (cameraId) query.cameraId = cameraId;
  if (type) query.type = type;
  if (severity) query.severity = severity;
  if (status && status.length > 0) query.status = status.length === 1 ? status[0] : { $in: status };
  if (zoneName) query.zoneName = zoneName;
  if (read !== undefined) query.read = read;
  if (acknowledged !== undefined) query.acknowledged = acknowledged;
  if (from || to) {
    query.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  }

  return VisionAlert.find(query).sort({ createdAt: -1 }).limit(limit);
}

export async function countAlerts() {
  const [unread, criticalOpen, newCount] = await Promise.all([
    VisionAlert.countDocuments({ read: false }),
    VisionAlert.countDocuments({ severity: 'critical', status: { $in: OPEN_ALERT_STATUSES } }),
    VisionAlert.countDocuments({ status: 'new' }),
  ]);

  return { unread, criticalOpen, new: newCount };
}

interface CreateAlertInput {
  cameraId: string;
  type: DetectionType;
  confidence: number;
  message: string;
  severity?: AlertSeverity;
  zoneName?: string | null;
  snapshot?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Groups repeats instead of stacking duplicates: a detection for the same
 * camera + type + tracked entity arriving inside that detector's cooldown
 * window folds into the existing alert, bumping `occurrences` and
 * `lastOccurredAt`. The original record — including its snapshot, confidence
 * and createdAt — is never overwritten or replaced.
 *
 * Two deliberate limits on grouping:
 * - Only alerts still open (new/acknowledged/under_review) absorb repeats. A
 *   resolved or dismissed alert stays closed and the repeat raises a fresh
 *   alert, so an event recurring after sign-off can't be silently swallowed.
 * - The window is measured from the original `createdAt`, so a condition that
 *   persists past the cooldown raises a new alert rather than incrementing
 *   one row forever.
 *
 * `read` is left alone on purpose — re-flagging a grouped alert as unread on
 * every repeat is the notification spam this is meant to prevent.
 *
 * The primary dedup logic (duration thresholds, per-track cooldowns) lives in
 * the client pipeline; this is a defense-in-depth backstop for retries and
 * double-fires, not the main mechanism.
 */
export async function createAlert(input: CreateAlertInput) {
  const settings = await getSettings(input.cameraId);
  const detectorConfig = settings.detectors.find((detector) => detector.type === input.type);
  const cooldownSeconds = detectorConfig?.cooldownSeconds ?? 30;

  const trackId = typeof input.metadata?.trackId === 'string' || typeof input.metadata?.trackId === 'number'
    ? input.metadata.trackId
    : undefined;

  const groupQuery: Record<string, unknown> = {
    cameraId: input.cameraId,
    type: input.type,
    status: { $in: OPEN_ALERT_STATUSES },
    createdAt: { $gte: new Date(Date.now() - cooldownSeconds * 1000) },
  };
  if (trackId !== undefined) {
    groupQuery['metadata.trackId'] = trackId;
  }

  const grouped = await VisionAlert.findOneAndUpdate(
    groupQuery,
    { $inc: { occurrences: 1 }, $set: { lastOccurredAt: new Date() } },
    { new: true, sort: { createdAt: -1 } },
  );
  if (grouped) {
    return { alert: grouped, deduped: true as const };
  }

  const now = new Date();
  const alert = await VisionAlert.create({
    cameraId: input.cameraId,
    type: input.type,
    severity: input.severity ?? defaultSeverityForType(input.type),
    status: 'new',
    read: false,
    acknowledged: false,
    zoneName: input.zoneName ?? null,
    confidence: input.confidence,
    message: input.message,
    snapshot: input.snapshot ?? null,
    metadata: input.metadata ?? {},
    occurrences: 1,
    lastOccurredAt: now,
  });

  const retentionDays = settings.retentionDays ?? 14;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  VisionAlert.deleteMany({ cameraId: input.cameraId, createdAt: { $lt: cutoff } }).exec();

  return { alert, deduped: false as const };
}

/**
 * Moving an alert out of `new` also marks it read: a human had to look at it
 * to triage it, so leaving it in the unread badge would just double the work.
 */
export function setAlertStatus(id: string, status: AlertStatus, actorId: string) {
  const update: Record<string, unknown> = {
    status,
    acknowledged: acknowledgedForStatus(status),
    statusChangedBy: actorId,
    statusChangedAt: new Date(),
  };
  if (status !== 'new') {
    update.read = true;
  }
  return VisionAlert.findByIdAndUpdate(id, { $set: update }, { new: true });
}

export function markAlertRead(id: string, read: boolean) {
  return VisionAlert.findByIdAndUpdate(id, { $set: { read } }, { new: true });
}

export async function markAllAlertsRead() {
  const result = await VisionAlert.updateMany({ read: false }, { $set: { read: true } });
  return { modified: result.modifiedCount ?? 0 };
}

/** Legacy path kept for the existing `PATCH /alerts/:id` endpoint. */
export function acknowledgeAlert(id: string, actorId: string) {
  return setAlertStatus(id, 'acknowledged', actorId);
}
