import type { NextFunction, Request, Response } from 'express';
import * as authService from './auth.service.js';
import type { AdminRole } from './auth.types.js';

/**
 * Requires a valid session and loads the user onto `req.user`.
 *
 * The user is re-read per request rather than trusted from the cookie, so
 * deactivating or deleting an account takes effect immediately instead of
 * lasting until the session expires.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await authService.findUserById(userId);
    if (!user || !user.active) {
      req.session.destroy(() => undefined);
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    req.user = { id: String(user._id), email: user.email, role: user.role as AdminRole };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Requires one of the given admin roles. Must be mounted after requireAuth.
 * Returns 403 (authenticated but not permitted) rather than 401.
 */
export function requireRole(...roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }
    next();
  };
}

/** Convenience for routes only an `admin` may reach. */
export const requireAdmin = [requireAuth, requireRole('admin')];
