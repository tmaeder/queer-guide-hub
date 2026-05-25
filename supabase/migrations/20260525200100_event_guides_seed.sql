-- Seed one starter event guide for /events/guides bring-up.

INSERT INTO public.event_guides
  (slug, title, dek, intro_md, event_type, city_id, audience_tags, status, published_at, is_featured, reading_time_min, review_due_at)
VALUES (
  'berlin-pride-circuit-2026',
  'Berlin Pride circuit 2026: how to do CSD week',
  'Five days, three parties, one parade — a survival plan, not a FOMO list.',
  E'Berlin Pride weekend (CSD, July 18–24) is one of the biggest queer weeks in Europe — and one of the easiest to over-plan into a blur. This guide picks five anchor events spread across the week so you actually sleep between them.\n\nMost things are free or low-cover. Cash for the door, water in the bag, and pace yourself: the canal pride on the 23rd is brutal in the sun.',
  'pride',
  '5761c6c4-3ed6-4429-832b-025e508db544',
  ARRAY['pride','nightlife','summer','first_visit']::text[],
  'published',
  now(),
  true,
  4,
  '2026-07-25 00:00:00+00'::timestamptz
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.event_guide_picks (guide_id, event_id, tier, rationale_md, pros, cons, position)
SELECT g.id, p.event_id, p.tier, p.rationale, p.pros, p.cons, p.pos
FROM public.event_guides g
CROSS JOIN LATERAL (VALUES
  ('28a4ca12-1857-45ca-9304-04235a5e7991'::uuid, 'top',        'Berlin Gay Pride (CSD parade, July 18) is the anchor of the week. Show up at Nollendorfplatz a few hours before the parade leaves — that''s where the floats stage and the best people-watching is. Bring sunscreen, even if it''s overcast.', ARRAY['Free + open to everyone','Floats from major queer orgs + activist groups','Easy to peel off when overwhelmed'], ARRAY['Brutal sun and crowds if you stay all day','Limited public toilets along the route'], 0),
  ('b264433d-8722-47ed-845b-d0419851ca55'::uuid, 'also_great', 'CSD auf der Spree (Canal Pride, July 23) is the lower-key sister event — boats on the river instead of floats on the street. Smaller crowd, better photos, and you actually get to talk to people.', ARRAY['Smaller crowd vs. main parade','Photo-friendly riverside vantage points'], ARRAY['Limited to people on or near the canal','Earlier end time'], 1),
  ('8ceee7ae-56ad-4434-86f3-ec5c99a3c73a'::uuid, 'also_great', 'Stadtfest Berlin (July 18) is the daytime street party around Nollendorfplatz right after the parade. Food stalls, beer gardens, drag stages. The natural place to land before the night kicks in.', ARRAY['Right next to the parade end','Affordable food + drink','Family-friendly afternoon'], ARRAY['Gets very crowded after 6pm','Stages can be hit-or-miss'], 2),
  ('d09e2104-4618-4351-ad48-435ae547d8a5'::uuid, 'upgrade',    'Revolver Berlin Pride Festival (July 24) is the bigger-production indoor party of the week — international DJs, dressed-up crowd, harder door. Treat it like a destination night, not a drop-in.', ARRAY['Best production of any Pride party','International DJ bookings'], ARRAY['Pricier door','More stylized crowd — dress up or don''t bother'], 3),
  ('2a06c4c3-a2a7-4517-a66a-4a9dc7fa7a86'::uuid, 'budget',     'Hafenparty (Canal Pride Afterparty, July 23) is the easy way to keep the canal day going into the night. Cheap door, friendly crowd, music decent without being a destination.', ARRAY['Cheapest cover of any Pride-week party','Friendly door — easiest entry of the week'], ARRAY['Doesn''t go as late','Smaller production than Revolver'], 4)
) AS p(event_id, tier, rationale, pros, cons, pos)
WHERE g.slug = 'berlin-pride-circuit-2026'
ON CONFLICT (guide_id, event_id) DO NOTHING;
