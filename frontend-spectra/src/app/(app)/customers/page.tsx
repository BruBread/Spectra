'use client';

import { Users } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import styles from './customers.module.css';

/**
 * Customers have no backend model or API yet.
 *
 * This page previously listed generated customers seeded into localStorage,
 * and its "Add Customer" form only wrote to that same browser storage — a
 * control that looked like it registered a customer but did nothing. Both are
 * gone until a real API exists; the add action returns with it.
 */
export default function CustomersPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Customers</h2>
          <p className={styles.subtitle}>Registered customers and their status.</p>
        </div>
      </div>

      <Card>
        <EmptyState
          icon={<Users size={22} aria-hidden="true" />}
          title="Not connected yet"
          description="Customers have no backend API yet, so there are no records to show and none can be added. Registered customers will appear here once the backend supports them."
        />
      </Card>
    </div>
  );
}
