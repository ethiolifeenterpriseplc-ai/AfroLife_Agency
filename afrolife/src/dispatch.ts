import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';

export function notificationRetryDelaySeconds(attemptCount: number): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError('Notification attempt count must be a positive integer');
  }
  return Math.min(3600, 15 * 2 ** Math.min(attemptCount - 1, 8));
}

async function recordFailure(
  pool: Pool,
  eventId: string,
  attemptCount: number,
  error: unknown,
) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : 'Notification delivery failed';
  await pool.query(
    `UPDATE notifications
     SET status=CASE WHEN attempt_count >= 12 THEN 'dead' ELSE 'pending' END,
         next_attempt_at=CASE WHEN attempt_count >= 12 THEN now()
           ELSE now()+make_interval(secs=>$3) END,
         claimed_at=NULL,last_error=$2
     WHERE id=$1 AND channel='webhook' AND status='sending'`,
    [eventId, message, notificationRetryDelaySeconds(attemptCount)],
  );
}

export async function dispatchOnce(pool: Pool, endpoint: string, secret: string) {
  const client = await pool.connect();
  let event: { id: string; user_id: string; template: string; payload: unknown; attempt_count: number } | undefined;
  try {
    await client.query('BEGIN');
    event = (await client.query(
      `SELECT id, user_id, template, payload
       FROM notifications
       WHERE channel = 'webhook'
         AND ((status = 'pending' AND next_attempt_at <= now())
           OR (status = 'sending' AND claimed_at < now() - interval '5 minutes'))
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    )).rows[0];
    if (!event) {
      await client.query('COMMIT');
      return false;
    }
    event.attempt_count = (await client.query(
      `UPDATE notifications SET status='sending',attempt_count=attempt_count+1,
         total_attempt_count=total_attempt_count+1,claimed_at=now()
       WHERE id=$1 RETURNING attempt_count`,
      [event.id],
    )).rows[0].attempt_count;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const body = JSON.stringify({ id: event.id, user_id: event.user_id, template: event.template, payload: event.payload });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-afrolife-signature': signature,
        'idempotency-key': String(event.id),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    await recordFailure(pool, event.id, event.attempt_count, error);
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Notification webhook returned HTTP ${response.status}`);
    await recordFailure(pool, event.id, event.attempt_count, error);
    throw error;
  }
  await pool.query(
    `UPDATE notifications SET status='sent',sent_at=now(),claimed_at=NULL,last_error=NULL
     WHERE id=$1 AND channel='webhook' AND status='sending'`,
    [event.id],
  );
  return true;
}
