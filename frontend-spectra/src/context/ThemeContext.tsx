'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPersistedStore } from '../lib/store';
import { STORAGE_KEYS } from '../lib/storage';
import type { ThemeMode } from '../lib/types';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const themeStore = createPersistedStore<ThemeMode>(STORAGE_KEYS.theme, () => 'system');

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);

  useEffect(() => {
    const applyToDocument = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme(mode));
    };
    applyToDocument();

    if (mode === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', applyToDocument);
      return () => media.removeEventListener('change', applyToDocument);
    }
  }, [mode]);

  return <ThemeContext.Provider value={{ mode, setMode: themeStore.set }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
