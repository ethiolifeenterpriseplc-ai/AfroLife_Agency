import '../../src/env.js';
import express from 'express';
import { HttpError } from '../../src/http-error.js';
import { pool, assertServiceDatabaseSafety } from './db.js';
import { authenticateGateway } from './auth.js';
import { edirRouter } from './router.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'afrolife-edir', database: 'connected' });
  } catch (error) {
    next(error);
  }
});
app.use('/api/v1/edir', authenticateGateway, edirRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Error && 'flatten' in error && typeof error.flatten === 'function') {
    return res.status(400).json({ error: 'Invalid input', details: error.flatten() });
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === '22P02') return res.status(400).json({ error: 'Invalid id or value' });
    if (code === '23505') return res.status(409).json({ error: 'Duplicate Edir record' });
    if (code === 'P0001' || code === '23514') {
      return res.status(422).json({ error: error instanceof Error ? error.message : 'Invalid Edir transition' });
    }
  }
  console.error('AfroLife Edir service request failed', error);
  res.status(500).json({ error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 3200);
await assertServiceDatabaseSafety();
const server = app.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`AfroLife Edir service listening on ${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => pool.end().finally(() => process.exit(0))));
}
