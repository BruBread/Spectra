import type { ReactNode } from 'react';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

interface PendingBackendPanelProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** What is missing and why nothing is shown — stated plainly, never implied to be "no activity". */
  description: string;
}

/**
 * Placeholder for a panel whose backend API does not exist yet.
 *
 * It deliberately renders no numbers, bars or rings: an empty chart reads as
 * "nothing happened", which is a claim we cannot make when nothing is
 * recording in the first place.
 */
export function PendingBackendPanel({ title, subtitle, icon, description }: PendingBackendPanelProps) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <EmptyState icon={icon} title="Not connected yet" description={description} />
    </Card>
  );
}
