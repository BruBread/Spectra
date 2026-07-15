'use client';

import type { ReactNode } from 'react';
import { cn } from '../../lib/format';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
}

export function Tabs({ items, activeId, onChange, orientation = 'vertical' }: TabsProps) {
  return (
    <div role="tablist" aria-orientation={orientation} className={cn(styles.list, styles[orientation])}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === activeId}
          aria-controls={`panel-${item.id}`}
          className={cn(styles.tab, item.id === activeId && styles.active)}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, activeId, children }: { id: string; activeId: string; children: ReactNode }) {
  if (id !== activeId) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}
