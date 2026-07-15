import type { Camera } from '../../lib/types';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ButtonLink } from '../ui/ButtonLink';
import { EmptyState } from '../ui/EmptyState';
import styles from './TopCamerasPanel.module.css';

export function TopCamerasPanel({ cameras }: { cameras: Camera[] }) {
  const topCameras = cameras.slice(0, 3);

  return (
    <Card>
      <CardHeader title="Top Cameras" subtitle="Most active feeds right now" />
      {topCameras.length === 0 ? (
        <EmptyState title="No cameras yet" />
      ) : (
        <ul className={styles.list}>
          {topCameras.map((camera) => (
            <li key={camera.id} className={styles.item}>
              <span className={styles.name}>{camera.name}</span>
              <span className={styles.location}>{camera.location}</span>
              <Badge tone={camera.status === 'live' ? 'success' : camera.status === 'offline' ? 'danger' : 'neutral'} dot>
                {camera.status === 'live' ? 'Active' : camera.status === 'offline' ? 'Offline' : 'Idle'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/cameras" variant="secondary" size="sm" className={styles.viewAll}>
        View All Cameras
      </ButtonLink>
    </Card>
  );
}
