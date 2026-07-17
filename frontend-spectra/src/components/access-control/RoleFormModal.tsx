'use client';

import { useState } from 'react';
import type { AccessRole } from '../../lib/accessControl/types';
import { createRole, updateRole } from '../../lib/api/accessControl';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import styles from './accessControl.module.css';

interface RoleFormModalProps {
  /** null creates; a role edits. */
  role: AccessRole | null;
  onClose: () => void;
  onSaved: (role: AccessRole) => void;
}

/** Mirrors the backend's rule: lowercase letters, numbers and underscores. */
const KEY_PATTERN = /^[a-z0-9_]+$/;

function suggestKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function RoleFormModal({ role, onClose, onSaved }: RoleFormModalProps) {
  const [name, setName] = useState(role?.name ?? '');
  const [key, setKey] = useState(role?.key ?? '');
  // Only meaningful while creating: once a key exists it is fixed, so an edit
  // must never quietly re-derive it from a renamed role.
  const [keyTouched, setKeyTouched] = useState(role !== null);
  const [description, setDescription] = useState(role?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveKey = role ? role.key : keyTouched ? key : suggestKey(name);
  const keyInvalid = !role && effectiveKey !== '' && !KEY_PATTERN.test(effectiveKey);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!role && !effectiveKey) {
      setError('Key is required.');
      return;
    }
    if (keyInvalid) {
      setError('Key may contain only lowercase letters, numbers and underscores.');
      return;
    }

    setSaving(true);
    setError(null);
    const result = role
      ? await updateRole(role.id, { name: name.trim(), description })
      : await createRole({ key: effectiveKey, name: name.trim(), description });
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Could not save this role.');
      return;
    }
    onSaved(result.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit ${role.name}` : 'Add role'}
      description="Roles describe people the cameras observe — not console accounts."
      size="md"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Saving…' : role ? 'Save changes' : 'Add role'}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.form}>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}

        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />

        <div>
          <Input
            label="Key"
            value={effectiveKey}
            // Immutable after creation, so the field is shown (a recorded
            // decision refers to it) but not editable.
            disabled={role !== null}
            onChange={(event) => {
              setKeyTouched(true);
              setKey(event.target.value);
            }}
            error={keyInvalid ? 'Lowercase letters, numbers and underscores only.' : undefined}
            autoComplete="off"
          />
          <p className={styles.fieldHint}>
            {role
              ? 'A role’s key cannot change: recorded policy decisions refer to it, and rewriting it would change what those records appear to say.'
              : 'A stable machine name, fixed once the role is created. Recorded policy decisions will refer to it.'}
          </p>
        </div>

        <div>
          <label className={styles.label} htmlFor="role-description">
            Description
          </label>
          <textarea
            id="role-description"
            className={styles.textarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {!role ? (
          <p className={styles.fieldHint}>
            A new role starts with no permissions: allowed in no zone, exempt from nothing. Grant zone access after
            creating it.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
