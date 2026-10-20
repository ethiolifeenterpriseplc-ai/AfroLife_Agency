import express, { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withUser, requireActivity, requireRole, HttpError, isPlatformAdminRole } from '../../src/core.js';
import { sniff, sniffListingMedia } from '../../src/files.js';
import { getFile, putFile } from '../../src/storage.js';
import { notify } from '../../src/notify.js';
import { audit, loadRules } from '../../src/domain.js';
import { matchingTuningFromRules, scoreMatch, weightsFromRules } from '../../src/matching.js';
import { Phone } from '../../src/validators.js';
import { h, AGENT, num, requireListingPlan } from '../../src/supply-common.js';
import { loadMarketplaceConfig } from '../../src/marketplace-config.js';

export const router = Router();
// ================= Properties and units =================
const UnitIn = z.object({ unit_no: z.string().trim().min(1).max(80), floor: z.number().int().optional(), ptype: z.string().trim().min(2).max(80).default('apartment'), rent: z.number().nonnegative().optional() });
const PropIn = z.object({
  address: z.string().trim().min(5).max(300), description: z.string().trim().max(5000).default(''),
  ptype: z.enum(['apartment_building', 'house', 'commercial', 'land']), listing_mode: z.enum(['sale','rent','sale_or_rent']).default('rent'),
  sale_price: z.number().positive().optional(), rent_period: z.enum(['day','week','month','year']).default('month'),
  territory_id: z.number().int(), owner_lead_id: z.string().uuid().optional(), owner_user_id: z.string().uuid().optional(), units: z.array(UnitIn).default([]),
});
const PropertyResubmission = z.object({
  address: z.string().trim().min(5).max(300),
  description: z.string().trim().max(5000),
  listing_mode: z.enum(['sale', 'rent', 'sale_or_rent']),
  sale_price: z.number().positive().optional(),
  rent_period: z.enum(['day', 'week', 'month', 'year']),
}).strict();

router.post('/properties', requireActivity('property.listings.manage'), requireListingPlan, h(async (req, res) => {
  const b = PropIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const config = await loadMarketplaceConfig(c);
    const types = config.properties.property_types as {key:string;enabled:boolean}[];
    const periods = config.rentals.periods as {key:string;enabled:boolean}[];
    if (!types.some((item) => item.key === b.ptype && item.enabled)) throw new HttpError(422, 'Choose an enabled property type.');
    if (!periods.some((item) => item.key === b.rent_period && item.enabled)) throw new HttpError(422, 'Choose an enabled rental period.');
    if (!(config.system.enabled_domains as string[]).includes('properties')) throw new HttpError(403, 'Property listings are currently disabled.');
    if (b.listing_mode !== 'rent' && !b.sale_price) throw new HttpError(422, 'Enter a sale price for this property.');
    if (b.listing_mode === 'rent' && b.sale_price) throw new HttpError(422, 'Sale price is not used for rental-only listings.');
    if (b.listing_mode === 'sale' && b.units.some((unit) => unit.rent !== undefined)) throw new HttpError(422, 'Unit rent cannot be set on a sale-only listing.');
    const isAgent = AGENT.includes(req.user!.role);
    const isPropertyOwner = req.user!.role === 'property_owner';
    const isManager = isPlatformAdminRole(req.user!.role) || req.user!.role === 'corporate_business_manager';
    let sourceAgentId: string | null = isAgent ? req.user!.id : null;
    let ownerUserId: string | null = isPropertyOwner ? req.user!.id : null;
    if (isManager && b.owner_user_id) {
      const seller = (await c.query("SELECT id,role FROM users WHERE id=$1 AND active=true AND role IN ('master_agent','field_agent','property_owner')", [b.owner_user_id])).rows[0];
      if (!seller) throw new HttpError(422, 'Select an active agent or seller for this listing.');
      if (AGENT.includes(seller.role)) sourceAgentId = seller.id;
      else ownerUserId = seller.id;
    } else if (!isManager && b.owner_user_id) {
      throw new HttpError(403, 'Only a manager can select a seller for a listing.');
    }
    const listingReviewStatus = config.system.moderation_required === true ? 'pending_review' : 'approved';
    const p = (await c.query(
      `INSERT INTO properties (address, description, ptype, listing_mode, sale_price, rent_period, territory_id, owner_lead_id, source_agent_id, owner_user_id, created_by, listing_review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [b.address,b.description,b.ptype,b.listing_mode,b.sale_price ?? null,b.rent_period,b.territory_id,b.owner_lead_id ?? null,sourceAgentId,ownerUserId,req.user!.id,listingReviewStatus],
    )).rows[0];
    for (const u of b.units) await c.query('INSERT INTO property_units (property_id, unit_no, floor, ptype, rent) VALUES ($1,$2,$3,$4,$5)', [p.id, u.unit_no, u.floor ?? null, u.ptype, u.rent ?? null]);
    await audit(c, req.user!.id, 'property_created', 'property', p.id, null, { address: b.address, units: b.units.length });
    return p;
  });
  res.status(201).json(row);
}));
router.post('/properties/:id/photos/upload', requireActivity('property.listings.manage'), requireListingPlan, express.raw({ type: () => true, limit: '100mb' }), h(async (req, res) => {
  const caption = z.string().trim().max(300).optional().parse(req.query.caption) ?? '';
  const file = req.body as Buffer;
  if (!Buffer.isBuffer(file) || file.length === 0) throw new HttpError(400, 'Choose a property picture or video to upload.');
  const mime = sniffListingMedia(file);
  if (!mime) throw new HttpError(415, 'Only JPEG/PNG pictures and MP4/WebM videos are accepted.');
  const id = randomUUID();
  const key = randomUUID();
  const sha256 = createHash('sha256').update(file).digest('hex');
  const photo = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM properties WHERE id = $1', [req.params.id])).rowCount) {
      throw new HttpError(404, 'Property not found.');
    }
    const config = await loadMarketplaceConfig(c);
    const maxBytes = Number(mime.startsWith('image/') ? config.system.image_max_bytes : config.system.video_max_bytes);
    if (file.length > maxBytes) throw new HttpError(413, 'The media file exceeds the configured size limit.');
    const count = Number((await c.query('SELECT count(*)::int AS count FROM property_photos WHERE property_id=$1',[req.params.id])).rows[0].count);
    if (count >= Number(config.system.max_media_per_listing)) throw new HttpError(409, 'This listing has reached its configured media limit.');
    const result = await c.query(
      `INSERT INTO property_photos (id,property_id,storage_key,sha256,mime,size_bytes,caption,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, property_id, mime, size_bytes, caption, created_at`,
      [id, req.params.id, key, sha256, mime, file.length, caption, req.user!.id],
    );
    await putFile(key, file);
    await audit(c, req.user!.id, 'property_photo_uploaded', 'property_photo', id, null, { property_id: req.params.id, caption });
    return result.rows[0];
  });
  res.status(201).json(photo);
}));

router.get('/properties/:id/photos', requireActivity('property.listings.view'), requireListingPlan, h(async (req, res) => {
  const photos = await withUser(req.user!, async (c) => {
    if (!(await c.query('SELECT id FROM properties WHERE id = $1', [req.params.id])).rowCount) {
      throw new HttpError(404, 'Property not found.');
    }
    return (await c.query(
      'SELECT id, property_id, mime, size_bytes, caption, created_at FROM property_photos WHERE property_id = $1 ORDER BY created_at DESC',
      [req.params.id],
    )).rows;
  });
  res.json(photos);
}));

router.get('/properties/:id/photos/:photoId/file', requireActivity('property.listings.view'), requireListingPlan, h(async (req, res) => {
  const photo = await withUser(req.user!, async (c) => (await c.query(
    'SELECT id, storage_key, mime FROM property_photos WHERE id = $1 AND property_id = $2',
    [req.params.photoId, req.params.id],
  )).rows[0]);
  if (!photo) throw new HttpError(404, 'Property picture not found.');
  const file = await getFile(photo.storage_key);
  res.set({
    'Content-Type': photo.mime,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  }).send(file);
}));

router.post('/properties/:id/units', requireActivity('property.listings.manage'), requireListingPlan, h(async (req, res) => {
  const u = UnitIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const property = (await c.query('SELECT id, listing_mode FROM properties WHERE id = $1', [req.params.id])).rows[0];
    if (!property) throw new HttpError(404, 'Property not found');
    if (property.listing_mode === 'sale' && u.rent !== undefined) throw new HttpError(422, 'Unit rent cannot be set on a sale-only listing.');
    return (await c.query('INSERT INTO property_units (property_id, unit_no, floor, ptype, rent) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.params.id, u.unit_no, u.floor ?? null, u.ptype, u.rent ?? null])).rows[0];
  });
  res.status(201).json(row);
}));

router.patch('/properties/:id/review', requireRole('super_admin', 'corporate_business_manager'), h(async (req, res) => {
  const body = z.object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(1000).optional(),
  }).strict().parse(req.body);
  if (body.decision === 'reject' && (!body.note || body.note.length < 10)) {
    throw new HttpError(422, 'Provide a reason of at least 10 characters when returning a listing.');
  }
  const property = await withUser(req.user!, async (c) => {
    const current = (await c.query(
      'SELECT id, created_by, listing_review_status FROM properties WHERE id = $1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Property listing not found.');
    if (current.listing_review_status !== 'pending_review') throw new HttpError(409, 'Property listing is not awaiting review.');
    if (current.created_by === req.user!.id) throw new HttpError(403, 'A different manager must review your property listing.');
    const status = body.decision === 'approve' ? 'approved' : 'rejected';
    const updated = (await c.query(
      `UPDATE properties SET listing_review_status=$2, listing_review_note=$3,
         listing_reviewed_by=$4, listing_reviewed_at=now()
       WHERE id=$1 RETURNING id, listing_review_status, listing_review_note, listing_reviewed_by, listing_reviewed_at`,
      [current.id, status, body.decision === 'reject' ? body.note : null, req.user!.id],
    )).rows[0];
    await audit(c, req.user!.id, `property_listing_${status}`, 'property', current.id,
      { listing_review_status: current.listing_review_status },
      { listing_review_status: status, note: body.decision === 'reject' ? body.note : null });
    return updated;
  });
  res.json(property);
}));

router.patch('/properties/:id/resubmit', requireActivity('property.listings.manage'), requireListingPlan, h(async (req, res) => {
  const body = PropertyResubmission.parse(req.body);
  if (body.listing_mode !== 'rent' && !body.sale_price) throw new HttpError(422, 'Enter a sale price for this property.');
  if (body.listing_mode === 'rent' && body.sale_price) throw new HttpError(422, 'Sale price is not used for rental-only listings.');
  const property = await withUser(req.user!, async (c) => {
    const current = (await c.query(
      'SELECT id, listing_review_status, listing_mode, sale_price, rent_period FROM properties WHERE id = $1 FOR UPDATE',
      [req.params.id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Property listing not found.');
    if (current.listing_review_status !== 'rejected') throw new HttpError(409, 'Only a returned property listing can be corrected and resubmitted.');
    if (body.listing_mode === 'sale') {
      const rentedUnits = await c.query(
        'SELECT 1 FROM property_units WHERE property_id = $1 AND rent IS NOT NULL LIMIT 1',
        [current.id],
      );
      if (rentedUnits.rowCount) throw new HttpError(422, 'Remove unit rental prices before resubmitting this as sale-only.');
    }
    const config = await loadMarketplaceConfig(c);
    const periods = config.rentals.periods as { key: string; enabled: boolean }[];
    if (body.rent_period !== current.rent_period
      && !periods.some((item) => item.key === body.rent_period && item.enabled)) {
      throw new HttpError(422, 'Choose an enabled rental period.');
    }
    const updated = (await c.query(
      `UPDATE properties SET address=$2, description=$3, listing_mode=$4, sale_price=$5, rent_period=$6,
         listing_review_status='pending_review', listing_review_note=NULL,
         listing_reviewed_by=NULL, listing_reviewed_at=NULL
       WHERE id=$1
       RETURNING id, address, listing_mode, sale_price, rent_period, listing_review_status, listing_review_note`,
      [current.id, body.address, body.description, body.listing_mode, body.sale_price ?? null, body.rent_period],
    )).rows[0];
    await audit(c, req.user!.id, 'property_listing_resubmitted', 'property', current.id,
      { listing_review_status: current.listing_review_status, listing_mode: current.listing_mode, sale_price: current.sale_price, rent_period: current.rent_period },
      { listing_review_status: 'pending_review', listing_mode: body.listing_mode, sale_price: body.sale_price ?? null, rent_period: body.rent_period });
    return updated;
  });
  res.json(property);
}));

router.get('/properties', requireActivity('property.listings.view'), requireListingPlan, h(async (req, res) => {
  const reviewFields = req.user!.role === 'customer'
    ? ''
    : 'p.created_by, p.listing_review_status, p.listing_review_note, p.listing_reviewed_by, p.listing_reviewed_at,';
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT p.id, p.address, p.description, p.ptype, p.listing_mode, p.sale_price, p.rent_period, ${reviewFields} p.territory_id, p.status, p.created_at,
            COALESCE(
              json_agg(json_build_object(
                'id', u.id,
                'unit_no', u.unit_no,
                'floor', u.floor,
                'ptype', u.ptype,
                'rent', u.rent,
                'occupancy', u.occupancy
              ) ORDER BY u.unit_no) FILTER (WHERE u.id IS NOT NULL),
              '[]'
            ) AS units
     FROM properties p LEFT JOIN property_units u ON u.property_id = p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 200`)).rows));
}));
