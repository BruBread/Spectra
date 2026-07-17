/**
 * The three states every backend-backed view here must tell apart.
 *
 * `error` exists so a failed request is never rendered as an empty list: "we
 * could not ask" and "there is nothing" are different answers, and only one of
 * them is safe to show as a zero.
 */
export interface LoadState<T> {
  status: 'loading' | 'ok' | 'error';
  data: T;
  error: string | null;
}

export function loading<T>(empty: T): LoadState<T> {
  return { status: 'loading', data: empty, error: null };
}

export function loaded<T>(data: T): LoadState<T> {
  return { status: 'ok', data, error: null };
}

export function failed<T>(empty: T, error: string): LoadState<T> {
  return { status: 'error', data: empty, error };
}
