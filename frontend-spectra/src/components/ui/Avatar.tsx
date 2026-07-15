import { initials, cn } from '../../lib/format';
import styles from './Avatar.module.css';

const PALETTE = ['#1e3a8a', '#0f766e', '#9d174d', '#7c3aed', '#b45309', '#166534'];

function paletteFor(name: string): string {
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 36, className }: AvatarProps) {
  return (
    <span
      className={cn(styles.avatar, className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: paletteFor(name) }}
      aria-hidden="true"
    >
      {initials(name) || '?'}
    </span>
  );
}
