-- Two practices the STI grid was missing, and only the cells that can be
-- anchored to a cell already in it.
--
-- WHERE THIS COMES FROM
--
-- The drgay.ch coverage audit (docs/audits/2026-08-29-drgay-tag-coverage.md)
-- measured their practice grid against `sti_practices` and found five practices
-- with no counterpart: masturbating, BDSM, piss play, scat, body modifications.
-- This adds TWO of them. The other three are deliberately still absent — see the
-- bottom of this header, the reason is structural, not laziness.
--
-- THE CALIBRATION IS COPIED, NOT INVENTED
--
-- `sti_transmission_risks` is SPARSE BY DESIGN: 83 of a possible 121 cells. A
-- missing cell is how the table says "no meaningful risk by this route" —
-- `hiv` is absent from `kissing`, `sexual-caress` and `rimming` for exactly
-- that reason. So a cell is only written here where an EXISTING cell in the
-- same transmission mode fixes the level. Nothing is graded on my own scale:
--
--   mutual-masturbation  is skin-to-skin genital contact  -> anchor sexual-caress
--   scat                 is faecal-oral                   -> anchor rimming
--
-- Anchors read off prod before writing:
--   sexual-caress  genital-herpes medium · genital-warts medium · mpox high
--   kissing        syphilis low · mpox medium
--   rimming        hepatitis-a high · shigella high · hepatitis-b low
--
-- WHAT IS OMITTED, AND WHY THAT IS THE SAFE DIRECTION
--
-- HIV is omitted from BOTH practices. Neither route delivers virus to a mucous
-- membrane: hands are not an inoculation site, and faeces is not an HIV
-- vehicle. `kissing`, `sexual-caress` and `rimming` all omit HIV on the same
-- reasoning, so this follows the table rather than departing from it.
-- Gonorrhoea and chlamydia are omitted from mutual-masturbation for the same
-- reason — they need mucosal inoculation.
--
-- Omission is the conservative choice here in the direction that matters: it
-- declines to make a claim, where a guessed "low" would make one. If any of
-- these later warrants a cell, adding it is a one-row migration.
--
-- WHY ONLY TWO OF THE FIVE
--
-- `sti_practices.practice_group` is not free text in practice. `StiProfile.tsx`
-- renders `groupLabels[r.group]` from a hardcoded map of exactly four keys, and
-- `useStiProfile.ts` types the field as the union
-- `'anorectal' | 'oral_touching' | 'chems' | 'vaginal'`. A new group would
-- render `undefined` in the UI and lie in the type — a three-layer change
-- (migration + type + label map) on a health surface.
--
--   mutual-masturbation -> oral_touching  (sits beside kissing, sexual-caress)
--   scat                -> anorectal      (sits beside rimming)
--
-- BDSM and body modification have no honest home in those four, and their risk
-- is entirely conditional on whether blood or a skin breach is involved, which
-- a single risk level cannot express. Piss play would fit `oral_touching`, but
-- urine is not an established vehicle for any infection in this table, so every
-- cell would be an omission and the row would assert nothing. All three stay
-- out, and the audit records that.
--
-- Sources for the routes (levels come from the anchors above, not from these):
--   WHO hepatitis A fact sheet — faecal-oral transmission
--   CDC — shigella among MSM, faecal-oral including sexual contact
--   CDC/UKHSA mpox — prolonged close skin-to-skin contact as the dominant route
--   CDC HPV / HSV — skin-to-skin genital contact without penetration

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:sti_practices_mm_scat', true);

insert into public.sti_practices (slug, label, practice_group, sort)
values
  ('mutual-masturbation', 'Mutual masturbation', 'oral_touching', 12),
  ('scat',                'Faecal contact (scat)', 'anorectal',    13)
on conflict (slug) do nothing;

do $mig$
declare
  r         record;
  v_tag     uuid;
  v_written int := 0;
  v_skipped int := 0;
begin
  for r in
    select * from (values
      -- mutual-masturbation — anchored to sexual-caress / kissing
      ('mutual-masturbation', 'genital-warts',  'medium'),
      ('mutual-masturbation', 'genital-herpes', 'medium'),
      ('mutual-masturbation', 'mpox',           'high'),
      ('mutual-masturbation', 'syphilis',       'low'),
      -- scat — anchored to rimming
      ('scat',                'hepatitis-a',    'high'),
      ('scat',                'shigella',       'high'),
      ('scat',                'hepatitis-b',    'low')
    ) as t(practice_slug, sti_slug, risk)
  loop
    select id into v_tag from public.unified_tags
     where slug = r.sti_slug and status = 'active' and merged_into_id is null;

    -- A missing STI tag is skipped, never created. This migration must not
    -- mint a health tag as a side effect of filling a grid.
    if v_tag is null then
      raise notice 'skip: STI tag % not active', r.sti_slug;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.sti_transmission_risks
      (tag_id, practice_slug, risk, blood_involved)
    values (v_tag, r.practice_slug, r.risk, false)
    on conflict (tag_id, practice_slug) do nothing;

    if found then v_written := v_written + 1; end if;
  end loop;

  raise notice 'sti practices: % cell(s) written, % skipped', v_written, v_skipped;
end $mig$;

do $verify$
declare
  v_bad text;
  v_n   int;
begin
  -- Both practices exist and are in a group the UI can label. Asserted against
  -- the literal four keys StiProfile.tsx knows, because a group outside them
  -- renders `undefined` to a reader.
  select string_agg(slug || '=' || practice_group, ', ') into v_bad
  from public.sti_practices
  where slug in ('mutual-masturbation','scat')
    and practice_group not in ('anorectal','oral_touching','chems','vaginal');
  if v_bad is not null then
    raise exception 'sti practices: group not renderable by StiProfile: %', v_bad;
  end if;

  select count(*) into v_n from public.sti_practices
   where slug in ('mutual-masturbation','scat');
  if v_n <> 2 then
    raise exception 'sti practices: expected 2 practices, found %', v_n;
  end if;

  -- Every cell landed, and each matches its anchor's level.
  select string_agg(x.practice_slug || '/' || x.sti || '=' ||
                    coalesce(x.got, 'MISSING') || ' want ' || x.want, ', ')
    into v_bad
  from (
    select v.practice_slug, v.sti, v.want,
           (select r.risk from public.sti_transmission_risks r
              join public.unified_tags u on u.id = r.tag_id
             where r.practice_slug = v.practice_slug and u.slug = v.sti) as got
      from (values
        ('mutual-masturbation','genital-warts','medium'),
        ('mutual-masturbation','genital-herpes','medium'),
        ('mutual-masturbation','mpox','high'),
        ('mutual-masturbation','syphilis','low'),
        ('scat','hepatitis-a','high'),
        ('scat','shigella','high'),
        ('scat','hepatitis-b','low')
      ) as v(practice_slug, sti, want)
  ) x
  where x.got is distinct from x.want;
  if v_bad is not null then
    raise exception 'sti practices: cell missing or off its anchor: %', v_bad;
  end if;

  -- HIV is NOT claimed for either practice. This is the assertion that matters:
  -- a future sweep adding an HIV row here would be making a transmission claim
  -- neither route supports, and it should have to argue with this line.
  select count(*) into v_n
  from public.sti_transmission_risks r
  join public.unified_tags u on u.id = r.tag_id
  where u.slug = 'hiv' and r.practice_slug in ('mutual-masturbation','scat');
  if v_n > 0 then
    raise exception 'sti practices: % HIV cell(s) asserted for a route that does not carry it', v_n;
  end if;

  -- The anchors themselves are untouched. A migration that quietly re-graded
  -- rimming or sexual-caress to make its own numbers look consistent would be
  -- the worst version of this change.
  select string_agg(r.practice_slug || '/' || u.slug || '=' || r.risk, ', ') into v_bad
  from public.sti_transmission_risks r
  join public.unified_tags u on u.id = r.tag_id
  where (r.practice_slug, u.slug, r.risk) not in (
          ('sexual-caress','genital-herpes','medium'),
          ('sexual-caress','genital-warts','medium'),
          ('sexual-caress','mpox','high'),
          ('kissing','syphilis','low'),
          ('rimming','hepatitis-a','high'),
          ('rimming','shigella','high'),
          ('rimming','hepatitis-b','low'))
    and (r.practice_slug, u.slug) in (
          ('sexual-caress','genital-herpes'),('sexual-caress','genital-warts'),
          ('sexual-caress','mpox'),('kissing','syphilis'),
          ('rimming','hepatitis-a'),('rimming','shigella'),('rimming','hepatitis-b'));
  if v_bad is not null then
    raise exception 'sti practices: an anchor cell was changed: %', v_bad;
  end if;
end $verify$;
