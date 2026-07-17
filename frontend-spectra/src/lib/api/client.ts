export interface ApiResult<T> {
  data: T | null;
  ok: boolean;
  error?: string;
  /** True when the backend rejected the session — the caller is signed out. */
  unauthorized?: boolean;
}

export function apiBase(): string | null {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? null;
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Lets AuthContext react to an expired/revoked session from anywhere in the
 * app: any request that comes back 401 clears the client-side user, and the
 * route guard takes it from there.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/**
 * Shared fetch wrapper for the backend API.
 *
 * `credentials: 'include'` is what carries the session cookie: the frontend
 * and API are different origins (ports), so the browser omits cookies unless
 * the request opts in and the server sends back matching CORS credentials.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) {
    return { data: null, ok: false, error: 'NEXT_PUBLIC_API_BASE_URL is not configured.' };
  }

  try {
    const response = await fetch(new URL(path, base).toString(), {
      cache: 'no-store',
      credentials: 'include',
      signal: AbortSignal.timeout(6000),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });

    if (response.status === 401) {
      onUnauthorized?.();
      const body = await response.json().catch(() => null);
      return { data: null, ok: false, unauthorized: true, error: body?.error ?? 'Your session has expired. Please sign in again.' };
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { data: null, ok: false, error: body?.error ?? `Request failed (${response.status})` };
    }

    if (response.status === 204) {
      return { data: null, ok: true };
    }

    const data = (await response.json()) as T;
    return { data, ok: true };
  } catch (error) {
    return { data: null, ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}
