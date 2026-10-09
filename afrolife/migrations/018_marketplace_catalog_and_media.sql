-- Extend the existing property workflow without moving or rewriting its current listings.
ALTER TABLE properties
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN listing_mode text NOT NULL DEFAULT 'rent' CHECK (listing_mode IN ('sale','rent','sale_or_rent')),
  ADD COLUMN sale_price numeric(14,2) CHECK (sale_price IS NULL OR sale_price > 0),
  ADD COLUMN rent_period text NOT NULL DEFAULT 'month' CHECK (rent_period IN ('day','week','month','year'));
UPDATE properties SET created_by = COALESCE(source_agent_id, owner_user_id);
ALTER TABLE properties ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE properties DROP CONSTRAINT properties_single_owner_check;
ALTER TABLE properties ADD CONSTRAINT properties_single_owner_check
  CHECK (source_agent_id IS NULL OR owner_user_id IS NULL);

ALTER TABLE property_photos DROP CONSTRAINT property_photos_mime_check;
ALTER TABLE property_photos ADD CONSTRAINT property_photos_mime_check
  CHECK (mime IN ('image/jpeg','image/png','video/mp4','video/webm'));
ALTER TABLE property_photos DROP CONSTRAINT property_photos_size_bytes_check;
ALTER TABLE property_photos ADD CONSTRAINT property_photos_size_bytes_check
  CHECK (size_bytes BETWEEN 1 AND 104857600);

-- Super Admin owns platform settings; Corporate Business Managers own commerce taxonomy.
CREATE TABLE marketplace_configuration (
  scope text NOT NULL CHECK (scope IN ('system','users','products','services','properties','rentals')),
  config_key text NOT NULL,
  config_value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, config_key),
  CHECK (jsonb_typeof(config_value) IN ('array','object','number','string','boolean'))
);

INSERT INTO marketplace_configuration(scope, config_key, config_value) VALUES
  ('system','enabled_domains','["products","services","equipment","properties"]'),
  ('system','moderation_required','true'),
  ('system','image_max_bytes','10485760'),
  ('system','video_max_bytes','52428800'),
  ('system','max_media_per_listing','12'),
  ('users','account_types','[{"key":"worker","label":"Worker","enabled":true},{"key":"customer","label":"Customer","enabled":true},{"key":"agent","label":"Agent","enabled":true},{"key":"property_owner","label":"Seller","enabled":true}]'),
  ('users','kyc_requirements','{"worker":["national_id","police_clearance"],"customer":["national_id"],"agent":["national_id"],"property_owner":["national_id"]}'),
  ('products','categories','[{"key":"electronics","label":"Electronics","enabled":true},{"key":"vehicles","label":"Vehicles","enabled":true},{"key":"furniture","label":"Furniture","enabled":true},{"key":"home_goods","label":"Home goods","enabled":true},{"key":"equipment","label":"Equipment","enabled":true},{"key":"other","label":"Other","enabled":true}]'),
  ('services','categories','[{"key":"cleaning","label":"Cleaning","enabled":true},{"key":"caregiving","label":"Caregiving","enabled":true},{"key":"professional","label":"Professional services","enabled":true},{"key":"transport","label":"Transport","enabled":true},{"key":"other","label":"Other","enabled":true}]'),
  ('properties','property_types','[{"key":"apartment_building","label":"Apartment building","enabled":true},{"key":"house","label":"House","enabled":true},{"key":"commercial","label":"Commercial","enabled":true},{"key":"land","label":"Land","enabled":true}]'),
  ('rentals','periods','[{"key":"day","label":"Per day","enabled":true},{"key":"week","label":"Per week","enabled":true},{"key":"month","label":"Per month","enabled":true},{"key":"year","label":"Per year","enabled":true}]');

CREATE TABLE marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid NOT NULL REFERENCES users(id),
  source_agent_id uuid REFERENCES agents(id),
  created_by uuid NOT NULL REFERENCES users(id),
  domain text NOT NULL CHECK (domain IN ('products','services','equipment')),
  category_key text NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 140),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  transaction_mode text NOT NULL CHECK (transaction_mode IN ('sale','rental','service')),
  price numeric(14,2) CHECK (price IS NULL OR price > 0),
  rent_period text CHECK (rent_period IS NULL OR rent_period IN ('day','week','month','year')),
  condition text CHECK (condition IS NULL OR condition IN ('new','like_new','good','fair','not_applicable')),
  territory_id integer NOT NULL REFERENCES territories(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','rejected','archived')),
  review_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((transaction_mode = 'rental' AND rent_period IS NOT NULL) OR (transaction_mode <> 'rental' AND rent_period IS NULL)),
  CHECK ((domain = 'services' AND transaction_mode = 'service') OR (domain <> 'services' AND transaction_mode IN ('sale','rental')))
);
CREATE INDEX marketplace_listings_public_idx ON marketplace_listings(domain, status, created_at DESC);
CREATE INDEX marketplace_listings_seller_idx ON marketplace_listings(seller_user_id, created_at DESC);

CREATE TABLE marketplace_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','video/mp4','video/webm')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 300),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_media_listing_idx ON marketplace_media(listing_id, created_at);

ALTER TABLE marketplace_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_configuration_read ON marketplace_configuration FOR SELECT USING (true);
CREATE POLICY marketplace_configuration_admin_write ON marketplace_configuration FOR ALL
  USING (app_role() = 'super_admin' OR (app_role() = 'corporate_business_manager' AND scope IN ('products','services','properties','rentals')))
  WITH CHECK (app_role() = 'super_admin' OR (app_role() = 'corporate_business_manager' AND scope IN ('products','services','properties','rentals')));
CREATE POLICY marketplace_listings_read ON marketplace_listings FOR SELECT
  USING (app_is_staff() OR app_role() = 'corporate_business_manager'
    OR seller_user_id = app_user_id() OR app_can_access_agent(source_agent_id)
    OR (app_role() = 'customer' AND status = 'published'));
CREATE POLICY marketplace_listings_write ON marketplace_listings FOR ALL
  USING (app_is_staff() OR app_role() = 'corporate_business_manager'
    OR seller_user_id = app_user_id() OR app_can_access_agent(source_agent_id))
  WITH CHECK (app_is_staff() OR app_role() = 'corporate_business_manager'
    OR (seller_user_id = app_user_id() AND source_agent_id IS NULL AND created_by = app_user_id())
    OR (app_role() IN ('master_agent','field_agent') AND source_agent_id = app_user_id() AND created_by = app_user_id()));
CREATE POLICY marketplace_media_read ON marketplace_media FOR SELECT
  USING (EXISTS (SELECT 1 FROM marketplace_listings l WHERE l.id = listing_id));
CREATE POLICY marketplace_media_write ON marketplace_media FOR ALL
  USING (EXISTS (SELECT 1 FROM marketplace_listings l WHERE l.id = listing_id
    AND (app_is_staff() OR app_role() = 'corporate_business_manager' OR l.seller_user_id = app_user_id() OR app_can_access_agent(l.source_agent_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM marketplace_listings l WHERE l.id = listing_id
    AND (app_is_staff() OR app_role() = 'corporate_business_manager' OR l.seller_user_id = app_user_id() OR app_can_access_agent(l.source_agent_id))));

-- Business Manager visibility/management is explicit; general staff access is not widened.
CREATE POLICY properties_corporate_manager_manage ON properties FOR ALL
  USING (app_role() = 'corporate_business_manager')
  WITH CHECK (app_role() = 'corporate_business_manager');
CREATE POLICY units_corporate_manager_manage ON property_units FOR ALL
  USING (app_role() = 'corporate_business_manager')
  WITH CHECK (app_role() = 'corporate_business_manager');
CREATE POLICY property_photos_corporate_manager_manage ON property_photos FOR ALL
  USING (app_role() = 'corporate_business_manager')
  WITH CHECK (app_role() = 'corporate_business_manager');
CREATE POLICY property_photos_created_by_read ON property_photos FOR SELECT
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.created_by = app_user_id()));
CREATE POLICY property_photos_created_by_write ON property_photos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.created_by = app_user_id()));
