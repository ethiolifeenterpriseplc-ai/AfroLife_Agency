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
import { ConfigScope, validateMarketplaceConfig, loadMarketplaceConfig } from '../../src/marketplace-config.js';
import { nonProductionMockEnabled } from '../../src/mock-provider-config.js';
import { isClamAvConfigured, scanWithClamAv } from '../../src/clamav.js';

export const router = Router();
router.get('/marketplace/config', h(async (req, res) => {
  const config=await withUser(req.user!, loadMarketplaceConfig);
  res.json({...config,sandbox_checkout_available:nonProductionMockEnabled(process.env,'MARKETPLACE_PAYMENT_MODE')});
}));

router.patch('/marketplace/config', requireRole('super_admin','corporate_business_manager'), h(async (req, res) => {
  const { values } = z.object({ values: z.array(z.object({ scope: ConfigScope, key: z.string().min(2).max(80), value: z.unknown() }).strict()).min(1).max(40) }).strict().parse(req.body);
  const result = await withUser(req.user!, async (c) => {
    for (const entry of values) {
      if (req.user!.role === 'corporate_business_manager' && !['products','services','properties','rentals'].includes(entry.scope)) {
        throw new HttpError(403, 'Corporate Business Managers can configure marketplace domains, not system or account-security settings.');
      }
      if (req.user!.role === 'super_admin' && ['system','users'].includes(entry.scope)) {
        throw new HttpError(403, 'System-wide marketplace and account-security settings require Global Admin access.');
      }
      const nextValue = validateMarketplaceConfig(entry.scope, entry.key, entry.value);
      const current = (await c.query('SELECT config_value FROM marketplace_configuration WHERE scope=$1 AND config_key=$2 FOR UPDATE', [entry.scope, entry.key])).rows[0];
      if (!current) throw new HttpError(404, `Configuration ${entry.scope}.${entry.key} was not found.`);
      await c.query(
        `UPDATE marketplace_configuration SET config_value=$3, updated_by=$4, updated_at=now()
         WHERE scope=$1 AND config_key=$2`,
        [entry.scope, entry.key, JSON.stringify(nextValue), req.user!.id],
      );
      await audit(c, req.user!.id, 'marketplace_configuration_updated', 'marketplace_configuration', `${entry.scope}.${entry.key}`, current.config_value, nextValue);
    }
    return loadMarketplaceConfig(c);
  });
  res.json(result);
}));

router.get('/marketplace/sellers', requireRole('super_admin','corporate_business_manager'), h(async (_req, res) => {
  const sellers = await pool.query(
    `SELECT u.id, u.legal_name, u.role, u.phone FROM users u
     WHERE u.active = true AND (u.role IN ('master_agent','field_agent','property_owner'))
     ORDER BY u.legal_name LIMIT 500`,
  );
  res.json(sellers.rows);
}));

const ListingIn = z.object({
  seller_user_id: z.string().uuid().optional(),
  domain: z.enum(['products','services','equipment']), category_key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  title: z.string().trim().min(3).max(140), description: z.string().trim().min(10).max(5000),
  transaction_mode: z.enum(['sale','rental','service']), price: z.number().positive().optional(),
  rent_period: z.enum(['day','week','month','year']).optional(),
  condition: z.enum(['new','like_new','good','fair','not_applicable']).optional(), territory_id: z.number().int().positive(),
}).strict();

router.get('/marketplace/listings', h(async (req, res) => {
  const internalFields = req.user!.role === 'customer'
    ? ''
    : 'l.seller_user_id,l.source_agent_id,l.created_by,l.review_note,l.reviewed_by,l.reviewed_at,';
  const rows = await withUser(req.user!, async (c) => (await c.query(
    `SELECT l.id,${internalFields}u.legal_name AS seller_name,l.domain,l.category_key,
            l.title,l.description,l.transaction_mode,l.price,l.rent_period,l.condition,l.territory_id,l.status,l.created_at,l.updated_at,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'mime',m.mime,'size_bytes',m.size_bytes,'caption',m.caption,'created_at',m.created_at) ORDER BY m.created_at)
                      FROM marketplace_media m WHERE m.listing_id=l.id),'[]'::jsonb) AS media
     FROM marketplace_listings l JOIN users u ON u.id=l.seller_user_id
     ORDER BY CASE WHEN l.status='published' THEN 0 ELSE 1 END,l.created_at DESC LIMIT 300`,
  )).rows);
  res.json(rows);
}));

const RentalApplicationIn = z.object({
  property_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  applicant_message: z.string().trim().min(10).max(2000),
  contact_consent: z.literal(true),
}).strict();

router.post('/marketplace/rental-applications', requireRole('customer'), h(async (req, res) => {
  const body = RentalApplicationIn.parse(req.body);
  const idempotencyKey = z.string().uuid().parse(req.get('Idempotency-Key'));
  const payloadHash = createHash('sha256').update(JSON.stringify({
    property_id: body.property_id,
    unit_id: body.unit_id ?? null,
    applicant_message: body.applicant_message,
    contact_consent: body.contact_consent,
  })).digest('hex');
  const propertyId = body.property_id;
  const application = await withUser(req.user!, async (c) => {
    const prior = (await c.query(
      `SELECT id,property_id,unit_id,payload_hash,status,created_at
       FROM property_rental_applications
       WHERE applicant_user_id=$1 AND idempotency_key=$2`,
      [req.user!.id, idempotencyKey],
    )).rows[0];
    if (prior) {
      if (prior.property_id !== propertyId || prior.unit_id !== (body.unit_id ?? null)
        || prior.payload_hash !== payloadHash) {
        throw new HttpError(409, 'Idempotency-Key was already used for a different rental application.');
      }
      return { ...prior, replayed: true };
    }

    const property = (await c.query(
      `SELECT p.id,p.source_agent_id,p.owner_user_id,p.listing_mode,p.status,p.listing_review_status,
          (SELECT count(*)::int FROM property_units u WHERE u.property_id=p.id) AS unit_count
       FROM properties p WHERE p.id=$1 FOR SHARE`,
      [propertyId],
    )).rows[0];
    if (!property || property.status !== 'available' || property.listing_review_status !== 'approved'
      || !['rent', 'sale_or_rent'].includes(property.listing_mode)) {
      throw new HttpError(404, 'Available verified rental listing not found.');
    }
    if (Number(property.unit_count) > 0 && !body.unit_id) {
      throw new HttpError(422, 'Choose an available unit before applying.');
    }
    if (body.unit_id) {
      const unit = (await c.query(
        `SELECT id FROM property_units
         WHERE id=$1 AND property_id=$2 AND occupancy='vacant' FOR SHARE`,
        [body.unit_id, propertyId],
      )).rows[0];
      if (!unit) throw new HttpError(422, 'Choose an available unit in this property.');
    }
    const inserted = (await c.query(
      `INSERT INTO property_rental_applications(
         property_id,unit_id,applicant_user_id,applicant_message,contact_consent,idempotency_key,payload_hash
       ) VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING
       RETURNING id,property_id,unit_id,status,created_at`,
      [propertyId, body.unit_id ?? null, req.user!.id, body.applicant_message,
        body.contact_consent, idempotencyKey, payloadHash],
    )).rows[0];
    if (!inserted) {
      const replay = (await c.query(
        `SELECT id,property_id,unit_id,payload_hash,status,created_at
         FROM property_rental_applications WHERE applicant_user_id=$1 AND idempotency_key=$2`,
        [req.user!.id, idempotencyKey],
      )).rows[0];
      if (replay) {
        if (replay.property_id !== propertyId || replay.unit_id !== (body.unit_id ?? null)
          || replay.payload_hash !== payloadHash) {
          throw new HttpError(409, 'Idempotency-Key was already used for a different rental application.');
        }
        return { ...replay, replayed: true };
      }
      throw new HttpError(409, 'You already have an open application for this property.');
    }
    await c.query(
      `INSERT INTO property_rental_application_events(
         application_id,actor_id,event_type,from_status,to_status,reason
       ) VALUES($1,$2,'submitted',NULL,'submitted','Rental application submitted by applicant.')`,
      [inserted.id, req.user!.id],
    );
    await audit(c, req.user!.id, 'property_rental_application_submitted',
      'property_rental_application', inserted.id, null, {
        property_id: propertyId, unit_id: body.unit_id ?? null,
      });
    const reviewerId = property.owner_user_id ?? property.source_agent_id;
    if (reviewerId) {
      await notify(c, reviewerId, 'property_rental_application_submitted', {
        application_id: inserted.id, property_id: propertyId,
      });
    }
    return { ...inserted, replayed: false };
  });
  res.status(application.replayed ? 200 : 201).json(application);
}));

router.get('/marketplace/rental-applications/mine', requireRole('customer'), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT a.id,a.property_id,p.address,a.unit_id,u.unit_no,a.applicant_message,a.applicant_response,
      a.status,a.review_reason,a.created_at,a.updated_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'event_type',e.event_type,'from_status',e.from_status,'to_status',e.to_status,
        'reason',e.reason,'created_at',e.created_at
      ) ORDER BY e.created_at,e.id) FROM property_rental_application_events e
      WHERE e.application_id=a.id),'[]'::jsonb) AS events
     FROM property_rental_applications a
     LEFT JOIN properties p ON p.id=a.property_id
     LEFT JOIN property_units u ON u.id=a.unit_id
     WHERE a.applicant_user_id=$1
     ORDER BY a.created_at DESC LIMIT 100`,
    [req.user!.id],
  )).rows));
}));

const rentalApplicationReviewRoles = [
  'property_owner', 'master_agent', 'field_agent', 'global_admin', 'super_admin',
  'corporate_business_manager',
] as const;

router.get('/marketplace/rental-applications', requireActivity('property.listings.manage'),
  requireRole(...rentalApplicationReviewRoles), h(async (req, res) => {
  res.json(await withUser(req.user!, async (c) => (await c.query(
    `SELECT a.id,a.property_id,p.address,a.unit_id,u.unit_no,a.applicant_user_id,
        applicant.legal_name AS applicant_name,a.applicant_message,a.applicant_response,
        a.status,a.reviewed_by,a.reviewed_at,a.review_reason,a.created_at,a.updated_at,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'event_type',e.event_type,'from_status',e.from_status,'to_status',e.to_status,
          'reason',e.reason,'created_at',e.created_at
        ) ORDER BY e.created_at,e.id) FROM property_rental_application_events e
        WHERE e.application_id=a.id),'[]'::jsonb) AS events
     FROM property_rental_applications a
     JOIN properties p ON p.id=a.property_id
     JOIN users applicant ON applicant.id=a.applicant_user_id
     LEFT JOIN property_units u ON u.id=a.unit_id
     ORDER BY CASE WHEN a.status IN ('submitted','needs_info') THEN 0 ELSE 1 END,
       a.created_at DESC LIMIT 300`,
  )).rows));
}));

router.post('/marketplace/rental-applications/:id/respond', requireRole('customer'), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { response } = z.object({ response: z.string().trim().min(10).max(2000) }).strict().parse(req.body);
  const application = await withUser(req.user!, async (c) => {
    const current = (await c.query(
      `SELECT id,property_id,status FROM property_rental_applications
       WHERE id=$1 AND applicant_user_id=$2 FOR UPDATE`,
      [id, req.user!.id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Rental application not found.');
    if (current.status !== 'needs_info') throw new HttpError(409, 'Only an application requesting more information can receive a response.');
    const updated = (await c.query(
      `UPDATE property_rental_applications
       SET applicant_response=$2,status='submitted',updated_at=now()
       WHERE id=$1
       RETURNING id,property_id,unit_id,status,applicant_response,updated_at`,
      [id, response],
    )).rows[0];
    await c.query(
      `INSERT INTO property_rental_application_events(
         application_id,actor_id,event_type,from_status,to_status,reason
       ) VALUES($1,$2,'responded','needs_info','submitted',$3)`,
      [id, req.user!.id, response],
    );
    await audit(c, req.user!.id, 'property_rental_application_responded',
      'property_rental_application', id, { status: current.status }, { status: updated.status });
    const property = (await c.query(
      'SELECT owner_user_id,source_agent_id FROM properties WHERE id=$1',
      [current.property_id],
    )).rows[0];
    const reviewerId = property?.owner_user_id ?? property?.source_agent_id;
    if (reviewerId) {
      await notify(c, reviewerId, 'property_rental_application_responded', { application_id: id });
    }
    return updated;
  });
  res.json(application);
}));

router.post('/marketplace/rental-applications/:id/review', requireActivity('property.listings.manage'),
  requireRole(...rentalApplicationReviewRoles), h(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    decision: z.enum(['needs_info', 'accept', 'reject']),
    reason: z.string().trim().min(3).max(1000),
  }).strict().parse(req.body);
  if (body.decision !== 'accept' && body.reason.length < 10) {
    throw new HttpError(422, 'Provide a reason of at least 10 characters for a rejection or information request.');
  }
  const application = await withUser(req.user!, async (c) => {
    const current = (await c.query(
      `SELECT id,property_id,applicant_user_id,status
       FROM property_rental_applications WHERE id=$1 FOR UPDATE`,
      [id],
    )).rows[0];
    if (!current) throw new HttpError(404, 'Rental application not found.');
    if (current.applicant_user_id === req.user!.id) throw new HttpError(403, 'Applicants cannot review their own applications.');
    if (!['submitted', 'needs_info'].includes(current.status)) {
      throw new HttpError(409, 'Only a submitted application can be reviewed.');
    }
    const status = body.decision === 'accept' ? 'accepted'
      : body.decision === 'reject' ? 'rejected' : 'needs_info';
    const updated = (await c.query(
      `UPDATE property_rental_applications
       SET status=$2,reviewed_by=$3,reviewed_at=now(),review_reason=$4,updated_at=now()
       WHERE id=$1
       RETURNING id,property_id,unit_id,applicant_user_id,status,reviewed_by,reviewed_at,review_reason,updated_at`,
      [id, status, req.user!.id, body.reason],
    )).rows[0];
    await c.query(
      `INSERT INTO property_rental_application_events(
         application_id,actor_id,event_type,from_status,to_status,reason
       ) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, req.user!.id, status, current.status, status, body.reason],
    );
    await audit(c, req.user!.id, `property_rental_application_${status}`,
      'property_rental_application', id, { status: current.status }, { status, reason: body.reason });
    await notify(c, current.applicant_user_id, `property_rental_application_${status}`, {
      application_id: id, status,
    });
    return updated;
  });
  res.json(application);
}));

const sandboxPaymentsEnabled = () => nonProductionMockEnabled(process.env,'MARKETPLACE_PAYMENT_MODE');
router.post('/marketplace/listings/:id/sandbox-orders', requireRole('customer'), h(async (req,res) => {
  if(process.env.NODE_ENV==='production')throw new HttpError(404,'Marketplace sandbox orders are disabled in production.');
  const listingId=z.string().uuid().parse(req.params.id);
  const body=z.object({quantity:z.number().int().min(1).max(1000),idempotency_key:z.string().trim().min(8).max(120)}).strict().parse(req.body);
  const order=await withUser(req.user!,async c=>{
    const listing=(await c.query("SELECT id,seller_user_id,price FROM marketplace_listings WHERE id=$1 AND status='published' AND transaction_mode='sale' AND price IS NOT NULL",[listingId])).rows[0];
    if(!listing)throw new HttpError(404,'Published fixed-price sale listing not found.');
    const created=(await c.query(`INSERT INTO marketplace_sandbox_orders(buyer_user_id,listing_id,seller_user_id,quantity,unit_price,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(buyer_user_id,idempotency_key) DO NOTHING RETURNING *`,[req.user!.id,listing.id,listing.seller_user_id,body.quantity,listing.price,body.idempotency_key])).rows[0];
    if(created)return created;
    const existing=(await c.query('SELECT * FROM marketplace_sandbox_orders WHERE buyer_user_id=$1 AND idempotency_key=$2',[req.user!.id,body.idempotency_key])).rows[0];
    if(!existing||existing.listing_id!==listing.id||existing.quantity!==body.quantity)throw new HttpError(409,'Idempotency key was already used for a different order.');
    return existing;
  });
  res.status(201).json({...order,notice:'Sandbox order only. No real payment was taken and no accounting event was created.'});
}));
router.post('/marketplace/sandbox-orders/:id/mock-payment', requireRole('customer'), h(async(req,res)=>{
  if(!sandboxPaymentsEnabled())throw new HttpError(404,'Marketplace mock payments are disabled.');
  const orderId=z.string().uuid().parse(req.params.id);
  const result=await withUser(req.user!,async c=>{
    const order=(await c.query('SELECT * FROM marketplace_sandbox_orders WHERE id=$1 AND buyer_user_id=$2 FOR UPDATE',[orderId,req.user!.id])).rows[0];
    if(!order)throw new HttpError(404,'Sandbox order not found.');
    if(order.status==='sandbox_paid')return order;
    if(order.status!=='pending_sandbox_payment')throw new HttpError(409,'Order is not awaiting sandbox payment.');
    return (await c.query("UPDATE marketplace_sandbox_orders SET status='sandbox_paid',payment_reference=$2,paid_at=now() WHERE id=$1 RETURNING *",[orderId,`MOCK-${orderId}`])).rows[0];
  });
  res.json({...result,notice:'SIMULATED PAYMENT: no charge was made. This sandbox transaction is not a real sale and was not posted to Accounting.'});
}));

router.post('/marketplace/listings', requireRole(...AGENT,'property_owner','super_admin','corporate_business_manager'), h(async (req, res) => {
  const b = ListingIn.parse(req.body);
  const row = await withUser(req.user!, async (c) => {
    const config = await loadMarketplaceConfig(c);
    if (!(config.system.enabled_domains as string[] | undefined)?.includes(b.domain)) throw new HttpError(403, `The ${b.domain} marketplace is currently disabled.`);
    const catalog = config[b.domain === 'services' ? 'services' : 'products']?.categories as {key:string;enabled:boolean}[] | undefined;
    if (!catalog?.some((item) => item.key === b.category_key && item.enabled)) throw new HttpError(422, 'Choose an enabled listing category.');
    if ((b.domain === 'services' && b.transaction_mode !== 'service') || (b.domain !== 'services' && b.transaction_mode === 'service')) throw new HttpError(422, 'Choose a transaction type that matches this listing domain.');
    if ((b.transaction_mode === 'rental') !== Boolean(b.rent_period)) throw new HttpError(422, 'Choose a rental period for rental listings only.');
    let sellerId = req.user!.id;
    let sellerRole = req.user!.role;
    if (isPlatformAdminRole(req.user!.role) || req.user!.role === 'corporate_business_manager') {
      if (!b.seller_user_id) throw new HttpError(422, 'Select the seller this listing represents.');
      const seller = (await c.query("SELECT id,role FROM users WHERE id=$1 AND active=true AND role IN ('master_agent','field_agent','property_owner')", [b.seller_user_id])).rows[0];
      if (!seller) throw new HttpError(422, 'Select an active agent or seller account.');
      sellerId = seller.id; sellerRole = seller.role;
    } else if (b.seller_user_id && b.seller_user_id !== req.user!.id) {
      throw new HttpError(403, 'You can create listings only for your own account.');
    }
    if (!['master_agent','field_agent','property_owner'].includes(sellerRole)) throw new HttpError(403, 'This account cannot own marketplace listings.');
    const sourceAgentId = ['master_agent','field_agent'].includes(sellerRole) ? sellerId : null;
    const status = 'draft';
    const result = await c.query(
      `INSERT INTO marketplace_listings (seller_user_id,source_agent_id,created_by,domain,category_key,title,description,transaction_mode,price,rent_period,condition,territory_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [sellerId,sourceAgentId,req.user!.id,b.domain,b.category_key,b.title,b.description,b.transaction_mode,b.price ?? null,b.rent_period ?? null,b.condition ?? null,b.territory_id],
    );
    await audit(c,req.user!.id,'marketplace_listing_created','marketplace_listing',result.rows[0].id,null,{domain:b.domain,category_key:b.category_key,status});
    return result.rows[0];
  });
  res.status(201).json(row);
}));

router.post('/marketplace/listings/:id/media/upload', requireRole(...AGENT,'property_owner','super_admin','corporate_business_manager'), express.raw({type:()=>true,limit:'100mb'}), h(async (req,res) => {
  const caption = z.string().trim().max(300).optional().parse(req.query.caption) ?? '';
  const file = req.body as Buffer;
  if (!Buffer.isBuffer(file) || file.length===0) throw new HttpError(400,'Choose a picture or video to upload.');
  const mime = sniffListingMedia(file);
  if (!mime) throw new HttpError(415,'Only JPEG/PNG pictures and MP4/WebM videos are accepted.');
  const result = await withUser(req.user!, async (c) => {
    const listing = (await c.query('SELECT id,status FROM marketplace_listings WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if (!listing) throw new HttpError(404,'Listing not found.');
    if (!['draft','rejected'].includes(listing.status)) throw new HttpError(409,'Media can be changed while the listing is a draft or needs changes.');
    const config = await loadMarketplaceConfig(c);
    const limit = Number(mime.startsWith('image/') ? config.system.image_max_bytes : config.system.video_max_bytes);
    if (file.length>limit) throw new HttpError(413,`This file exceeds the configured ${mime.startsWith('image/')?'image':'video'} size limit.`);
    if (!isClamAvConfigured()) throw new HttpError(503,'Marketplace media upload is unavailable until the malware scanner is configured.');
    let scanResult: 'clean' | 'infected';
    try {
      scanResult = await scanWithClamAv(file);
    } catch (error) {
      console.error('Marketplace listing media malware scan failed', error instanceof Error ? error.message : error);
      throw new HttpError(503,'Marketplace media upload is unavailable because the malware scan could not be completed.');
    }
    if (scanResult !== 'clean') throw new HttpError(422,'The marketplace media file was rejected by the malware scanner.');
    const count = Number((await c.query('SELECT count(*)::int AS count FROM marketplace_media WHERE listing_id=$1',[listing.id])).rows[0].count);
    if (count>=Number(config.system.max_media_per_listing)) throw new HttpError(409,'This listing has reached its configured media limit.');
    const key = randomUUID();
    const sha = createHash('sha256').update(file).digest('hex');
    const saved = (await c.query(
      `INSERT INTO marketplace_media (listing_id,storage_key,sha256,mime,size_bytes,caption,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,mime,size_bytes,caption,created_at`,
      [listing.id,key,sha,mime,file.length,caption,req.user!.id],
    )).rows[0];
    await putFile(key,file);
    await audit(c,req.user!.id,'marketplace_media_uploaded','marketplace_listing',listing.id,null,{media_id:saved.id,mime,size_bytes:file.length});
    return saved;
  });
  res.status(201).json(result);
}));

router.get('/marketplace/media/:id/file', h(async (req,res) => {
  const media = await withUser(req.user!,async (c)=>(await c.query('SELECT storage_key,mime FROM marketplace_media WHERE id=$1',[req.params.id])).rows[0]);
  if(!media) throw new HttpError(404,'Listing media not found.');
  const file=await getFile(media.storage_key);
  res.set({'Content-Type':media.mime,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).send(file);
}));

router.post('/marketplace/listings/:id/submit', requireRole(...AGENT,'property_owner','super_admin','corporate_business_manager'), h(async(req,res)=>{
  const updated=await withUser(req.user!,async(c)=>{
    const listing=(await c.query('SELECT * FROM marketplace_listings WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!listing) throw new HttpError(404,'Listing not found.');
    if(!['draft','rejected'].includes(listing.status)) throw new HttpError(409,`This listing is ${listing.status}.`);
    const image=(await c.query("SELECT 1 FROM marketplace_media WHERE listing_id=$1 AND mime LIKE 'image/%' LIMIT 1",[listing.id])).rowCount;
    if(!image) throw new HttpError(422,'Add at least one listing picture before posting.');
    const config=await loadMarketplaceConfig(c);
    const status=config.system.moderation_required===true?'pending_review':'published';
    const row=(await c.query('UPDATE marketplace_listings SET status=$2,updated_at=now(),review_note=NULL WHERE id=$1 RETURNING *',[listing.id,status])).rows[0];
    await audit(c,req.user!.id,'marketplace_listing_submitted','marketplace_listing',listing.id,{status:listing.status},{status});
    return row;
  });
  res.json(updated);
}));

router.patch('/marketplace/listings/:id/review', requireRole('super_admin','corporate_business_manager'), h(async(req,res)=>{
  const b=z.object({decision:z.enum(['publish','reject']),note:z.string().trim().max(1000).optional()}).strict().parse(req.body);
  const row=await withUser(req.user!,async(c)=>{
    const listing=(await c.query('SELECT * FROM marketplace_listings WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!listing || listing.status!=='pending_review') throw new HttpError(409,'Listing is not awaiting review.');
    if(listing.created_by===req.user!.id) throw new HttpError(403,'A different manager must review your listing.');
    if(b.decision==='reject' && (!b.note || b.note.length<10)) throw new HttpError(422,'Provide a reason of at least 10 characters when returning a listing.');
    const status=b.decision==='publish'?'published':'rejected';
    const updated=(await c.query('UPDATE marketplace_listings SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[listing.id,status,b.note??null,req.user!.id])).rows[0];
    await audit(c,req.user!.id,'marketplace_listing_'+b.decision,'marketplace_listing',listing.id,{status:listing.status},{status,note:b.note??null});
    return updated;
  });
  res.json(row);
}));
