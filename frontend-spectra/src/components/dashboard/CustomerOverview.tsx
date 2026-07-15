import type { Customer } from '../../lib/types';
import { Card, CardHeader } from '../ui/Card';
import styles from './CustomerOverview.module.css';

const SEGMENTS: Array<{ key: Customer['status']; label: string; color: string }> = [
  { key: 'active', label: 'Active', color: 'var(--color-accent)' },
  { key: 'inactive', label: 'Inactive', color: 'var(--color-border-strong)' },
  { key: 'pending', label: 'Pending', color: 'var(--color-warning)' },
];

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CustomerOverview({ customers }: { customers: Customer[] }) {
  const total = customers.length;
  const counts = SEGMENTS.map((segment) => ({
    ...segment,
    count: customers.filter((customer) => customer.status === segment.key).length,
  }));

  const arcs = counts.reduce<Array<{ key: string; color: string; length: number; offset: number }>>(
    (acc, segment) => {
      const fraction = total === 0 ? 0 : segment.count / total;
      const length = fraction * CIRCUMFERENCE;
      const previous = acc[acc.length - 1];
      const offset = previous ? previous.offset + previous.length : 0;
      return [...acc, { key: segment.key, color: segment.color, length, offset }];
    },
    [],
  );

  return (
    <Card>
      <CardHeader title="Customer Overview" />
      <div className={styles.layout}>
        <div className={styles.chartWrap}>
          <svg viewBox="0 0 120 120" className={styles.donut} role="img" aria-label="Customer status breakdown">
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--color-neutral-soft)" strokeWidth="14" />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth="14"
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
                transform="rotate(-90 60 60)"
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className={styles.chartCenter}>
            <span className={styles.total}>{total}</span>
            <span className={styles.totalLabel}>Total Customers</span>
          </div>
        </div>

        <ul className={styles.legend}>
          {counts.map((segment) => {
            const percent = total === 0 ? 0 : Math.round((segment.count / total) * 100);
            return (
              <li key={segment.key} className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: segment.color }} aria-hidden="true" />
                <span className={styles.legendLabel}>{segment.label}</span>
                <span className={styles.legendValue}>{percent}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
