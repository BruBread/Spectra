'use client';

import { useState } from 'react';
import type { LoadState } from '../../lib/accessControl/loadState';
import type { AccessRole, LoraDevice, Person } from '../../lib/accessControl/types';
import { CREDENTIAL_MEANING, credentialState } from '../../lib/accessControl/types';
import { createPerson, updatePerson, type PersonInput } from '../../lib/api/accessControl';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { CredentialBadge } from './CredentialSummary';
import { LoraDevicePicker } from './LoraDevicePicker';
import styles from './accessControl.module.css';

/**
 * Mounted only while open by its parent, so the form state below is always
 * built fresh from the person being edited — a modal kept mounted would carry
 * the previous person's values into the next one.
 */
interface PersonFormModalProps {
  /** null creates; a person edits. */
  person: Person | null;
  roles: AccessRole[];
  devices: LoadState<LoraDevice[]>;
  onClose: () => void;
  onSaved: (person: Person) => void;
}

interface FormState {
  name: string;
  roleId: string;
  aprilTagId: string;
  loraDeviceId: string | null;
  notes: string;
}

function initialState(person: Person | null): FormState {
  return {
    name: person?.name ?? '',
    // No default role on create: assigning one by accident is a permissions
    // decision made by the form rather than by a person.
    roleId: person?.role?.id ?? '',
    aprilTagId: person?.aprilTagId !== null && person?.aprilTagId !== undefined ? String(person.aprilTagId) : '',
    loraDeviceId: person?.loraDeviceId ?? null,
    notes: person?.notes ?? '',
  };
}

export function PersonFormModal({ person, roles, devices, onClose, onSaved }: PersonFormModalProps) {
  const [form, setForm] = useState<FormState>(() => initialState(person));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  /**
   * Active roles, plus this person's own role if it has since been
   * deactivated — dropping it would make saving any other edit silently
   * reassign them.
   */
  const selectableRoles = roles.filter((role) => role.active || role.id === person?.role?.id);

  const parsedTag = form.aprilTagId.trim() === '' ? null : Number(form.aprilTagId);
  const tagInvalid = parsedTag !== null && (!Number.isInteger(parsedTag) || parsedTag < 0);

  const preview = credentialState({ aprilTagId: parsedTag, loraDeviceId: form.loraDeviceId });

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!form.roleId) {
      setError('A role is required — every person has exactly one.');
      return;
    }
    if (tagInvalid) {
      setError('AprilTag ID must be a whole number of 0 or more, or blank for none.');
      return;
    }

    const input: PersonInput = {
      name: form.name.trim(),
      roleId: form.roleId,
      notes: form.notes,
      aprilTagId: parsedTag,
      loraDeviceId: form.loraDeviceId,
    };

    setSaving(true);
    setError(null);
    const result = person ? await updatePerson(person.id, input) : await createPerson(input);
    setSaving(false);

    if (!result.ok || !result.data) {
      // Covers the backend's 409s for a duplicate AprilTag or LoRa id, which
      // name the conflict precisely — better than anything invented here.
      setError(result.error ?? 'Could not save this person.');
      return;
    }
    onSaved(result.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={person ? `Edit ${person.name}` : 'Add person'}
      description="People a camera may observe. Separate from the console accounts that operate Spectra."
      size="md"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Saving…' : person ? 'Save changes' : 'Add person'}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.form}>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}

        <div className={styles.formRow}>
          <Input
            label="Full name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            autoComplete="off"
          />
          <Select label="Role" value={form.roleId} onChange={(event) => set('roleId', event.target.value)}>
            <option value="">Select a role…</option>
            {selectableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
                {role.active ? '' : ' (deactivated)'}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Input
            label="AprilTag ID"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="Leave blank if this person has no badge"
            value={form.aprilTagId}
            onChange={(event) => set('aprilTagId', event.target.value)}
            error={tagInvalid ? 'Must be a whole number of 0 or more.' : undefined}
          />
          <p className={styles.fieldHint}>
            The only credential a camera can read. A person is recognized — and their role applied — only when a
            registered AprilTag is visible and readable in the frame.
          </p>
        </div>

        <LoraDevicePicker
          devices={devices}
          value={form.loraDeviceId}
          currentPersonId={person?.id}
          onChange={(deviceId) => set('loraDeviceId', deviceId)}
        />

        <div>
          <label className={styles.label} htmlFor="person-notes">
            Notes
          </label>
          <textarea
            id="person-notes"
            className={styles.textarea}
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </div>

        {/* States what this combination actually means before it is saved,
            rather than leaving the operator to assume a wristband identifies
            anyone. */}
        <div className={styles.note}>
          <CredentialBadge person={{ aprilTagId: parsedTag, loraDeviceId: form.loraDeviceId }} />
          <span>{CREDENTIAL_MEANING[preview]}</span>
        </div>
      </div>
    </Modal>
  );
}
