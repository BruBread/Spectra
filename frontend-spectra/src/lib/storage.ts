export function readStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota) — fail silently for a demo app
  }
}

export function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Only the admin's own client-side preferences belong here.
 *
 * Authentication lives in an HTTP-only cookie the browser won't expose to
 * JavaScript. Customers, logs and notifications were removed: operational
 * records must come from the backend, never from seeded browser storage.
 */
export const STORAGE_KEYS = {
  theme: 'spectra-theme',
  settings: 'spectra-settings',
} as const;

/**
 * Storage keys that previously held generated demo records. Cleared on load
 * so existing browsers don't keep stale fake data around forever.
 */
const RETIRED_STORAGE_KEYS = ['spectra-auth', 'spectra-demo-password', 'spectra-customers', 'spectra-logs', 'spectra-notifications'];

export function purgeRetiredStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of RETIRED_STORAGE_KEYS) {
    removeStorage(key);
  }
}
