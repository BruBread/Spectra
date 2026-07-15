import { createPersistedStore } from './store';
import { STORAGE_KEYS } from './storage';

export const DEMO_EMAIL = 'admin@spectra.com';
export const DEFAULT_DEMO_PASSWORD = 'spectra123';

export const demoPasswordStore = createPersistedStore<string>(
  STORAGE_KEYS.demoPassword,
  () => DEFAULT_DEMO_PASSWORD,
);
