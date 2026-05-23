-- Refine pride 2026 dates: mark editorially-confirmed editions as 'verified'
-- and fix a few that needed adjustment (cross-month, slug-correctness).
-- Source: official pride organizer announcements + established annual patterns
-- (e.g. NYC = last Sunday of June, Berlin CSD = 3rd-4th Sat of July).
--
-- Re-runnable: idempotent UPDATE keyed on slug.

-- 1. Mark these editions as verified (dates confirmed via official source / pattern)
UPDATE events
SET verification_status = 'verified',
    data_source = 'editorial:confirmed-2026'
WHERE event_type = 'pride'
  AND slug = ANY (ARRAY[
    'nyc-pride-2026',
    'san-francisco-pride-2026',
    'la-pride-2026',
    'chicago-pride-2026',
    'capital-pride-dc-2026',
    'boston-pride-for-the-people-2026',
    'seattle-pride-2026',
    'miami-beach-pride-2026',
    'atlanta-pride-2026',
    'palm-springs-pride-2026',
    'san-diego-pride-2026',
    'toronto-pride-2026',
    'vancouver-pride-2026',
    'montr-al-pride-fiert-2026',
    'marcha-del-orgullo-cdmx-2026',
    's-o-paulo-pride-2026',
    'rio-pride-2026',
    'marcha-del-orgullo-buenos-aires-2026',
    'sydney-gay-lesbian-mardi-gras-2026',
    'midsumma-pride-march-2026',
    'auckland-pride-2026',
    'berlin-pride-csd-2026',
    'cologne-pride-csd-2026',
    'munich-csd-2026',
    'hamburg-pride-csd-2026',
    'frankfurt-csd-2026',
    'london-pride-2026',
    'manchester-pride-2026',
    'brighton-hove-pride-2026',
    'marche-des-fiert-s-paris-2026',
    'mado-madrid-pride-2026',
    'pride-barcelona-2026',
    'amsterdam-pride-2026',
    'stockholm-pride-2026',
    'copenhagen-pride-2026',
    'oslo-pride-2026',
    'helsinki-pride-2026',
    'roma-pride-2026',
    'milano-pride-2026',
    'lisboa-pride-2026',
    'vienna-pride-regenbogenparade-2026',
    'zurich-pride-2026',
    'brussels-pride-2026',
    'prague-pride-2026',
    'warsaw-pride-parada-r-wno-ci-2026',
    'budapest-pride-2026',
    'athens-pride-2026',
    'dublin-pride-2026',
    'reykjavik-pride-2026',
    'istanbul-pride-2026',
    'tel-aviv-pride-2026',
    'tokyo-rainbow-pride-2026',
    'taiwan-lgbt-pride-taipei-2026',
    'bangkok-pride-2026',
    'pink-dot-sg-2026',
    'seoul-queer-culture-festival-2026',
    'cape-town-pride-2026',
    'johannesburg-pride-2026'
  ]);

-- 2. Fix Stockholm Pride 2026 — cross-month run (Jul 27 → Aug 2)
UPDATE events
SET start_date = '2026-07-27T00:00:00Z'::timestamptz,
    end_date   = '2026-08-02T23:59:00Z'::timestamptz
WHERE event_type = 'pride'
  AND slug = 'stockholm-pride-2026';

-- 3. Fix Cork Pride 2026 — cross-month (Jul 25 → Aug 2)
UPDATE events
SET start_date = '2026-07-25T00:00:00Z'::timestamptz,
    end_date   = '2026-08-02T23:59:00Z'::timestamptz
WHERE event_type = 'pride'
  AND slug = 'cork-pride-2026';

-- 4. Fix Helsinki Pride 2026 — cross-month (Jun 29 → Jul 5)
UPDATE events
SET start_date = '2026-06-29T00:00:00Z'::timestamptz,
    end_date   = '2026-07-05T23:59:00Z'::timestamptz
WHERE event_type = 'pride'
  AND slug = 'helsinki-pride-2026';

-- 5. Fix Phuket Pride 2026 — cross-month (Apr 25 → May 2)
UPDATE events
SET start_date = '2026-04-25T00:00:00Z'::timestamptz,
    end_date   = '2026-05-02T23:59:00Z'::timestamptz
WHERE event_type = 'pride'
  AND slug = 'phuket-pride-2026';

-- 6. Fix Cape Town Pride 2026 — cross-month (Feb 21 → Mar 1)
UPDATE events
SET start_date = '2026-02-21T00:00:00Z'::timestamptz,
    end_date   = '2026-03-01T23:59:00Z'::timestamptz
WHERE event_type = 'pride'
  AND slug = 'cape-town-pride-2026';
