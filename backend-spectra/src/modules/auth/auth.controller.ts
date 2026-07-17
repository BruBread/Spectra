import type { NextFunction, Request, Response } from 'express';
import * as authService from './auth.service.js';

const MIN_PASSWORD_LENGTH = 8;

/** Deliberately vague: distinguishing "no such user" from "wrong password" leaks which emails exist. */
const INVALID_CREDENTIALS = 'Incorrect email or password.';

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

    const user = await authService.authenticate(email, password);
    if (!user) {
      res.status(401).json({ error: INVALID_CREDENTIALS });
      return;
    }

    // New session id on login — otherwise a session id captured before login
    // stays valid afterwards (session fixation).
    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        next(regenerateError);
        return;
      }
      req.session.userId = String(user._id);
      req.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        res.json(authService.toPublicUser(user));
      });
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req: Request, res: Response, next: NextFunction) {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie(req.app.get('sessionCookieName') as string);
    res.status(204).end();
  });
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.findUserById(req.user!.id);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json(authService.toPublicUser(user));
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email } = req.body ?? {};

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'name cannot be empty' });
      return;
    }
    if (email !== undefined && !isEmail(email)) {
      res.status(400).json({ error: 'email must be a valid email address' });
      return;
    }

    const user = await authService.updateProfile(req.user!.id, { name: name?.trim(), email });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(authService.toPublicUser(user));
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: 'That email address is already in use' });
      return;
    }
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body ?? {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'currentPassword and newPassword are required' });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: 'New password must be different from the current one' });
      return;
    }

    const userId = req.user!.id;
    const changed = await authService.changePassword(userId, currentPassword, newPassword);
    if (!changed) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    // Re-issue the session so a password change invalidates the old session id.
    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        next(regenerateError);
        return;
      }
      req.session.userId = userId;
      req.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        res.status(204).end();
      });
    });
  } catch (error) {
    next(error);
  }
}
