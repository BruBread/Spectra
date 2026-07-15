'use client';

import Link from 'next/link';
import { MapPin, MoreVertical, Trash2, Eye, Radio, ExternalLink } from 'lucide-react';
import type { CameraRecord } from '../../lib/cameras/types';
import { CAMERA_SOURCE_LABELS, supportsDetection } from '../../lib/cameras/types';
import type { PipelineAlert } from '../../lib/vision/pipeline';
import { Card } from '../ui/Card';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { IconButton } from '../ui/IconButton';
import { CameraTile } from './CameraTile';
import styles from './CameraCard.module.css';

interface CameraCardProps {
  camera: CameraRecord;
  onView: () => void;
  onRemove: () => void;
  onToggleDetection: (enabled: boolean) => void;
  onAlert?: (alert: PipelineAlert) => void;
}

export function CameraCard({ camera, onView, onRemove, onToggleDetection, onAlert }: CameraCardProps) {
  const detectionCapable = supportsDetection(camera.sourceType);

  return (
    <Card padding="sm" className={styles.card}>
      {/* Not a <button>: CameraTile renders its own interactive Start/Retry buttons, and buttons can't nest. */}
      <div
        role="button"
        tabIndex={0}
        className={styles.previewButton}
        onClick={onView}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onView();
          }
        }}
      >
        <CameraTile camera={camera} onAlert={onAlert} />
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div className={styles.titles}>
            <p className={styles.name}>{camera.name}</p>
            <p className={styles.location}>
              <MapPin size={12} aria-hidden="true" /> {camera.location || CAMERA_SOURCE_LABELS[camera.sourceType]}
            </p>
          </div>
          <Dropdown
            align="right"
            trigger={({ onClick, ref, open }) => (
              <IconButton ref={ref} label={`Actions for ${camera.name}`} active={open} onClick={onClick}>
                <MoreVertical size={16} aria-hidden="true" />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                <DropdownItem
                  onClick={() => {
                    close();
                    onView();
                  }}
                >
                  <Eye size={15} aria-hidden="true" /> View details
                </DropdownItem>
                {detectionCapable ? (
                  <DropdownItem
                    onClick={() => {
                      close();
                      onToggleDetection(!camera.detectionEnabled);
                    }}
                  >
                    <Radio size={15} aria-hidden="true" /> {camera.detectionEnabled ? 'Disable' : 'Enable'} AI detection
                  </DropdownItem>
                ) : null}
                <DropdownItem
                  danger
                  onClick={() => {
                    close();
                    onRemove();
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" /> Remove camera
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.sourceType}>{CAMERA_SOURCE_LABELS[camera.sourceType]}</span>
          {detectionCapable && camera.detectionEnabled ? (
            <Link href={`/monitor?camera=${camera.id}`} className={styles.monitorLink}>
              <ExternalLink size={12} aria-hidden="true" /> Live Monitor
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
