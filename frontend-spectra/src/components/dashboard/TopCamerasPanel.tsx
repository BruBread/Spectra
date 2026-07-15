import type { CameraRecord } from '../../lib/cameras/types';
import { CAMERA_SOURCE_LABELS, supportsDetection } from '../../lib/cameras/types';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ButtonLink } from '../ui/ButtonLink';
import { EmptyState } from '../ui/EmptyState';
import styles from './TopCamerasPanel.module.css';

export function TopCamerasPanel({ cameras }: { cameras: CameraRecord[] }) {
  const topCameras = cameras.slice(0, 3);

  return (
    <Card>
      <CardHeader title="Top Cameras" subtitle="Recently added camera sources" />
      {topCameras.length === 0 ? (
        <EmptyState title="No cameras yet" />
      ) : (
        <ul className={styles.list}>
          {topCameras.map((camera) => {
            const monitored = supportsDetection(camera.sourceType) && camera.detectionEnabled;
            return (
              <li key={camera.id} className={styles.item}>
                <span className={styles.name}>{camera.name}</span>
                <span className={styles.location}>{camera.location || CAMERA_SOURCE_LABELS[camera.sourceType]}</span>
                <Badge tone={monitored ? 'success' : 'neutral'} dot>
                  {monitored ? 'AI On' : 'Preview'}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      <ButtonLink href="/cameras" variant="secondary" size="sm" className={styles.viewAll}>
        View All Cameras
      </ButtonLink>
    </Card>
  );
}
