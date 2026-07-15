'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStorage, writeStorage, removeStorage, STORAGE_KEYS } from '../lib/storage';
import { DEMO_EMAIL, demoPasswordStore } from '../lib/auth';
import type { AuthUser } from '../lib/types';

interface LoginResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => LoginResult;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<AuthUser, 'name' | 'email'>>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_USER: AuthUser = { name: 'Admin', email: DEMO_EMAIL, role: 'Administrator' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reading localStorage is only possible on the client, so the real auth
  // state can't be known during SSR/first paint. Route guards must wait for
  // isLoading to clear before deciding to redirect — deciding earlier (e.g.
  // from a snapshot that "eventually" resyncs) can fire a premature
  // redirect that a subsequent correction can no longer undo.
  useEffect(() => {
    // One-time read of a browser-only store to unblock the isLoading gate above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(readStorage<AuthUser>(STORAGE_KEYS.auth));
    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login: (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();

        if (normalizedEmail !== DEMO_EMAIL) {
          return { ok: false, error: 'No account found for that email address.' };
        }
        if (password !== demoPasswordStore.getSnapshot()) {
          return { ok: false, error: 'Incorrect password. Please try again.' };
        }

        const nextUser = { ...DEFAULT_USER, email: DEMO_EMAIL };
        writeStorage(STORAGE_KEYS.auth, nextUser);
        setUser(nextUser);
        return { ok: true };
      },
      logout: () => {
        removeStorage(STORAGE_KEYS.auth);
        setUser(null);
      },
      updateProfile: (updates) => {
        setUser((current) => {
          if (!current) return current;
          const next = { ...current, ...updates };
          writeStorage(STORAGE_KEYS.auth, next);
          return next;
        });
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
