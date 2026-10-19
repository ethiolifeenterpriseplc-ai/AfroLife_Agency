-- Accounting & Finance follows the shared mini-app subscription lifecycle.
-- Keep the platform's published flat monthly fee and payment review controls.
ALTER TABLE platform_service_subscriptions
  DROP CONSTRAINT platform_service_subscriptions_service_key_check;

ALTER TABLE platform_service_subscriptions
  ADD CONSTRAINT platform_service_subscriptions_service_key_check
  CHECK (service_key IN (
    'accounting','property_management','workforce_management','super_agent','edir',
    'insurance_brokerage','agent','landlord','seller'
  ));

INSERT INTO platform_services(service_key,display_name,description)
VALUES(
  'accounting',
  'Accounting & Finance',
  'Standalone subscriber Accounting & Finance mini-app for general ledger, financial operations, approvals, and reporting. Service-specific financial workflows remain within their respective mini-apps; shared AfroLife features remain available across the platform.'
)
ON CONFLICT(service_key) DO UPDATE
SET display_name=EXCLUDED.display_name,
    description=EXCLUDED.description,
    available=true,
    updated_at=now();
