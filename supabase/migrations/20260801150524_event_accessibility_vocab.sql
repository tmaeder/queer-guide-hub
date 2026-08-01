-- Normalize events.accessibility_attributes onto the shared amenities vocabulary.
--
-- 703 events carried 54 distinct free-text values: synonym splits (step-free /
-- step-free-access / level-access; ramp x4; lift / lift-accessible / elevator-accessible),
-- non-accessibility noise (dog-friendly, pay-what-you-can, standing-room, free-to-attend)
-- and two untranslated Norwegian strings. The canonical vocabulary is
-- public.amenities WHERE kind='accessibility' -- the same list that drives AmenityDisplay
-- and the "matches your needs" badge (src/lib/accessibilityNeeds.ts NEED_TO_SLUGS), so
-- joining events to it makes accessibility-needs matching work for events too.
--
-- LOAD-BEARING INVARIANT: negative assertions are preserved as their own distinct terms
-- and are NEVER collapsed into a positive claim. 'not-wheelchair-accessible' must not
-- become 'wheelchair-accessible'. A wrong access claim strands a disabled person at a
-- door they cannot get through -- this is the same rule that keeps venue accessibility
-- review-gated rather than auto-published.
--
-- Note this deliberately does NOT reuse ACCESSIBILITY_ALIASES from
-- supabase/functions/_shared/amenity-normalize.ts, which folds ramp/elevator/lift into
-- step-free-entrance. A ramp and a lift are different accommodations and a wheelchair
-- user needs to know which one is there, so they get their own terms here.

-- 1. Extend the vocabulary with the accommodations events actually name.
insert into public.amenities (slug, name, icon_name, kind, category_scope, sort_order, is_active)
values
  ('ramp-access',              'Ramp access',                'Accessibility', 'accessibility', array['all'], 690, true),
  ('elevator-access',          'Elevator access',            'ArrowUpDown',   'accessibility', array['all'], 700, true),
  ('accessible-seating',       'Accessible seating',         'Armchair',      'accessibility', array['all'], 710, true),
  ('quiet-space',              'Quiet space',                'VolumeX',       'accessibility', array['all'], 720, true),
  ('relaxed-performance',      'Relaxed performance',        'Sparkles',      'accessibility', array['all'], 730, true),
  ('companion-ticket',         'Free companion ticket',      'Users',         'accessibility', array['all'], 740, true),
  ('sign-language-interpreted','Sign language interpreted',  'Hand',          'accessibility', array['all'], 750, true),
  ('audio-description',        'Audio description',          'AudioLines',    'accessibility', array['all'], 760, true),
  ('captioning',               'Captions or subtitles',      'Captions',      'accessibility', array['all'], 770, true),
  -- Negative assertions. Deliberately first-class vocabulary: "we checked and it is NOT
  -- accessible" is more useful to a disabled traveller than silence, and it must survive
  -- normalization intact.
  ('not-wheelchair-accessible','Not wheelchair accessible',  'Ban',           'accessibility', array['all'], 900, true),
  ('not-step-free',            'Not step-free',              'Ban',           'accessibility', array['all'], 910, true),
  ('no-accessible-restroom',   'No accessible restroom',     'Ban',           'accessibility', array['all'], 920, true)
on conflict (slug) do nothing;

-- 2. Pure mapper. Default-reject: anything not mapped and not already canonical is dropped.
create or replace function public.normalize_event_accessibility(p_raw text[])
returns text[]
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(distinct s order by s), '{}'::text[])
  from (
    select case lower(btrim(t))
      -- negatives first, so no positive rule can ever claim them
      when 'not-wheelchair-accessible'        then 'not-wheelchair-accessible'
      when 'not-step-free'                    then 'not-step-free'
      when 'no-wheelchair-access-to-toilet'   then 'no-accessible-restroom'

      when 'wheelchair-accessible'            then 'wheelchair-accessible'
      when 'wheelchair-accessible-entrance'   then 'wheelchair-accessible'
      when 'rullestolvennlig'                 then 'wheelchair-accessible'  -- no: wheelchair-friendly

      when 'accessible-toilets'               then 'accessible-restroom'
      when 'accessible-toilet'                then 'accessible-restroom'
      when 'accessible-toilet-facilities'     then 'accessible-restroom'
      when 'level-access-toilet'              then 'accessible-restroom'

      when 'step-free'                        then 'step-free-entrance'
      when 'step-free-access'                 then 'step-free-entrance'
      when 'level-access'                     then 'step-free-entrance'
      when 'single-level-flooring'            then 'step-free-entrance'
      when 'ground-floor-accessible'          then 'step-free-entrance'

      when 'ramp'                             then 'ramp-access'
      when 'ramp-available'                   then 'ramp-access'
      when 'ramp-available-on-request'        then 'ramp-access'
      when 'portable-accessibility-ramp'      then 'ramp-access'

      when 'lift'                             then 'elevator-access'
      when 'lift-accessible'                  then 'elevator-access'
      when 'elevator-accessible'              then 'elevator-access'

      when 'accessible-parking-spaces'        then 'accessible-parking'
      when 'accessible-parking'               then 'accessible-parking'

      when 'service-animals-area'             then 'service-animals-welcome'
      when 'service-animals-allowed'          then 'service-animals-welcome'

      when 'gender-neutral-toilets'           then 'gender-neutral-restroom'
      when 'gender-neutral-restrooms'         then 'gender-neutral-restroom'

      when 'asl-interpreted'                  then 'sign-language-interpreted'
      when 'bsl-interpreted'                  then 'sign-language-interpreted'
      when 'deaf-interpreted'                 then 'sign-language-interpreted'
      when 'tegnspråktolk'                    then 'sign-language-interpreted'  -- no: sign language interpreter

      when 'access-audio-description'         then 'audio-description'
      when 'english-subtitles'                then 'captioning'
      when 'complimentary-ticket-for-assistant' then 'companion-ticket'
      when 'accessible-seating'               then 'accessible-seating'
      when 'quiet-space'                      then 'quiet-space'
      when 'relaxed-performance'              then 'relaxed-performance'

      -- Everything else is either seating description (standing-room, movable-seating,
      -- mixed-seating-standing), pricing (pay-what-you-can, free-to-attend), or plain
      -- noise (dog-friendly, all-ages, free-water-refill-stations, none). Dropped.
      else null
    end as s
    from unnest(coalesce(p_raw, '{}'::text[])) as t
  ) m
  where s is not null;
$$;

comment on function public.normalize_event_accessibility(text[]) is
  'Maps free-text event accessibility terms onto public.amenities (kind=accessibility). Default-reject. Negative assertions (not-wheelchair-accessible, not-step-free, no-accessible-restroom) are preserved as distinct terms and never collapsed into a positive claim.';

-- 3. Apply to the 703 affected events, preserving the raw array.
update public.events e
set accessibility_attributes = public.normalize_event_accessibility(e.accessibility_attributes),
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{accessibility_raw}',
      to_jsonb(e.accessibility_attributes), true)
where coalesce(cardinality(e.accessibility_attributes), 0) > 0
  and e.accessibility_attributes
      is distinct from public.normalize_event_accessibility(e.accessibility_attributes);
