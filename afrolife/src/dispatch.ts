import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';

export async function dispatchOnce(pool: Pool, endpoint: string, secret: string) {
  const client = await pool.connect();
  let event: { id: string; user_id: string; template: string; payload: unknown } | undefined;
  try {
    await client.query('BEGIN');
    event = (await client.query(
      `SELECT id, user_id, template, payload
       FROM notifications
       WHERE channel = 'webhook'
         AND (status = 'pending' OR (status = 'sending' AND created_at < now() - interval '5 minutes'))
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    )).rows[0];
    if (!event) {
      await client.query('COMMIT');
      return false;
    }
    await client.query("UPDATE notifications SET status = 'sending' WHERE id = $1", [event.id]);
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
      headers: { 'content-type': 'application/json', 'x-afrolife-signature': signature },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    await pool.query("UPDATE notifications SET status = 'pending' WHERE id = $1", [event.id]);
    throw error;
  }
  await pool.query(
    'UPDATE notifications SET status = $2, sent_at = CASE WHEN $2 = $3 THEN now() ELSE sent_at END WHERE id = $1',
    [event.id, response.ok ? 'sent' : 'pending', 'sent'],
  );
  if (!response.ok) throw new Error(`Notification webhook returned HTTP ${response.status}`);
  return true;
}
