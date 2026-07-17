import type { AuthUser } from '../types';
import { request, type ApiResult } from './client';

export function login(email: string, password: string): Promise<ApiResult<AuthUser>> {
  return request<AuthUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export function logout(): Promise<ApiResult<null>> {
  return request<null>('/api/auth/logout', { method: 'POST' });
}

/** Returns `unauthorized: true` rather than an error when simply signed out. */
export function fetchCurrentUser(): Promise<ApiResult<AuthUser>> {
  return request<AuthUser>('/api/auth/me');
}

export function updateProfile(updates: { name?: string; email?: string }): Promise<ApiResult<AuthUser>> {
  return request<AuthUser>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<ApiResult<null>> {
  return request<null>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
