import { AprilTagMapping, VisionAlert, VisionSettings } from './vision.model.js';
import { DETECTION_TYPES, defaultDetectorConfigs, type DetectionType } from './vision.types.js';

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
) {
  const settings = await VisionSettings.findOneAndUpdate(
    { cameraId },
    {
      $set: {
        ...(update.processingIntervalMs !== undefined && { processingIntervalMs: update.processingIntervalMs }),
        ...(update.retentionDays !== undefined && { retentionDays: update.retentionDays }),
        ...(update.detectors !== undefined && { detectors: update.detectors }),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return settings;
}

export function listAprilTagMappings() {
  return AprilTagMapping.find().sort({ tagId: 1 });
}

export function createAprilTagMapping(data: { tagId: number; label: string; loraDeviceId: string; notes?: string }) {
  return AprilTagMapping.create(data);
}

export function updateAprilTagMapping(id: string, data: Partial<{ label: string; loraDeviceId: string; notes: string }>) {
  return AprilTagMapping.findByIdAndUpdate(id, { $set: data }, { new: true });
}

export function deleteAprilTagMapping(id: string) {
  return AprilTagMapping.findByIdAndDelete(id);
}

interface ListAlertsParams {
  cameraId?: string;
  type?: DetectionType;
  acknowledged?: boolean;
  limit: number;
}

export function listAlerts({ cameraId, type, acknowledged, limit }: ListAlertsParams) {
  const query: Record<string, unknown> = {};
  if (cameraId) query.cameraId = cameraId;
  if (type) query.type = type;
  if (acknowledged !== undefined) query.acknowledged = acknowledged;

  return VisionAlert.find(query).sort({ createdAt: -1 }).limit(limit);
}

interface CreateAlertInput {
  cameraId: string;
  type: DetectionType;
  confidence: number;
  message: string;
  snapshot?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Guards against duplicate alerts slipping through if a client retries or
 * double-fires: rejects a new alert for the same camera+type+tracked entity
 * within that detector's configured cooldown window. The primary dedup
 * logic (duration thresholds, per-track cooldowns) lives in the client
 * pipeline — this is a defense-in-depth backstop, not the main mechanism.
 */
export async function createAlert(input: CreateAlertInput) {
  const settings = await getSettings(input.cameraId);
  const detectorConfig = settings.detectors.find((detector) => detector.type === input.type);
  const cooldownSeconds = detectorConfig?.cooldownSeconds ?? 30;

  const trackId = typeof input.metadata?.trackId === 'string' || typeof input.metadata?.trackId === 'number'
    ? input.metadata.trackId
    : undefined;

  const dedupeQuery: Record<string, unknown> = {
    cameraId: input.cameraId,
    type: input.type,
    createdAt: { $gte: new Date(Date.now() - cooldownSeconds * 1000) },
  };
  if (trackId !== undefined) {
    dedupeQuery['metadata.trackId'] = trackId;
  }

  const recentDuplicate = await VisionAlert.findOne(dedupeQuery);
  if (recentDuplicate) {
    return { alert: recentDuplicate, deduped: true as const };
  }

  const alert = await VisionAlert.create({
    cameraId: input.cameraId,
    type: input.type,
    confidence: input.confidence,
    message: input.message,
    snapshot: input.snapshot ?? null,
    metadata: input.metadata ?? {},
  });

  const retentionDays = settings.retentionDays ?? 14;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  VisionAlert.deleteMany({ cameraId: input.cameraId, createdAt: { $lt: cutoff } }).exec();

  return { alert, deduped: false as const };
}

export function acknowledgeAlert(id: string) {
  return VisionAlert.findByIdAndUpdate(id, { $set: { acknowledged: true } }, { new: true });
}
