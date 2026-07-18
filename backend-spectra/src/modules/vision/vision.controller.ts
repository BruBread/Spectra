import type { NextFunction, Request, Response } from 'express';
import * as visionService from './vision.service.js';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALL_DETECTION_TYPES,
  DETECTION_TYPES,
  POLICY_ALERT_TYPES,
  SILENT_DETECTION_TYPES,
  type AlertSeverity,
  type AlertStatus,
  type AnyDetectionType,
  type DetectionType,
} from './vision.types.js';

const DEFAULT_CAMERA_ID = 'webcam-default';

/** Creation is limited to types the system can still produce. */
function isDetectionType(value: unknown): value is DetectionType {
  return typeof value === 'string' && (DETECTION_TYPES as string[]).includes(value);
}

/** Filtering also accepts retired types, so recorded history stays searchable. */
function isAnyDetectionType(value: unknown): value is AnyDetectionType {
  return typeof value === 'string' && (ALL_DETECTION_TYPES as string[]).includes(value);
}

function isAlertSeverity(value: unknown): value is AlertSeverity {
  return typeof value === 'string' && (ALERT_SEVERITIES as string[]).includes(value);
}

function isAlertStatus(value: unknown): value is AlertStatus {
  return typeof value === 'string' && (ALERT_STATUSES as string[]).includes(value);
}

/** A filter that's present but unparseable is rejected — silently ignoring it would widen results instead of narrowing them. */
class FilterError extends Error {}

function parseDateFilter(value: unknown, field: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') {
    throw new FilterError(`${field} must be an ISO date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new FilterError(`${field} must be a valid ISO date string (received "${value}")`);
  }
  return date;
}

function parseBooleanFilter(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new FilterError(`${field} must be "true" or "false"`);
}

/** Accepts `status=new` or `status=new,under_review`. */
function parseStatusFilter(value: unknown): AlertStatus[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') {
    throw new FilterError(`status must be one of: ${ALERT_STATUSES.join(', ')}`);
  }
  const statuses = value.split(',').map((entry) => entry.trim());
  for (const status of statuses) {
    if (!isAlertStatus(status)) {
      throw new FilterError(`status "${status}" is not one of: ${ALERT_STATUSES.join(', ')}`);
    }
  }
  return statuses as AlertStatus[];
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const cameraId = typeof req.query.cameraId === 'string' ? req.query.cameraId : DEFAULT_CAMERA_ID;
    const settings = await visionService.getSettings(cameraId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function putSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const cameraId = typeof req.body.cameraId === 'string' ? req.body.cameraId : DEFAULT_CAMERA_ID;
    const settings = await visionService.replaceSettings(
      cameraId,
      {
        processingIntervalMs: req.body.processingIntervalMs,
        retentionDays: req.body.retentionDays,
        detectors: req.body.detectors,
      },
      req.user!.id,
    );
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function listAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    const { cameraId, type, severity, zoneName, limit } = req.query;

    if (type !== undefined && !isAnyDetectionType(type)) {
      res.status(400).json({ error: `type must be one of: ${ALL_DETECTION_TYPES.join(', ')}` });
      return;
    }
    if (severity !== undefined && !isAlertSeverity(severity)) {
      res.status(400).json({ error: `severity must be one of: ${ALERT_SEVERITIES.join(', ')}` });
      return;
    }

    const alerts = await visionService.listAlerts({
      cameraId: typeof cameraId === 'string' ? cameraId : undefined,
      type: isAnyDetectionType(type) ? type : undefined,
      severity: isAlertSeverity(severity) ? severity : undefined,
      status: parseStatusFilter(req.query.status),
      zoneName: typeof zoneName === 'string' ? zoneName : undefined,
      read: parseBooleanFilter(req.query.read, 'read'),
      acknowledged: parseBooleanFilter(req.query.acknowledged, 'acknowledged'),
      from: parseDateFilter(req.query.from, 'from'),
      to: parseDateFilter(req.query.to, 'to'),
      limit: Math.min(Number(limit) || 50, 200),
    });
    res.json(alerts);
  } catch (error) {
    if (error instanceof FilterError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function getAlertCounts(_req: Request, res: Response, next: NextFunction) {
  try {
    const counts = await visionService.countAlerts();
    res.json(counts);
  } catch (error) {
    next(error);
  }
}

export async function createAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const { cameraId, type, confidence, message, severity, zoneName, snapshot, metadata } = req.body;
    if (!cameraId || typeof confidence !== 'number' || !message) {
      res.status(400).json({ error: 'cameraId, type, confidence (number), and message are required' });
      return;
    }
    if (!isDetectionType(type)) {
      // Naming each rejected case explicitly: a client still sending one is
      // out of date, and "invalid type" alone would not say why.
      const policy = (POLICY_ALERT_TYPES as string[]).includes(String(type));
      const silent = (SILENT_DETECTION_TYPES as string[]).includes(String(type));
      const retired = (ALL_DETECTION_TYPES as string[]).includes(String(type));
      res.status(400).json({
        error: policy
          ? `Detection type "${type}" is created by server-side policy enforcement, not by clients. Post a camera observation to /api/vision/observations and the server decides whether to alert. Client-postable types: ${DETECTION_TYPES.join(', ')}`
          : silent
            ? `Detection type "${type}" is a silent identity capability and no longer creates alerts. It is read as a credential by policy evaluation instead. Alerting types: ${DETECTION_TYPES.join(', ')}`
            : retired
              ? `Detection type "${type}" has been retired and can no longer be recorded. Active types: ${DETECTION_TYPES.join(', ')}`
              : `type must be one of: ${DETECTION_TYPES.join(', ')}`,
      });
      return;
    }
    if (severity !== undefined && !isAlertSeverity(severity)) {
      res.status(400).json({ error: `severity must be one of: ${ALERT_SEVERITIES.join(', ')}` });
      return;
    }

    const result = await visionService.createAlert({
      cameraId,
      type,
      confidence,
      message,
      severity,
      zoneName,
      snapshot,
      metadata,
    });
    res.status(result.deduped ? 200 : 201).json(result.alert);
  } catch (error) {
    next(error);
  }
}

export async function updateAlertStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body;
    if (!isAlertStatus(status)) {
      res.status(400).json({ error: `status must be one of: ${ALERT_STATUSES.join(', ')}` });
      return;
    }

    const alert = await visionService.setAlertStatus(String(req.params.id), status, req.user!.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    res.json(alert);
  } catch (error) {
    next(error);
  }
}

export async function markAlertRead(req: Request, res: Response, next: NextFunction) {
  try {
    const read = req.body?.read === undefined ? true : req.body.read;
    if (typeof read !== 'boolean') {
      res.status(400).json({ error: 'read must be a boolean' });
      return;
    }

    const alert = await visionService.markAlertRead(String(req.params.id), read);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    res.json(alert);
  } catch (error) {
    next(error);
  }
}

export async function markAllAlertsRead(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await visionService.markAllAlertsRead();
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/** Legacy endpoint — superseded by updateAlertStatus, kept so existing clients keep working. */
export async function acknowledgeAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const alert = await visionService.acknowledgeAlert(String(req.params.id), req.user!.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    res.json(alert);
  } catch (error) {
    next(error);
  }
}
