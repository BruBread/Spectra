import type { ReactNode } from 'react';
import { cn } from '../../lib/format';
import styles from './Badge.module.css';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ tone, children, dot, className }: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[tone], className)}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
