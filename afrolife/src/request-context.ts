import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

export const CORRELATION_ID_HEADER = 'x-afrolife-correlation-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getCorrelationId(req: Request): string {
  const value = req.get(CORRELATION_ID_HEADER) ?? '';
  return UUID_PATTERN.test(value) ? value.toLowerCase() : '';
}

export const correlationIdMiddleware: RequestHandler = (req, res, next) => {
  const supplied = req.get(CORRELATION_ID_HEADER) ?? '';
  const correlationId = UUID_PATTERN.test(supplied) ? supplied.toLowerCase() : randomUUID();
  req.headers[CORRELATION_ID_HEADER] = correlationId;
  res.locals.correlationId = correlationId;
  res.setHeader('X-AfroLife-Correlation-Id', correlationId);
  next();
};
