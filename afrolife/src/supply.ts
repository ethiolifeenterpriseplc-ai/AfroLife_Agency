import { Router } from 'express';
import { pool, requireRole } from './core.js';
import { router as workforceManagement } from './workforce-management.js';
import { router as staffing } from './staffing.js';
import { router as propertyManagement } from './property-management.js';
import { router as marketplace } from './marketplace.js';
import { h } from './supply-common.js';
import { z } from 'zod';

export const supply = Router();
supply.use(workforceManagement, staffing, propertyManagement, marketplace);

supply.get('/territories', h(async (_req, res) => {
  res.json((await pool.query('SELECT id::int, parent_id::int, level, name FROM territories ORDER BY level, name')).rows);
}));

supply.post('/territories', requireRole('global_admin'), h(async (req, res) => {
  const b = z.object({ level: z.enum(['country', 'region', 'city', 'sub_city', 'woreda', 'kebele', 'zone']), name: z.string().min(2), parent_id: z.number().int().optional() }).parse(req.body);
  const r = await pool.query('INSERT INTO territories (parent_id, level, name) VALUES ($1,$2,$3) RETURNING id::int, parent_id::int, level, name', [b.parent_id ?? null, b.level, b.name]);
  res.status(201).json(r.rows[0]);
}));
