'use client';

import { useState } from 'react';
import { BadgeCheck, CheckCircle2, FlaskConical, Loader2, Radio, Vibrate, XCircle } from 'lucide-react';
import type { Person } from '../../lib/accessControl/types';
import type { DeviceCapabilities, DeviceCommand } from '../../lib/api/deviceCommands';
import { sendTestHaptic } from '../../lib/api/deviceCommands';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import styles from './accessControl.module.css';

interface TestHapticModalProps {
  person: Person;
  capabilities: DeviceCapabilities;
  onClose: () => void;
}

/**
 * Fires a *simulated* haptic at a person's wristband and shows the fabricated
 * round-trip: a clearly labelled simulated device, the delivery events, the
 * vibration, and the acknowledgement.
 *
 * The word "simulated" is not decoration — every panel here is gated on the
 * command's own `simulated` flag, so if a real transport were ever wired in
 * this UI would stop calling it a simulation on its own.
 */
export function TestHapticModal({ person, capabilities, onClose }: TestHapticModalProps) {
  const [sending, setSending] = useState(false);
  const [command, setCommand] = useState<DeviceCommand | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    const result = await sendTestHaptic(person.id);
    setSending(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Could not send the test haptic.');
      return;
    }
    setCommand(result.data);
  };

  const isSimulated = command?.simulated ?? capabilities.simulated;

  return (
    <Modal
      open
      onClose={onClose}
      title="Test haptic"
      description={`Send a simulated vibration to ${person.name}'s wristband.`}
      size="md"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void send()} disabled={sending}>
              {sending ? <Loader2 size={14} className={styles.spin} aria-hidden="true" /> : <Vibrate size={14} aria-hidden="true" />}
              {command ? 'Send again' : 'Send test haptic'}
            </Button>
          </div>
        </div>
      }
    >
      {/* Persistent, unmissable: nothing here is real hardware. */}
      <div className={styles.simBanner} role="note">
        <FlaskConical size={16} aria-hidden="true" />
        <span>
          <strong>Simulation only.</strong> No LoRa hardware is involved — the wristband, delivery and vibration below
          are fabricated so the workflow can be exercised before the Raspberry Pi + SX1278 bridge exists.
        </span>
      </div>

      <div className={styles.simDeviceCard}>
        <div className={styles.simDeviceHead}>
          <Radio size={16} aria-hidden="true" />
          <span className={styles.mono}>SIMULATED WRISTBAND ({person.loraDeviceId})</span>
          <Badge tone="info">Simulated</Badge>
        </div>
        <p className={styles.cellMuted}>
          Assigned to {person.name}. A LoRa device only corroborates activity — it never identifies anyone.
        </p>
      </div>

      {error ? (
        <p className={styles.errorText}>
          <XCircle size={14} aria-hidden="true" /> {error}
        </p>
      ) : null}

      {command ? (
        <div className={styles.commandResult}>
          <div className={styles.commandStatusRow}>
            <Badge tone={statusTone(command.status)}>{STATUS_LABELS[command.status]}</Badge>
            {isSimulated ? <Badge tone="info">Simulated delivery</Badge> : <Badge tone="warning">Real delivery</Badge>}
            <span className={styles.mono}>nonce {command.nonce.slice(0, 12)}…</span>
          </div>

          <ol className={styles.eventList}>
            {command.events.map((event, index) => (
              <li key={`${event.label}-${index}`} className={styles.eventItem}>
                <span className={styles.eventDot} aria-hidden="true" />
                <div>
                  <div className={styles.eventLabelRow}>
                    <strong>{event.label}</strong>
                    {event.simulated ? <span className={styles.simTag}>simulated</span> : null}
                  </div>
                  <p className={styles.cellMuted}>{event.detail}</p>
                  <span className={styles.eventTime}>{formatDateTime(event.at)}</span>
                </div>
              </li>
            ))}
          </ol>

          {command.ack ? (
            <div className={styles.ackCard}>
              <div className={styles.eventLabelRow}>
                <BadgeCheck size={16} aria-hidden="true" />
                <strong>Acknowledgement</strong>
                {command.ack.simulated ? <span className={styles.simTag}>simulated</span> : null}
              </div>
              <dl className={styles.ackGrid}>
                <div>
                  <dt>Device status</dt>
                  <dd>{command.ack.deviceStatus || '—'}</dd>
                </div>
                <div>
                  <dt>Executed at</dt>
                  <dd>{command.ack.executedAt ? formatDateTime(command.ack.executedAt) : '—'}</dd>
                </div>
                <div>
                  <dt>RSSI / SNR</dt>
                  <dd>
                    {command.ack.rssi ?? '—'} dBm / {command.ack.snr ?? '—'} dB
                  </dd>
                </div>
              </dl>
            </div>
          ) : command.status === 'delivered' ? (
            <p className={styles.cellMuted}>
              <CheckCircle2 size={14} aria-hidden="true" /> Delivered; awaiting the device acknowledgement.
            </p>
          ) : null}
        </div>
      ) : (
        <p className={styles.cellMuted}>
          Press <strong>Send test haptic</strong> to run a simulated delivery and see the acknowledgement trail.
        </p>
      )}
    </Modal>
  );
}

const STATUS_LABELS: Record<DeviceCommand['status'], string> = {
  queued: 'Queued',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
  failed: 'Failed',
  expired: 'Expired',
};

function statusTone(status: DeviceCommand['status']): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'acknowledged':
      return 'success';
    case 'delivered':
    case 'queued':
      return 'info';
    case 'failed':
    case 'expired':
      return 'danger';
    default:
      return 'neutral';
  }
}
