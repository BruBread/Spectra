import { VideoOff } from 'lucide-react';
import type { CameraStatus } from '../../lib/types';
import { cn } from '../../lib/format';
import styles from './CameraVisual.module.css';

interface CameraVisualProps {
  paletteIndex: number;
  status: CameraStatus;
  className?: string;
}

export function CameraVisual({ paletteIndex, status, className }: CameraVisualProps) {
  return (
    <div className={cn(styles.scene, styles[`palette-${paletteIndex % 6}`], className)}>
      <svg className={styles.perspective} viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,120 80,50 120,50 200,120" className={styles.floor} />
        <rect x="86" y="30" width="28" height="50" rx="1.5" className={styles.door} />
      </svg>

      {status === 'live' ? (
        <span className={styles.liveDot}>
          <span className={styles.livePulse} />
          LIVE
        </span>
      ) : null}

      {status === 'offline' ? (
        <div className={styles.offlineOverlay}>
          <VideoOff size={22} aria-hidden="true" />
          <span>Offline</span>
        </div>
      ) : null}

      {status === 'idle' ? <span className={styles.idleTag}>Idle</span> : null}
    </div>
  );
}
