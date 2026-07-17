import { CREDENTIAL_LABELS, credentialState, type Person } from '../../lib/accessControl/types';
import { Badge, type BadgeTone } from '../ui/Badge';
import styles from './accessControl.module.css';

/**
 * Tone reflects camera recognizability, not preference.
 *
 * An AprilTag is the only credential a camera can read, so anything without
 * one is neutral — a LoRa device is not a lesser identity, it is not an
 * identity at all, and colouring it as partial progress toward one would be a
 * lie.
 */
const TONES: Record<ReturnType<typeof credentialState>, BadgeTone> = {
  both: 'success',
  apriltag_only: 'success',
  lora_only: 'neutral',
  none: 'neutral',
};

export function CredentialBadge({ person }: { person: Pick<Person, 'aprilTagId' | 'loraDeviceId'> }) {
  const state = credentialState(person);
  return <Badge tone={TONES[state]}>{CREDENTIAL_LABELS[state]}</Badge>;
}

/** The badge plus the actual credential values, for table cells and detail views. */
export function CredentialSummary({ person }: { person: Pick<Person, 'aprilTagId' | 'loraDeviceId'> }) {
  return (
    <div className={styles.credential}>
      <div>
        <CredentialBadge person={person} />
      </div>
      <div className={styles.credentialMeta}>
        <span className={styles.mono}>{person.aprilTagId !== null ? `Tag ${person.aprilTagId}` : 'No AprilTag'}</span>
        <span className={styles.mono}>{person.loraDeviceId ?? 'No LoRa device'}</span>
      </div>
    </div>
  );
}
