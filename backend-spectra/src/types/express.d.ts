import type { AdminRole } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth — the authenticated console user for this request. */
      user?: {
        id: string;
        email: string;
        role: AdminRole;
      };
    }
  }
}

export {};
