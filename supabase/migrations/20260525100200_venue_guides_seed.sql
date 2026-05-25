-- Seed two starter venue guides for /venues/guides bring-up.

INSERT INTO public.venue_guides
  (slug, title, dek, intro_md, category, city_id, audience_tags, status, published_at, is_featured, reading_time_min)
VALUES
  (
    'berlin-queer-nightlife-starter',
    'Berlin queer nightlife: 5 to start with',
    'A short list for your first Berlin weekend. No rankings — these are starting points.',
    E'Berlin doesn''t have one queer scene. It has a dozen, and they barely talk to each other. This guide is the smallest list that gets you through your first weekend without wasting a night.\n\nDress codes are loose, lines are long, doors are notoriously selective. Bring cash, bring a friend, leave the camera at home.',
    'bar',
    '5761c6c4-3ed6-4429-832b-025e508db544',
    ARRAY['nightlife','first_visit','techno']::text[],
    'published', now(), true, 5
  ),
  (
    'berlin-gay-saunas-2026',
    'Berlin gay saunas: where to go right now',
    'Two saunas worth your time. We''ll add more as the scene shifts.',
    E'The Berlin sauna scene is smaller than the bar one — most of the action happens at two places, both in Kreuzberg-adjacent neighborhoods. This guide is intentionally short: a sauna isn''t a place to comparison-shop, it''s a place to know what you''re walking into.\n\nBring flip-flops, water, and patience. Cash usually required at the door.',
    'sauna',
    '5761c6c4-3ed6-4429-832b-025e508db544',
    ARRAY['nightlife','sauna','adult']::text[],
    'published', now() - interval '2 days', false, 3
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.venue_guide_picks (guide_id, venue_id, tier, rationale_md, pros, cons, position)
SELECT g.id, p.venue_id, p.tier, p.rationale, p.pros, p.cons, p.pos
FROM public.venue_guides g
CROSS JOIN LATERAL (VALUES
  ('1eda4bee-653b-4d0e-939d-a62fe11aff31'::uuid, 'top',        'The Berghain bar (street-level, not the techno cathedral upstairs) is where most queer Berliners actually start their night. Door''s easier than the famous Berghain proper. Open late, no phones inside.', ARRAY['Easy door vs. the upstairs club','Open until 8am Sat/Sun','Cash only — Berlin classic'], ARRAY['Can fill up after midnight','No phones rule strictly enforced'], 0),
  ('cda36e02-68b1-486a-b786-771ce5ff661a'::uuid, 'upgrade',    'If you''re going for the upstairs (Berghain & Panorama Bar), don''t make it your first night. Plan around it: nap before, eat heavy, dress simply.', ARRAY['Iconic, world-class sound system','24h+ weekends'], ARRAY['Notorious door — be prepared','Long queues (4+ hours typical)'], 1),
  ('714cbbcf-92f3-4e6f-bacd-4a73bdb0b3a2'::uuid, 'also_great', 'SchwuZ is Berlin''s longest-running gay club, friendlier door, multiple floors, more pop and queer-tinged music vs. Berghain''s purist techno. Best for first-timers.', ARRAY['Friendliest door of the lineup','Multiple music rooms','Long-running queer institution'], ARRAY['Less of an "only here" experience'], 2),
  ('034a16c3-5c50-4397-a25d-f36cbce8b828'::uuid, 'also_great', 'About Blank is the outdoor-garden-meets-warehouse crowd. Strong leftist-queer politics, good party crew, summer Sundays are the move.', ARRAY['Outdoor garden in summer','Politically explicit queer space'], ARRAY['Limited capacity','Sometimes private events'], 3),
  ('debef524-4e69-41a0-b59b-9b8187048e45'::uuid, 'budget',     '808 Club is the small-bills option — lower door, smaller crowd, easier conversations. Good first/last stop on a longer crawl.', ARRAY['Affordable cover','Manageable scale'], ARRAY['Doesn''t go as late','Smaller crowd = harder if you don''t click with it'], 4)
) AS p(venue_id, tier, rationale, pros, cons, pos)
WHERE g.slug = 'berlin-queer-nightlife-starter'
ON CONFLICT (guide_id, venue_id) DO NOTHING;

INSERT INTO public.venue_guide_picks (guide_id, venue_id, tier, rationale_md, pros, cons, position)
SELECT g.id, p.venue_id, p.tier, p.rationale, p.pros, p.cons, p.pos
FROM public.venue_guides g
CROSS JOIN LATERAL (VALUES
  ('ba024b8f-d582-47f1-8ccc-0ab95718747f'::uuid, 'top',        'Boiler is the busier of the two, fuller most nights, with the cleanest facilities. Best entry point if it''s your first Berlin sauna visit.', ARRAY['Well-maintained facilities','Reliably busy most nights','Easy walk from U-Bahn'], ARRAY['Can feel crowded on weekends','Cash only at the door'], 0),
  ('804ca587-74eb-4533-9e85-4190ff4362e4'::uuid, 'also_great', 'Der Boiler is the smaller, more relaxed sibling. Quieter crowd, slower pace, better for sauna-first / cruising-second visits.', ARRAY['Calmer atmosphere','Better dry-sauna setup'], ARRAY['Less consistent crowd density','Limited weeknight hours'], 1)
) AS p(venue_id, tier, rationale, pros, cons, pos)
WHERE g.slug = 'berlin-gay-saunas-2026'
ON CONFLICT (guide_id, venue_id) DO NOTHING;

UPDATE public.venue_guides
   SET hero_image_path = 'https://fastly.4sqi.net/img/general/300x300/98492_jW9VE-3MOXquS21LPYEQA9aJfRZXFxD3PEsFMGIv3T4.jpg'
 WHERE slug = 'berlin-queer-nightlife-starter';
