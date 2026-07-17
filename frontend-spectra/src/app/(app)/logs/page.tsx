'use client';

import { ScrollText } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import styles from './logs.module.css';

/**
 * Audit logging has no backend model or API yet.
 *
 * This page previously listed generated log entries seeded into
 * localStorage, complete with working filters and pagination — convincing,
 * and entirely fabricated. Until the API exists it says so plainly rather
 * than showing invented platform activity.
 */
export default function LogsPage() {
  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.title}>Logs</h2>
        <p className={styles.subtitle}>Audit trail of activity across the platform.</p>
      </div>

      <Card>
        <EmptyState
          icon={<ScrollText size={22} aria-hidden="true" />}
          title="Not connected yet"
          description="Audit logging has no backend API yet, so there is no recorded activity to show. Log entries will appear here once the backend records them."
        />
      </Card>
    </div>
  );
}
