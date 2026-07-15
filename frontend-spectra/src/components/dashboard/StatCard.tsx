import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/format';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: { value: string; direction: 'up' | 'down'; positive: boolean };
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <Card className={styles.card} padding="md">
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span className={styles.icon}>{icon}</span>
      </div>
      <p className={styles.value}>{value}</p>
      {trend ? (
        <p className={cn(styles.trend, trend.positive ? styles.trendUp : styles.trendDown)}>
          {trend.direction === 'up' ? (
            <ArrowUpRight size={14} aria-hidden="true" />
          ) : (
            <ArrowDownRight size={14} aria-hidden="true" />
          )}
          {trend.value} from yesterday
        </p>
      ) : null}
    </Card>
  );
}
