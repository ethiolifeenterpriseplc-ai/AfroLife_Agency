import '../../src/env.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import { HttpError } from '../../src/http-error.js';
import { correlationIdMiddleware, getCorrelationId } from '../../src/request-context.js';
import { authenticateGlobalBi } from './auth.js';
import { assertReadOnlyDatabaseSafety, pool } from './db.js';
import { createGlobalBiRouter } from './router.js';

const app = express();
app.use(correlationIdMiddleware);
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'global-bi', database: 'connected' });
  } catch (error) {
    next(error);
  }
});
app.use('/api/v1/global-bi', authenticateGlobalBi, createGlobalBiRouter());
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const correlationId = getCorrelationId(req);
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, correlation_id: correlationId });
    return;
  }
  if (error instanceof Error && 'flatten' in error && typeof error.flatten === 'function') {
    res.status(400).json({ error: 'Invalid input', details: error.flatten(), correlation_id: correlationId });
    return;
  }
  console.error(`Global BI request failed [${correlationId}]`, error);
  res.status(500).json({ error: 'Internal error', correlation_id: correlationId });
});

const port = Number(process.env.PORT ?? 3310);
await assertReadOnlyDatabaseSafety();
const server = app.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Global BI service listening on ${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  server.once(signal, () => server.close(() => pool.end().finally(() => process.exit(0))));
}
