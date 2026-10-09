import type { PoolClient } from 'pg';

export async function notify(c: PoolClient, userId: string | null, template: string, payload: Record<string, unknown>) {
  if (!userId) return;
  await c.query(
    `INSERT INTO notifications (user_id, channel, template, payload, status)
     VALUES ($1, 'inapp', $2, $3, 'sent'),
            ($1, 'webhook', $2, $3, 'pending')`,
    [userId, template, JSON.stringify(payload)],
  );
}
