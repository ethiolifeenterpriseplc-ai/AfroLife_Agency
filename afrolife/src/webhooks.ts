import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { withService } from './core.js';

type PaymentEvent = { event_id: string; invoice_id: string; amount: number; reference: string };
type ExistingPaymentEvent = { invoice_id: string; amount: string | number; reference: string };

export function isSamePaymentEvent(existing: ExistingPaymentEvent, event: PaymentEvent): boolean {
  const existingAmount = Number(existing.amount);
  return existing.invoice_id.toLowerCase() === event.invoice_id.toLowerCase()
    && Number.isFinite(existingAmount)
    && Math.round(existingAmount * 100) === Math.round(event.amount * 100)
    && existing.reference === event.reference;
}

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
      let event: PaymentEvent;
      try {
        event = z.object({
          event_id: z.string().trim().min(1).max(160),
          invoice_id: z.string().uuid(),
          amount: z.number().finite().positive().max(999_999_999_999.99).refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7),
          reference: z.string().trim().min(3).max(200),
        }).strict().parse(JSON.parse(req.body.toString('utf8')));
      } catch {
        res.status(400).json({ error: 'Invalid JSON payment event' });
        return;
      }

      const result = await withService('payment_webhook', async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`payment-provider-event:${event.event_id}`]);
        const existing = await c.query<ExistingPaymentEvent>(
          'SELECT invoice_id, amount, reference FROM payments WHERE provider_event_id = $1',
          [event.event_id],
        );
        if (existing.rowCount) {
          if (!isSamePaymentEvent(existing.rows[0], event)) {
            return { status: 409, body: { error: 'Payment event identifier was already used for a different payment' } };
          }
          return { status: 200, body: { ok: true, duplicate: true } };
        }
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
        return { status: 200, body: { ok: true } };
      });
      res.status(result.status).json(result.body);
    })().catch(next);
  };
}
