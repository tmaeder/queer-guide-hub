-- Seed 3 starter marketplace guides for Phase 3 frontend bring-up.
-- See docs/plans/2026-05-24-marketplace-redesign.md §2 (Phase 2 seed).
-- Real admin authoring tool lands in a later phase; this is just enough
-- content to validate the personalized index + guide detail page.

-- Idempotent: ON CONFLICT (slug) DO NOTHING so re-applying is safe.

INSERT INTO public.marketplace_guides
  (slug, title, dek, intro_md, category_slug, audience_tags, status, published_at, is_featured, reading_time_min)
VALUES
  (
    'pride-briefs-queer-owned-underwear-2026',
    'Pride briefs: 5 queer-owned underwear picks under $40',
    'Comfortable, cheeky, and made by people who actually wear them.',
    E'Underwear is the most intimate thing on your body, so it should come from people who actually care. Super Gay Underwear has been a quiet standout for years — small queer-owned shop, no big-brand markups, real bodies on the model shots, and a fit that doesn''t cosplay heteronormative ideas of what "men''s briefs" should look like.\n\nWe picked five styles you can wear day-to-day, with one top pick, one budget option, and one upgrade for special occasions. None are sponsored.',
    'products',
    ARRAY['queer_owned','everyday','under_50']::text[],
    'published',
    now(),
    true,
    4
  ),
  (
    'lgbtq-services-that-get-it',
    'LGBTQ+ services: three that actually get it',
    'A planner, a trainer, a therapist — when the service-provider being affirming is the whole point.',
    E'"LGBTQ+ friendly" is a low bar. We wanted services where the queerness is structural, not garnish — a wedding planner who has done a hundred non-binary ceremonies, a fitness coach who actually understands top surgery recovery, a therapist whose intake form doesn''t make you wince.\n\nThree picks, each in a different price band. Use them as a starting point for finding the same shape of provider in your city.',
    'services',
    ARRAY['mental_health','wellness','wedding']::text[],
    'published',
    now() - interval '3 days',
    false,
    5
  ),
  (
    'trans-affirming-gear-2026',
    'Trans-affirming gear: our 2026 picks',
    'Binders, packers, and the small things that make the day easier.',
    E'Gear that affirms your body should feel like a quiet utility, not an event. We focused on products that have been around long enough to have real reviews, from brands that don''t make this their whole personality.\n\nThis guide is one we update twice a year as sizing, materials, and shipping availability shift. Last updated May 2026.',
    'products',
    ARRAY['trans','gender_affirming','everyday']::text[],
    'published',
    now() - interval '7 days',
    false,
    6
  )
ON CONFLICT (slug) DO NOTHING;

-- Picks for "Pride briefs" (Super Gay Underwear curation)
INSERT INTO public.marketplace_guide_picks
  (guide_id, listing_id, tier, rationale_md, pros, cons, position)
SELECT g.id, p.listing_id, p.tier, p.rationale, p.pros, p.cons, p.pos
FROM public.marketplace_guides g
CROSS JOIN LATERAL (VALUES
  ('57bc2e48-f9fa-4662-a0ec-1776b4473a2b'::uuid, 'top',        'The one we''d buy first. The Emari sits perfectly without a waistband dig, and Super Gay''s mid-rise cut is the most universally flattering thing they make.', ARRAY['No waistband bite','Soft modal blend','Sized inclusively to 4XL'], ARRAY['Sells out fast — colourways come and go'], 0),
  ('4d39b4d2-6d88-4fe2-9dc4-9679a41c44e1'::uuid, 'budget',     'The Harvey is the cheapest in the lineup and still feels nothing like fast fashion. Best as a 3-pack restock.', ARRAY['$18 keeps it accessible','Holds shape in the wash'], ARRAY['Less plush than The Emari','Plainer cut'], 1),
  ('134f9274-67e6-4ad8-ad8f-9d282bd04582'::uuid, 'also_great', 'The Eddie is the same body as The Emari but in a higher rise — pick this if you ever wear it under tucked shirts.', ARRAY['Higher rise','Same fabric as our top pick'], ARRAY['$31 starts to feel premium-priced for what it is'], 2),
  ('b418fb3e-cea9-45cf-9422-47860257c971'::uuid, 'upgrade',    'The Felix is the "going somewhere" pair — slightly more shaped front pouch, sturdier stitching at the legs. Save them for occasions.', ARRAY['Best support of the lineup','Most photographed style'], ARRAY['Definitely a special-occasion buy at $31'], 3),
  ('8a98e535-ef3c-4561-9396-d777ca040544'::uuid, 'also_great', 'The Justin is the lightest, breeziest pair Super Gay makes — closer to a brief than a trunk. Summer-only for most.', ARRAY['Coolest fabric in the lineup','Cheapest in the brand at $17'], ARRAY['Not much coverage','Some find the cut too minimal'], 4)
) AS p(listing_id, tier, rationale, pros, cons, pos)
WHERE g.slug = 'pride-briefs-queer-owned-underwear-2026'
ON CONFLICT (guide_id, listing_id) DO NOTHING;

-- Picks for "LGBTQ+ services that get it"
INSERT INTO public.marketplace_guide_picks
  (guide_id, listing_id, tier, rationale_md, pros, cons, position)
SELECT g.id, p.listing_id, p.tier, p.rationale, p.pros, p.cons, p.pos
FROM public.marketplace_guides g
CROSS JOIN LATERAL (VALUES
  ('b4744967-e638-4eec-875b-fd6c50c8a915'::uuid, 'top',     'Safe Space Therapy''s intake doesn''t ask if you''re "comfortable discussing sexuality" — it asks what name your insurance has on file vs. what you want them to call you. That detail tells you everything.', ARRAY['Sliding-scale options','Specialised in trans and queer-affirming therapy','Telehealth available'], ARRAY['Waitlist of 2–4 weeks in busy seasons'], 0),
  ('d07cdec8-ee56-4c08-94e1-2e6fac7d8e27'::uuid, 'also_great', 'A trainer who actually understands top-surgery recovery timelines and HRT''s effect on cardio. The session structure adjusts around it instead of pretending it doesn''t exist.', ARRAY['Post-surgical training experience','Inclusive intake form','Hybrid in-person + remote'], ARRAY['Single-coach availability — book ahead'], 1),
  ('ac194d03-7887-410f-a428-51906c534730'::uuid, 'upgrade', 'Equality Events is the expensive pick — but at $2,500 you get a planner who has run hundreds of LGBTQ+ ceremonies and won''t blink at a non-binary processional or two-bride wedding logistics.', ARRAY['Deep portfolio','Vendor network is pre-vetted for queer-friendliness','Handles destination weddings'], ARRAY['$2,500 starting price','Books out 6+ months ahead'], 2)
) AS p(listing_id, tier, rationale, pros, cons, pos)
WHERE g.slug = 'lgbtq-services-that-get-it'
ON CONFLICT (guide_id, listing_id) DO NOTHING;

-- Picks for "Trans-affirming gear"
INSERT INTO public.marketplace_guide_picks
  (guide_id, listing_id, tier, rationale_md, pros, cons, position)
SELECT g.id, p.listing_id, p.tier, p.rationale, p.pros, p.cons, p.pos
FROM public.marketplace_guides g
CROSS JOIN LATERAL (VALUES
  ('22e70c92-70a0-44f0-8982-7385d952dd94'::uuid, 'top',        'Affirm Apparel''s binder hits the rare combo: medical-grade compression, breathable fabric, and a return policy that actually accommodates "I sized down by mistake". The shoulder strap design also doesn''t roll mid-day.', ARRAY['Medical-grade compression','Breathable in summer','Generous return window'], ARRAY['Only ships within US/CA','Limited colour range'], 0),
  ('3d88180c-76a6-498d-9533-0a6e80235c53'::uuid, 'also_great', 'Mister B''s Packer Gear silicone packer is the European staple — the silicone holds shape after wash, and the 13cm size sits naturally in most jeans.', ARRAY['Realistic weight','Two skin-tone matches','Ships internationally'], ARRAY['No harness included','Skin tones still limited'], 1),
  ('0ccc8a57-2b83-4e14-9527-d9761b3725fe'::uuid, 'budget',     'The Stand To Pee packer at $21 is the cheapest entry point and works as advertised. Not realistic enough to also pack with all day, but a solid second to keep in a travel bag.', ARRAY['Cheapest STP option we''ve tested','Easy to clean'], ARRAY['Less realistic than the dual-purpose packers','Single skin tone'], 2),
  ('f42ac66a-541e-46ec-adce-18378ed6f3fe'::uuid, 'upgrade',    'The Female-to-Male Stroker is the only one in this lineup designed for combined packing + sensation use. Niche, but a meaningful upgrade for the right buyer.', ARRAY['Dual-purpose design','Quality silicone'], ARRAY['Steeper learning curve','Higher price point'], 3)
) AS p(listing_id, tier, rationale, pros, cons, pos)
WHERE g.slug = 'trans-affirming-gear-2026'
ON CONFLICT (guide_id, listing_id) DO NOTHING;
