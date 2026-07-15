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

export const STORAGE_KEYS = {
  auth: 'spectra-auth',
  demoPassword: 'spectra-demo-password',
  theme: 'spectra-theme',
  cameras: 'spectra-cameras',
  customers: 'spectra-customers',
  logs: 'spectra-logs',
  notifications: 'spectra-notifications',
  settings: 'spectra-settings',
} as const;
