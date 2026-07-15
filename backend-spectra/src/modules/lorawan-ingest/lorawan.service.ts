import { DeviceReading } from './lorawan.model.js';
import type { NormalizedUplink } from './parsers/types.js';

export async function persistUplink(uplink: NormalizedUplink) {
  return DeviceReading.create(uplink);
}
