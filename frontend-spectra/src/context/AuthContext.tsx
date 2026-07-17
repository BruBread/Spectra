'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../lib/api/auth';
import { setUnauthorizedHandler } from '../lib/api/client';
import type { AuthUser } from '../lib/types';

interface MutationResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<MutationResult>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<AuthUser, 'name' | 'email'>>) => Promise<MutationResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<MutationResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The session lives in an HTTP-only cookie the page can't read, so the only
  // way to know who's signed in is to ask the backend. Route guards must wait
  // for isLoading to clear before redirecting — deciding earlier fires a
  // premature redirect that a later correction can no longer undo.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await authApi.fetchCurrentUser();
      if (cancelled) return;
      setUser(result.ok && result.data ? result.data : null);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Any API call that 401s means the session is gone (expired, revoked, or the
  // account was deactivated) — drop the user so the guard sends them to login.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<MutationResult> => {
    const result = await authApi.login(email, password);
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? 'Unable to sign in. Please try again.' };
    }
    setUser(result.data);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    // Clear locally regardless of the response: a failed logout call must not
    // strand someone in a signed-in-looking UI.
    await authApi.logout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<Pick<AuthUser, 'name' | 'email'>>): Promise<MutationResult> => {
      const result = await authApi.updateProfile(updates);
      if (!result.ok || !result.data) {
        return { ok: false, error: result.error ?? 'Could not save your profile.' };
      }
      setUser(result.data);
      return { ok: true };
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<MutationResult> => {
      const result = await authApi.changePassword(currentPassword, newPassword);
      if (!result.ok) {
        return { ok: false, error: result.error ?? 'Could not change your password.' };
      }
      return { ok: true };
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      updateProfile,
      changePassword,
    }),
    [user, isLoading, login, logout, updateProfile, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
