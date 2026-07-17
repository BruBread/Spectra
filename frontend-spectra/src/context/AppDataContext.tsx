'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createPersistedStore } from '../lib/store';
import { STORAGE_KEYS, purgeRetiredStorage } from '../lib/storage';
import { defaultSettings } from '../lib/settings/defaults';
import type { AppSettings } from '../lib/types';

/**
 * Holds the admin's own preferences only.
 *
 * Customers, logs and notifications used to live here, seeded from mock
 * generators into localStorage and rendered as if they were system activity.
 * They are gone: those features have no backend yet, and the UI now says so
 * rather than inventing records. When their APIs exist they belong in
 * dedicated API clients like lib/api/cameras.ts, not in browser storage.
 */
const settingsStore = createPersistedStore<AppSettings>(STORAGE_KEYS.settings, defaultSettings);

interface AppDataContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  // Browsers that ran the old build still hold seeded demo records; drop them
  // so stale fake data can't outlive its generators.
  useEffect(() => {
    purgeRetiredStorage();
  }, []);

  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getServerSnapshot,
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      settings,
      updateSettings: (updates) => {
        settingsStore.set((current) => ({
          ...current,
          ...updates,
          notifications: { ...current.notifications, ...updates.notifications },
          detection: { ...current.detection, ...updates.detection },
        }));
      },
    }),
    [settings],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider');
  return ctx;
}
