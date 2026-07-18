'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import styles from './accessControl.module.css';

interface ConfirmAllowModalProps {
  /** Human phrase for where the allow applies, e.g. the zone name. */
  scopeLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Gate in front of allowing every unidentified person somewhere.
 *
 * `allow` on the unidentified subject is not a permission for one person — it
 * waves through everyone the cameras cannot identify in that context. That is
 * a big enough blast radius to be worth a deliberate second action rather than
 * a single toggle, and worth stating in plain words what it does.
 */
export function ConfirmAllowModal({ scopeLabel, onConfirm, onCancel }: ConfirmAllowModalProps) {
  return (
    <Modal
      open
      onClose={onCancel}
      title="Allow every unidentified person?"
      size="sm"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              Allow in {scopeLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.confirmBody}>
        <AlertTriangle size={20} aria-hidden="true" />
        <p>
          This allows <strong>anyone the cameras cannot identify</strong> in <strong>{scopeLabel}</strong> — not a
          specific person. A detection there will be suppressed rather than raising an alert, and only an audit record
          will be written. Restrict is the safe default.
        </p>
      </div>
    </Modal>
  );
}
