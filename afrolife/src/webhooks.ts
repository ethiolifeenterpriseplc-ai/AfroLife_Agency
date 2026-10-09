import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { withService } from './core.js';
import { post } from './domain.js';

export function paymentWebhook(secret: string): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Expected a raw JSON body' });
        return;
      }
      const supplied = req.header('x-payment-signature') ?? '';
      const expected = createHmac('sha256', secret).update(req.body).digest('hex');
      const got = Buffer.from(supplied, 'hex');
      const want = Buffer.from(expected, 'hex');
      if (got.length !== want.length || !timingSafeEqual(got, want)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
      let event: { event_id: string; invoice_id: string; amount: number; reference: string };
      try {
        event = JSON.parse(req.body.toString('utf8'));
      } catch {
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }
      if (!event.event_id || !event.invoice_id || !Number.isFinite(event.amount) || event.amount <= 0 || !event.reference) {
        res.status(400).json({ error: 'Invalid payment event' });
        return;
      }

      const result = await withService('payment_webhook', async (c) => {
        const existing = await c.query('SELECT id FROM payments WHERE provider_event_id = $1', [event.event_id]);
        if (existing.rowCount) return { status: 200, body: { ok: true, duplicate: true } };
        const inv = (await c.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [event.invoice_id])).rows[0];
        if (!inv) return { status: 404, body: { error: 'Invoice not found' } };
        if (inv.status !== 'pending' || Math.round(Number(inv.amount) * 100) !== Math.round(event.amount * 100)) {
          return { status: 409, body: { error: 'Invoice is not pending or amount does not match' } };
        }
        await c.query(
          `INSERT INTO payments (invoice_id, amount, channel, reference, provider_event_id, recorded_by)
           VALUES ($1,$2,'webhook',$3,$4,NULL)`,
          [event.invoice_id, event.amount, event.reference, event.event_id],
        );
        await c.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [event.invoice_id]);
        await post(c, 'invoice', inv.id, [['Cash', event.amount, 0], ['Accounts Receivable', 0, event.amount]]);
        return { status: 200, body: { ok: true } };
      });
      res.status(result.status).json(result.body);
    })().catch(next);
  };
}
