import { MapPin, MoreVertical, Trash2, Eye } from 'lucide-react';
import type { Camera } from '../../lib/types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { IconButton } from '../ui/IconButton';
import { CameraVisual } from './CameraVisual';
import styles from './CameraCard.module.css';

interface CameraCardProps {
  camera: Camera;
  onView: () => void;
  onRemove: () => void;
}

const STATUS_LABEL: Record<Camera['status'], string> = {
  live: 'Live',
  offline: 'Offline',
  idle: 'Idle',
};

export function CameraCard({ camera, onView, onRemove }: CameraCardProps) {
  return (
    <Card padding="sm" className={styles.card}>
      <button type="button" className={styles.previewButton} onClick={onView}>
        <CameraVisual paletteIndex={camera.paletteIndex} status={camera.status} />
      </button>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div className={styles.titles}>
            <p className={styles.name}>{camera.name}</p>
            <p className={styles.location}>
              <MapPin size={12} aria-hidden="true" /> {camera.location}
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
          <Badge tone={camera.status === 'live' ? 'success' : camera.status === 'offline' ? 'danger' : 'neutral'} dot>
            {STATUS_LABEL[camera.status]}
          </Badge>
          <span className={styles.lastActivity}>{camera.lastActivity}</span>
        </div>
      </div>
    </Card>
  );
}
