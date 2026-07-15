export interface NormalizedUplink {
  provider: 'ttn' | 'chirpstack';
  deviceId: string;
  devEui?: string;
  applicationId?: string;
  fPort?: number;
  fCnt?: number;
  payloadRaw?: string;
  payloadDecoded?: Record<string, unknown> | null;
  rssi?: number;
  snr?: number;
  frequency?: number;
  dataRate?: string;
  gatewayIds?: string[];
  receivedAt: Date;
  raw: unknown;
}
