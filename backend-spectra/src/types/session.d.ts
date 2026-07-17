import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Set on login, cleared on logout. The only thing the cookie authorizes. */
    userId?: string;
  }
}
