'use client';

import { Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Select';
import type { ThemeMode } from '../../lib/types';
import { cn } from '../../lib/format';
import styles from './SettingsPanels.module.css';

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export function GeneralSettings() {
  const { mode, setMode } = useTheme();

  return (
    <Card>
      <CardHeader title="Appearance" subtitle="Choose your preferred theme." />
      <div className={styles.themeGrid} role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(styles.themeOption, selected && styles.themeOptionSelected)}
              onClick={() => setMode(option.value)}
            >
              <Icon size={18} aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      <div className={styles.divider} />

      <div className={styles.fieldRow}>
        <Select label="Language" defaultValue="en" disabled>
          <option value="en">English (United States)</option>
        </Select>
        <Select label="Time zone" defaultValue="utc" disabled>
          <option value="utc">Coordinated Universal Time (UTC)</option>
        </Select>
      </div>
      <p className={styles.helperText}>Additional language and time zone options are coming soon.</p>
    </Card>
  );
}
