import '../../src/env.js';
import express from 'express';
import { HttpError } from '../../src/http-error.js';
import { createMfiRouter } from '../../src/mfi.js';
import { authenticateGateway } from './auth.js';
import { assertServiceDatabaseSafety, pool, withUser } from './db.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'sacco-mfi', database: 'connected' });
  } catch (error) {
    next(error);
  }
});
app.post(
  '/api/v1/mfi/institutions/:institutionId/members/:memberId/documents/:documentType',
  express.raw({ type: () => true, limit: '10mb' }),
);
app.use('/api/v1/mfi', authenticateGateway, createMfiRouter(withUser));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Error && 'flatten' in error && typeof error.flatten === 'function') {
    return res.status(400).json({ error: 'Invalid input', details: error.flatten() });
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === '22P02') return res.status(400).json({ error: 'Invalid id or value' });
    if (code === '23505') return res.status(409).json({ error: 'Duplicate SACCO/MFI record' });
    if (code === 'P0001' || code === '23514') {
      return res.status(422).json({ error: error instanceof Error ? error.message : 'Invalid SACCO/MFI transition' });
    }
  }
  console.error('SACCO/MFI service request failed', error);
  res.status(500).json({ error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 3300);
await assertServiceDatabaseSafety();
const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`SACCO/MFI service listening on ${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => pool.end().finally(() => process.exit(0))));
}
