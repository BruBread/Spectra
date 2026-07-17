import type { DetectionType } from '../../src/modules/vision/vision.types.js';

/**
 * Reproducible test data owned entirely by the test suite.
 *
 * Nothing here references real records: ids and names are obviously synthetic
 * so a stray assertion can never accidentally pass against production-like
 * data. The in-memory database is discarded after each run, so this data never
 * outlives the tests that made it.
 */

export const TEST_ADMIN = { name: 'Test Admin', email: 'test-admin@example.test', password: 'test-admin-pw-1' };
export const TEST_OPERATOR = { name: 'Test Operator', email: 'test-operator@example.test', password: 'test-operator-pw-1' };

export const TEST_CAMERA_ID = 'test-camera-alpha';
export const TEST_CAMERA_ID_B = 'test-camera-beta';
export const TEST_DEVICE_ID = 'test-device-001';

interface AlertInput {
  cameraId?: string;
  type?: DetectionType;
  confidence?: number;
  message?: string;
  severity?: string;
  zoneName?: string;
  metadata?: Record<string, unknown>;
}

/** Body for POST /api/vision/alerts with test-owned defaults. */
export function alertBody(input: AlertInput = {}) {
  return {
    cameraId: input.cameraId ?? TEST_CAMERA_ID,
    type: input.type ?? 'running',
    confidence: input.confidence ?? 0.7,
    message: input.message ?? 'Test detection — synthetic fixture',
    ...(input.severity !== undefined && { severity: input.severity }),
    ...(input.zoneName !== undefined && { zoneName: input.zoneName }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };
}

/** A TTN uplink shaped like the parser expects, for seeding device readings. */
export function ttnUplinkBody(deviceId = TEST_DEVICE_ID) {
  return {
    end_device_ids: { device_id: deviceId },
    uplink_message: {
      f_port: 1,
      frm_payload: 'AQ==',
      received_at: '2026-01-01T00:00:00Z',
    },
  };
}

export function jsonHeaders(cookie?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

/** fetch's json() resolves to `unknown`; declare the shape at the call site. */
export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
