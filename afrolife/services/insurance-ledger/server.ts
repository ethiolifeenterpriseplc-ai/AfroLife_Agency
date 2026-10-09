import '../../src/env.js';
import express from 'express';
import { createInsuranceLedgerRouter } from '../../src/insurance-ledger.js';
import { HttpError } from '../../src/http-error.js';
import { pool, withUser, assertServiceDatabaseSafety } from './db.js';
import { authenticateGateway } from './auth.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'insurance-ledger', database: 'connected' });
  } catch (error) {
    next(error);
  }
});
app.use('/api/v1/insurance/ledger', authenticateGateway, createInsuranceLedgerRouter(withUser));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Error && 'flatten' in error && typeof error.flatten === 'function') {
    return res.status(400).json({ error: 'Invalid input', details: error.flatten() });
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === '22P02') return res.status(400).json({ error: 'Invalid id or value' });
    if (code === '23505') return res.status(409).json({ error: 'Duplicate record' });
    if (code === 'P0001' || code === '23514') {
      return res.status(422).json({ error: error instanceof Error ? error.message : 'Invalid ledger transition' });
    }
  }
  console.error('Insurance ledger service request failed', error);
  res.status(500).json({ error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 3100);
await assertServiceDatabaseSafety();
const server = app.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`Insurance ledger service listening on ${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => pool.end().finally(() => process.exit(0))));
}
