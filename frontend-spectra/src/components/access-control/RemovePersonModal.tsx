'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Person } from '../../lib/accessControl/types';
import { removeAndReleasePerson } from '../../lib/api/accessControl';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import styles from './accessControl.module.css';

interface RemovePersonModalProps {
  person: Person;
  onClose: () => void;
  onRemoved: (person: Person) => void;
}

/**
 * Confirms removing a person and releasing their credentials.
 *
 * This is deliberately not the same as the ordinary Deactivate toggle: it makes
 * both the AprilTag and the LoRa id reusable again, so it states exactly that
 * before it happens. The Person record itself is kept — past decisions still
 * resolve — so nothing here rewrites history.
 */
export function RemovePersonModal({ person, onClose, onRemoved }: RemovePersonModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    const result = await removeAndReleasePerson(person.id);
    setRemoving(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Could not remove this person.');
      return;
    }
    onRemoved(result.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove ${person.name}?`}
      description="Removes them from the active People directory and returns their credentials to the pool."
      size="sm"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={onClose} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleRemove()} disabled={removing}>
              {removing ? 'Removing…' : 'Remove and release credentials'}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.form}>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <div className={styles.note}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {person.aprilTagId !== null ? (
              <>
                Their <strong>AprilTag {person.aprilTagId}</strong>
                {person.loraDeviceId ? (
                  <>
                    {' '}and <strong>LoRa device {person.loraDeviceId}</strong> will
                  </>
                ) : (
                  ' will'
                )}{' '}
                become reusable and may be assigned to someone else.
              </>
            ) : person.loraDeviceId ? (
              <>
                Their <strong>LoRa device {person.loraDeviceId}</strong> will become reusable and may be assigned to
                someone else.
              </>
            ) : (
              'They hold no credentials to release, but will be archived out of the active directory.'
            )}
          </span>
        </div>
        <p className={styles.fieldHint}>
          The person&rsquo;s record is kept for audit history — this deactivates and archives them, it does not delete
          past decisions. They can be reactivated later and issued a fresh AprilTag.
        </p>
      </div>
    </Modal>
  );
}
