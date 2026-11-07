-- Exercise the shared trigger without requiring catalogue fixtures.
BEGIN;

CREATE TEMP TABLE city_link_review_fixture (
  test_case text PRIMARY KEY,
  city_id uuid,
  review_status text
) ON COMMIT DROP;

CREATE TRIGGER city_link_review_fixture_approve
BEFORE UPDATE OF city_id ON city_link_review_fixture
FOR EACH ROW WHEN (NEW.city_id IS NOT NULL)
EXECUTE FUNCTION public.auto_approve_on_city_link();

INSERT INTO city_link_review_fixture VALUES
  ('first pending link', NULL, 'pending'),
  ('legacy null status', NULL, NULL),
  ('pending relink', 'aaaaaaaa-0000-0000-0000-000000000000', 'pending'),
  ('unchanged link', 'bbbbbbbb-0000-0000-0000-000000000000', 'pending'),
  ('manual verification', 'aaaaaaaa-0000-0000-0000-000000000000', 'manually_verified'),
  ('archived', 'aaaaaaaa-0000-0000-0000-000000000000', 'archived'),
  ('rejected', 'aaaaaaaa-0000-0000-0000-000000000000', 'rejected'),
  ('explicit status', 'aaaaaaaa-0000-0000-0000-000000000000', 'pending');

UPDATE city_link_review_fixture
SET city_id = 'bbbbbbbb-0000-0000-0000-000000000000',
    review_status = CASE WHEN test_case = 'explicit status' THEN 'manually_verified' ELSE review_status END;

DO $test$
DECLARE
  failed_case text;
BEGIN
  SELECT f.test_case INTO failed_case
  FROM city_link_review_fixture f
  JOIN (VALUES
    ('first pending link', 'approved'),
    ('legacy null status', 'approved'),
    ('pending relink', 'approved'),
    ('unchanged link', 'pending'),
    ('manual verification', 'manually_verified'),
    ('archived', 'archived'),
    ('rejected', 'rejected'),
    ('explicit status', 'manually_verified')
  ) AS expected(test_case, review_status) USING (test_case)
  WHERE f.review_status IS DISTINCT FROM expected.review_status
  ORDER BY f.test_case
  LIMIT 1;

  IF failed_case IS NOT NULL THEN
    RAISE EXCEPTION 'City-link review trigger failed fixture: %', failed_case;
  END IF;
END;
$test$;

ROLLBACK;
