'use client';

import { useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Radio, Trash2 } from 'lucide-react';
import type { AprilTagMapping } from '../../lib/vision/types';
import { generateAprilTagSvg } from '../../lib/vision/pipeline';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { DataTable, type Column } from '../ui/DataTable';
import styles from './AprilTagMappingManager.module.css';

interface AprilTagMappingManagerProps {
  mappings: AprilTagMapping[];
  onCreate: (input: { tagId: number; label: string; loraDeviceId: string; notes?: string }) => Promise<void>;
  onUpdate: (id: string, input: { label: string; loraDeviceId: string; notes?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function downloadTagSvg(tagId: number) {
  const svg = generateAprilTagSvg(tagId);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `apriltag-36h11-${tagId}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AprilTagMappingManager({ mappings, onCreate, onUpdate, onDelete }: AprilTagMappingManagerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AprilTagMapping | null>(null);
  const [tagId, setTagId] = useState('');
  const [label, setLabel] = useState('');
  const [loraDeviceId, setLoraDeviceId] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ tagId?: string; label?: string; loraDeviceId?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setTagId('');
    setLabel('');
    setLoraDeviceId('');
    setNotes('');
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (mapping: AprilTagMapping) => {
    setEditing(mapping);
    setTagId(String(mapping.tagId));
    setLabel(mapping.label);
    setLoraDeviceId(mapping.loraDeviceId);
    setNotes(mapping.notes ?? '');
    setErrors({});
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const parsedTagId = Number(tagId);
    if (!tagId.trim() || Number.isNaN(parsedTagId) || parsedTagId < 0 || parsedTagId > 586) {
      nextErrors.tagId = 'Enter a valid AprilTag 36h11 ID (0–586).';
    }
    if (!label.trim()) nextErrors.label = 'Label is required.';
    if (!loraDeviceId.trim()) nextErrors.loraDeviceId = 'LoRa device ID is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (editing) {
        await onUpdate(editing.id, { label: label.trim(), loraDeviceId: loraDeviceId.trim(), notes: notes.trim() || undefined });
      } else {
        await onCreate({
          tagId: parsedTagId,
          label: label.trim(),
          loraDeviceId: loraDeviceId.trim(),
          notes: notes.trim() || undefined,
        });
      }
      setFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<AprilTagMapping>[] = [
    { key: 'tagId', header: 'Tag ID', render: (mapping) => <span className={styles.mono}>{mapping.tagId}</span> },
    { key: 'label', header: 'Label', render: (mapping) => mapping.label },
    {
      key: 'loraDeviceId',
      header: 'LoRa Device',
      render: (mapping) => <span className={styles.mono}>{mapping.loraDeviceId}</span>,
    },
    { key: 'notes', header: 'Notes', render: (mapping) => mapping.notes ?? '—' },
    {
      key: 'actions',
      header: '',
      render: (mapping) => (
        <div className={styles.rowActions} onClick={(event) => event.stopPropagation()}>
          <IconButton label="Download printable tag" onClick={() => downloadTagSvg(mapping.tagId)}>
            <Download size={15} aria-hidden="true" />
          </IconButton>
          <IconButton label="Edit mapping" onClick={() => openEdit(mapping)}>
            <Pencil size={15} aria-hidden="true" />
          </IconButton>
          <IconButton label="Delete mapping" onClick={() => void onDelete(mapping.id)}>
            <Trash2 size={15} aria-hidden="true" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="AprilTag Devices"
        subtitle="Map a printed AprilTag 36h11 marker to the LoRa module it represents."
        action={
          <Button size="sm" onClick={openAdd}>
            <Plus size={15} aria-hidden="true" /> Add Mapping
          </Button>
        }
      />

      {mappings.length === 0 ? (
        <EmptyState
          icon={<Radio size={20} aria-hidden="true" />}
          title="No tags mapped yet"
          description="Add a mapping, download the printable tag, and hold it up to the camera to test."
        />
      ) : (
        <DataTable columns={columns} rows={mappings} getRowId={(mapping) => mapping.id} />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Mapping' : 'Add Mapping'}
        description="Once hardware LoRa device IDs are known, update the mapping here — no code changes needed."
      >
        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            label="AprilTag ID (36h11)"
            type="number"
            min={0}
            max={586}
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
            error={errors.tagId}
            disabled={Boolean(editing)}
            hint={editing ? undefined : 'Standard AprilTag 36h11 family supports IDs 0–586.'}
          />
          <Input label="Label" placeholder="e.g. North Gate Wearable" value={label} onChange={(event) => setLabel(event.target.value)} error={errors.label} />
          <Input
            label="LoRa Device ID"
            placeholder="e.g. WR-104"
            value={loraDeviceId}
            onChange={(event) => setLoraDeviceId(event.target.value)}
            error={errors.loraDeviceId}
            hint="Matches the deviceId reported by the lorawan-ingest module."
          />
          <Input label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} />

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {editing ? 'Save Changes' : 'Add Mapping'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
