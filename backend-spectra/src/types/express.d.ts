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
      /**
       * The exact bytes of the JSON body, captured by the body parser's verify
       * hook. The device bridge signs a hash of these, so the signature must be
       * checked against what arrived on the wire, not a re-serialization.
       */
      rawBody?: Buffer;
    }
  }
}

export {};
