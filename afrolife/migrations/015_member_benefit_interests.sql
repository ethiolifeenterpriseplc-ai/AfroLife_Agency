ALTER TABLE user_signups
  ADD COLUMN pension_match_interest boolean NOT NULL DEFAULT false,
  ADD COLUMN edir_member_interest boolean NOT NULL DEFAULT false,
  ADD COLUMN edir_life_interest boolean NOT NULL DEFAULT false,
  ADD COLUMN household_cover_interest boolean NOT NULL DEFAULT false;
