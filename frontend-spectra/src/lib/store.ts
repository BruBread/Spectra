import { readStorage, writeStorage } from './storage';

type Listener = () => void;

export interface ExternalStore<T> {
  subscribe: (onChange: Listener) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (value: T | ((current: T) => T)) => void;
}

/**
 * A tiny external store backed by localStorage, designed for
 * useSyncExternalStore. getServerSnapshot always returns the deterministic
 * seed (matching SSR output); getSnapshot resolves the real persisted value
 * on the client. React re-syncs the two automatically right after
 * hydration, before paint — the supported way to read browser-only storage
 * without a hydration mismatch or a manual "isLoading" flag.
 */
export function createPersistedStore<T>(key: string, seed: () => T): ExternalStore<T> {
  const serverValue = seed();
  let clientValue: T | undefined;
  let clientInitialized = false;
  const listeners = new Set<Listener>();

  function resolveClientValue(): T {
    if (!clientInitialized) {
      const stored = readStorage<T>(key);
      clientValue = stored ?? serverValue;
      clientInitialized = true;
    }
    return clientValue as T;
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot() {
      return resolveClientValue();
    },
    getServerSnapshot() {
      return serverValue;
    },
    set(value) {
      const current = resolveClientValue();
      const next = typeof value === 'function' ? (value as (current: T) => T)(current) : value;
      clientValue = next;
      clientInitialized = true;
      writeStorage(key, next);
      listeners.forEach((listener) => listener());
    },
  };
}
