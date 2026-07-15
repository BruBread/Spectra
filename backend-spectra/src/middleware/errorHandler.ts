import type { NextFunction, Request, Response } from 'express';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('[error]', error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ error: message });
}
