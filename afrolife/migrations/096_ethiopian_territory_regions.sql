DO $$
DECLARE
  ethiopia_id integer;
BEGIN
  SELECT id INTO ethiopia_id
  FROM territories
  WHERE parent_id IS NULL
    AND level = 'country'
    AND name = 'Ethiopia';

  IF ethiopia_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed Ethiopian regions: the Ethiopia country territory is missing';
  END IF;

  INSERT INTO territories (parent_id, level, name)
  SELECT ethiopia_id, 'region', region.name
  FROM (VALUES
    ('Afar'),
    ('Amhara'),
    ('Benishangul-Gumuz'),
    ('Central Ethiopia'),
    ('Dire Dawa'),
    ('Gambela'),
    ('Harari'),
    ('Oromia'),
    ('Sidama'),
    ('Somali'),
    ('South Ethiopia'),
    ('Southwest Ethiopia Peoples'),
    ('Tigray')
  ) AS region(name)
  ON CONFLICT (parent_id, name) DO NOTHING;
END
$$;
