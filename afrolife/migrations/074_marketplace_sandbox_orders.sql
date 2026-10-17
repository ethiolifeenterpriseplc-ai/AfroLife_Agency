CREATE TABLE marketplace_sandbox_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES users(id),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id),
  seller_user_id uuid NOT NULL REFERENCES users(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price > 0),
  currency text NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  total numeric(16,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  status text NOT NULL DEFAULT 'pending_sandbox_payment' CHECK (status IN ('pending_sandbox_payment','sandbox_paid','cancelled')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (buyer_user_id,idempotency_key),
  CHECK ((status='sandbox_paid') = (paid_at IS NOT NULL)),
  CHECK ((status='sandbox_paid') = (payment_reference IS NOT NULL))
);
CREATE INDEX marketplace_sandbox_orders_buyer_idx ON marketplace_sandbox_orders(buyer_user_id,created_at DESC);
ALTER TABLE marketplace_sandbox_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_sandbox_orders_read ON marketplace_sandbox_orders FOR SELECT
  USING (buyer_user_id=app_user_id() OR seller_user_id=app_user_id() OR app_is_staff());
CREATE POLICY marketplace_sandbox_orders_create ON marketplace_sandbox_orders FOR INSERT
  WITH CHECK (buyer_user_id=app_user_id() AND app_role()='customer');
CREATE POLICY marketplace_sandbox_orders_update ON marketplace_sandbox_orders FOR UPDATE
  USING (buyer_user_id=app_user_id() AND app_role()='customer')
  WITH CHECK (buyer_user_id=app_user_id() AND app_role()='customer');
