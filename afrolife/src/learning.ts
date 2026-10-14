import { Router, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError, requireActivity, requireAnyActivity, withUser } from './core.js';
import { ROLE_NAMES } from './role-activities.js';

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const category = z.enum([
  'workforce_onboarding',
  'property_management',
  'tenant_support',
  'landlord_support',
  'buyer_support',
  'seller_support',
  'agent_training',
  'general_support',
]);
const contentType = z.enum(['video', 'tutorial', 'article']);
const status = z.enum(['draft', 'published']);
const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === 'https:', 'Video links must use HTTPS');
const ContentFields = {
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(5).max(1000),
  category,
  content_type: contentType,
  audience_roles: z.array(z.enum(ROLE_NAMES)).min(1).max(ROLE_NAMES.length),
  video_url: httpsUrl.nullable().optional(),
  body: z.string().trim().max(20_000).default(''),
  status,
};
const CreateContent = z.object(ContentFields).strict().superRefine((value, context) => {
  if (value.content_type === 'video' && !value.video_url) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['video_url'], message: 'Video content requires an HTTPS video URL' });
  }
});
const UpdateContent = z.object({
  title: ContentFields.title.optional(),
  summary: ContentFields.summary.optional(),
  category: ContentFields.category.optional(),
  content_type: ContentFields.content_type.optional(),
  audience_roles: ContentFields.audience_roles.optional(),
  video_url: ContentFields.video_url,
  body: ContentFields.body.optional(),
  status: ContentFields.status.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const learningRouter = Router();

learningRouter.get('/learning/content', requireAnyActivity('learning.content.view', 'learning.content.manage'), h(async (req, res) => {
  const content = await withUser(req.user!, async (client) => (await client.query(
    `SELECT id, title, summary, category, content_type, audience_roles, video_url, body, status,
            created_by, updated_by, created_at, updated_at
     FROM learning_content
     ORDER BY updated_at DESC
     LIMIT 200`,
  )).rows);
  res.json(content);
}));

learningRouter.post('/learning/content', requireActivity('learning.content.manage'), h(async (req, res) => {
  const body = CreateContent.parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const content = (await client.query(
      `INSERT INTO learning_content
         (title, summary, category, content_type, audience_roles, video_url, body, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
       RETURNING id, title, summary, category, content_type, audience_roles, video_url, body, status,
                 created_by, updated_by, created_at, updated_at`,
      [body.title, body.summary, body.category, body.content_type, body.audience_roles, body.video_url ?? null, body.body, body.status, req.user!.id],
    )).rows[0];
    await client.query(
      'INSERT INTO learning_content_audit (content_id, actor_id, action) VALUES ($1,$2,$3)',
      [content.id, req.user!.id, body.status === 'published' ? 'published' : 'created'],
    );
    return content;
  });
  res.status(201).json(row);
}));

learningRouter.patch('/learning/content/:id', requireActivity('learning.content.manage'), h(async (req, res) => {
  const body = UpdateContent.parse(req.body);
  const row = await withUser(req.user!, async (client) => {
    const previous = (await client.query(
      'SELECT id, status, content_type, video_url FROM learning_content WHERE id=$1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (!previous) throw new HttpError(404, 'Training content not found');
    const contentTypeValue = body.content_type ?? previous.content_type;
    const videoUrlValue = body.video_url === undefined ? previous.video_url : body.video_url;
    if (contentTypeValue === 'video' && !videoUrlValue) {
      throw new HttpError(422, 'Video content requires an HTTPS video URL');
    }
    const fields = Object.keys(body) as (keyof typeof body)[];
    const values = fields.map((key) => body[key]);
    const assignments = fields.map((key, index) => `${key}=$${index + 2}`);
    assignments.push('updated_by=$1', 'updated_at=now()');
    const updated = (await client.query(
      `UPDATE learning_content SET ${assignments.join(', ')}
       WHERE id=$${values.length + 2}
       RETURNING id, title, summary, category, content_type, audience_roles, video_url, body, status,
                 created_by, updated_by, created_at, updated_at`,
      [req.user!.id, ...values, req.params.id],
    )).rows[0];
    const action = body.status === 'published' && previous.status !== 'published'
      ? 'published'
      : 'updated';
    await client.query(
      'INSERT INTO learning_content_audit (content_id, actor_id, action) VALUES ($1,$2,$3)',
      [updated.id, req.user!.id, action],
    );
    return updated;
  });
  res.json(row);
}));

learningRouter.delete('/learning/content/:id', requireActivity('learning.content.manage'), h(async (req, res) => {
  const archived = await withUser(req.user!, async (client) => {
    const row = (await client.query(
      `UPDATE learning_content SET status='archived', updated_by=$2, updated_at=now()
       WHERE id=$1 AND status <> 'archived'
       RETURNING id`,
      [req.params.id, req.user!.id],
    )).rows[0];
    if (!row) throw new HttpError(404, 'Training content not found or already archived');
    await client.query(
      "INSERT INTO learning_content_audit (content_id, actor_id, action) VALUES ($1,$2,'archived')",
      [row.id, req.user!.id],
    );
    return row;
  });
  res.json({ id: archived.id, status: 'archived' });
}));
