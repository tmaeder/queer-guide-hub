-- Followup to milestone Phase 9 — seasonal missions catalog.
--
-- compute_user_missions already respects mission_definitions.starts_at /
-- ends_at, so seeding additional rows with date windows is the entire
-- change. No code edits needed; MissionsRow surfaces them automatically.
--
-- Dates use UTC. Adjust the per-region windows as needed; the LGBTQ+
-- calendar varies by country so these defaults lean on dates everyone
-- recognises (Pride Month, TDoV, Trans Awareness Week).

INSERT INTO public.mission_definitions
  (slug, title, description, domain, criteria, points_reward, period, starts_at, ends_at, sort_order) VALUES
  ('seasonal-pride-2026-checkin',
     'Pride 2026: 5 checkins',
     'Check in at five venues during Pride Month.',
     'venue',
     '{"kind":"count_events","event_type":"venue.checkin","target":5,"period":"season","distinct_target":true}'::jsonb,
     60, 'seasonal',
     '2026-06-01 00:00:00+00'::timestamptz, '2026-07-01 00:00:00+00'::timestamptz, 5),

  ('seasonal-pride-2026-event',
     'Pride 2026: RSVP to an event',
     'Mark yourself going to a Pride event this June.',
     'event',
     '{"kind":"count_events","event_type":"event.rsvp","target":1,"period":"season"}'::jsonb,
     30, 'seasonal',
     '2026-06-01 00:00:00+00'::timestamptz, '2026-07-01 00:00:00+00'::timestamptz, 6),

  ('seasonal-tdov-2027',
     'Trans Day of Visibility: read a story',
     'Read a guide or news story tagged trans this week.',
     'marketplace',
     '{"kind":"count_events","event_type":"marketplace.guide_completed","target":1,"period":"week"}'::jsonb,
     20, 'seasonal',
     '2027-03-25 00:00:00+00'::timestamptz, '2027-04-08 00:00:00+00'::timestamptz, 7),

  ('seasonal-trans-awareness-week-2026',
     'Trans Awareness Week: support queer-owned',
     'Save a marketplace listing during Trans Awareness Week.',
     'marketplace',
     '{"kind":"count_events","event_type":"marketplace.favorite_added","target":1,"period":"week"}'::jsonb,
     15, 'seasonal',
     '2026-11-13 00:00:00+00'::timestamptz, '2026-11-20 00:00:00+00'::timestamptz, 8)
ON CONFLICT (slug) DO UPDATE SET
  title=EXCLUDED.title,
  description=EXCLUDED.description,
  domain=EXCLUDED.domain,
  criteria=EXCLUDED.criteria,
  points_reward=EXCLUDED.points_reward,
  period=EXCLUDED.period,
  starts_at=EXCLUDED.starts_at,
  ends_at=EXCLUDED.ends_at,
  sort_order=EXCLUDED.sort_order,
  active=true;
