ALTER TABLE commission_events
  ADD COLUMN held_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (held_amount >= 0 AND held_amount <= amount),
  ADD COLUMN holdback_release_on date,
  ADD COLUMN held_status text NOT NULL DEFAULT 'none' CHECK (held_status IN ('none','held','released')),
  ADD COLUMN held_paid_ref text;

ALTER TABLE commission_events
  ADD CONSTRAINT commission_holdback_state_check
  CHECK (
    (held_amount = 0 AND held_status = 'none' AND holdback_release_on IS NULL AND held_paid_ref IS NULL)
    OR (held_amount > 0 AND holdback_release_on IS NOT NULL
        AND ((held_status = 'held' AND held_paid_ref IS NULL)
          OR (held_status = 'released' AND held_paid_ref IS NOT NULL)))
  );

INSERT INTO config_rules (key, value) VALUES
  ('commission_holdback_pct', 0),
  ('commission_holdback_days', 0)
ON CONFLICT (key) DO NOTHING;
