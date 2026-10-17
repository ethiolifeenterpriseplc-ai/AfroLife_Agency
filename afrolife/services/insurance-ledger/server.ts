import '../../src/env.js';
import express from 'express';
import { createInsuranceLedgerRouter } from '../../src/insurance-ledger.js';
import { createInsuranceRequestsRouter } from '../../src/insurance-requests.js';
import { HttpError } from '../../src/http-error.js';
import { correlationIdMiddleware, getCorrelationId } from '../../src/request-context.js';
import { pool, withUser, assertServiceDatabaseSafety } from './db.js';
import { identityPool, withIdentityUser, assertIdentityDatabaseSafety } from './identity-db.js';
import { authenticateGateway } from './auth.js';
import { dispatchAccountingEvents } from '../../src/accounting-outbox.js';

const app = express();
app.use(correlationIdMiddleware);
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', async (_req, res, next) => {
  try {
    await Promise.all([pool.query('SELECT 1'), identityPool.query('SELECT 1')]);
    res.json({ ok: true, service: 'insurance', ledgerDatabase: 'connected', identityDatabase: 'connected' });
  } catch (error) {
    next(error);
  }
});
app.use('/api/v1/insurance/ledger', authenticateGateway, createInsuranceLedgerRouter(withUser));
app.use('/api/v1/insurance/requests', authenticateGateway, createInsuranceRequestsRouter(withIdentityUser));
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = getCorrelationId(req);
  const reply = (status: number, body: Record<string, unknown>) =>
    res.status(status).json({ ...body, correlation_id: correlationId });
  if (error instanceof HttpError) return reply(error.status, { error: error.message });
  if (error instanceof Error && 'flatten' in error && typeof error.flatten === 'function') {
    return reply(400, { error: 'Invalid input', details: error.flatten() });
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === '22P02') return reply(400, { error: 'Invalid id or value' });
    if (code === '23505') return reply(409, { error: 'Duplicate record' });
    if (code === 'P0001' || code === '23514') {
      return reply(422, { error: error instanceof Error ? error.message : 'Invalid ledger transition' });
    }
  }
  console.error('Insurance service request failed [' + correlationId + ']', error);
  return reply(500, { error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 3100);
await Promise.all([assertServiceDatabaseSafety(), assertIdentityDatabaseSafety()]);
const server = app.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`Insurance ledger service listening on ${port}`);
});

let accountingDispatching = false;
if (process.env.ACCOUNTING_SERVICE_URL && process.env.ACCOUNTING_INGEST_SECRET) {
  setInterval(async () => {
    if (accountingDispatching) return;
    accountingDispatching = true;
    try {
      await dispatchAccountingEvents(pool, process.env.ACCOUNTING_SERVICE_URL!, process.env.ACCOUNTING_INGEST_SECRET!, 'afrolife_core', 'super_admin');
    } catch (error) {
      console.error('Insurance accounting event dispatch failed', error instanceof Error ? error.message : error);
    } finally {
      accountingDispatching = false;
    }
  }, 5_000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => Promise.all([pool.end(), identityPool.end()]).finally(() => process.exit(0))));
}
