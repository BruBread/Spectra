'use client';

import type { Person } from '../../lib/accessControl/types';
import { CREDENTIAL_MEANING, credentialState } from '../../lib/accessControl/types';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CredentialBadge } from './CredentialSummary';
import styles from './accessControl.module.css';

interface PersonDetailModalProps {
  person: Person;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? styles.detailFull : undefined}>
      <p className={styles.detailLabel}>{label}</p>
      <div className={styles.detailValue}>{children}</div>
    </div>
  );
}

export function PersonDetailModal({ person, canEdit, onEdit, onClose }: PersonDetailModalProps) {
  const state = credentialState(person);

  return (
    <Modal
      open
      onClose={onClose}
      title={person.name}
      size="md"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {canEdit ? <Button onClick={onEdit}>Edit</Button> : null}
          </div>
        </div>
      }
    >
      <div className={styles.detailGrid}>
        <Field label="Role">
          {person.role ? (
            <>
              {person.role.name} <span className={styles.mono}>({person.role.key})</span>
              {person.role.active ? null : ' — deactivated'}
            </>
          ) : (
            // The role reference did not resolve. Saying "none" would be
            // wrong: every person has exactly one, so this is a data problem
            // worth showing rather than smoothing over.
            <span className={styles.cellMuted}>Role could not be resolved</span>
          )}
        </Field>
        <Field label="Status">
          <Badge tone={person.active ? 'success' : 'neutral'}>{person.active ? 'Active' : 'Deactivated'}</Badge>
        </Field>

        <Field label="AprilTag ID">
          {person.aprilTagId !== null ? <span className={styles.mono}>{person.aprilTagId}</span> : <span className={styles.cellMuted}>None</span>}
        </Field>
        <Field label="LoRa device">
          {person.loraDeviceId ? <span className={styles.mono}>{person.loraDeviceId}</span> : <span className={styles.cellMuted}>None</span>}
        </Field>

        <Field label="Recognition" full>
          <div className={styles.credential}>
            <div>
              <CredentialBadge person={person} />
            </div>
            <span className={styles.cellMuted}>{CREDENTIAL_MEANING[state]}</span>
          </div>
        </Field>

        {person.notes ? (
          <Field label="Notes" full>
            {person.notes}
          </Field>
        ) : null}

        <Field label="Added">{person.createdAt ? formatDateTime(person.createdAt) : '—'}</Field>
        <Field label="Last updated">{person.updatedAt ? formatDateTime(person.updatedAt) : '—'}</Field>
      </div>
    </Modal>
  );
}
