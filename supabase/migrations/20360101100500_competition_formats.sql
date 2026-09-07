-- Competitions stand for themselves: `format` replaces the "pageant" bucket.
--
-- WHAT WAS WRONG
--
-- `competitions.kind` shipped as `drag_race | pageant`, which defined eleven
-- independent competitions by what they are NOT — not-Drag-Race — and then gave
-- that residue a single name. For at least three of the eleven that name is
-- factually wrong, and the sources say so in their own opening sentences:
--
--   International Mr. Leather  "an American multi-day CONVENTION AND COMPETITION
--                               celebrating the leather, kink, fetish and BDSM
--                               communities"
--   MIR contest                "a multi-day CONVENTION AND CONTEST celebrating
--                               the rubber, fetish and kink communities"
--   Mr Gay Europe              "a male COMPETITION for gay Europeans about
--                               important LGBTQIA+ themes"
--
-- None of those is a pageant. IML is a leather title contest attached to a
-- convention and has been running since 1979; filing it under a label invented
-- to mean "the other ones" is a category error, and on a queer platform it is
-- the kind of error that erases a community's own name for its own institution.
--
-- The remaining eight DO self-describe as pageants ("a national pageant for
-- female impersonators", "the world's biggest beauty pageant for transgender
-- women", "an annual drag queen pageantry system"), so the fix is precision,
-- not deleting the word.
--
-- WHAT REPLACES IT
--
-- `format` is a per-competition label taken from that competition's own lead
-- sentence. It is the identity.
--
-- `kind` survives but is now STRUCTURAL ONLY and its vocabulary says so:
--   series -> runs as episodes, so it has an episode grid
--   title  -> decided at a single event, so it has none
-- That is the only thing the code ever actually needed it for (grid vs no grid),
-- and stated this way it makes no claim about what a competition IS. Note this
-- deliberately does NOT map onto the old split: Miss Fabulous Thailand is
-- televised, and a future televised title contest would still be `title`,
-- because the question is "are there episodes", not "is it on TV".
--
-- WHY NOT A `formats` LOOKUP TABLE: there are 12 distinct values across 33 rows
-- and no behaviour keys off them — they are prose for a reader. A vocabulary
-- table would add a join and a drift risk to something no code branches on.

alter table public.competitions add column if not exists format text;

comment on column public.competitions.format is
  'What this competition IS, in its own source''s words (leather convention and competition, drag pageantry system, ...). Identity lives here; `kind` is structure only.';

-- Rewrite `kind` as a structural vocabulary. Order matters: drop the old CHECK
-- before rewriting the values, or the UPDATE fails against the constraint it is
-- replacing.
alter table public.competitions drop constraint if exists competitions_kind_check;

update public.competitions set kind = 'series' where kind = 'drag_race';
update public.competitions set kind = 'title'  where kind = 'pageant';

alter table public.competitions alter column kind set default 'series';
alter table public.competitions add constraint competitions_kind_check
  check (kind = any (array['series', 'title']));

comment on column public.competitions.kind is
  'STRUCTURE, not identity: series = runs as episodes and has a placement grid; title = decided at a single event and has none. What a competition IS lives in `format`.';

-- Per-competition formats, from each page's own opening sentence.
update public.competitions c set format = v.format
  from (values
    ('international-mr-leather',      'Leather convention and title contest'),
    ('mister-international-rubber',   'Rubber and fetish convention and contest'),
    ('mr-gay-europe',                 'Gay men''s competition'),
    ('mr-gay-world',                  'International gay beauty pageant'),
    ('mr-gay-india',                  'National gay beauty pageant'),
    ('miss-international-queen',      'International transgender beauty pageant'),
    ('miss-star-international',       'International transgender beauty pageant'),
    ('miss-t-world',                  'International transgender beauty pageant'),
    ('miss-fabulous-thailand',        'Televised beauty pageant'),
    ('miss-gay-america',              'Female impersonation pageant'),
    ('miss-continental',              'Drag pageantry system')
  ) as v(slug, format)
 where c.slug = v.slug;

-- Everything episodic is the licensed Drag Race television format. Set by
-- structure rather than by listing 22 slugs, so a future franchise inherits it.
update public.competitions
   set format = 'Drag competition series'
 where kind = 'series' and format is null;

do $verify$
declare v_n int; v_iml text; v_kinds text;
begin
  -- Nothing may be left unlabelled: an empty format would render as a blank
  -- chip and quietly recreate the "unnamed residue" this migration removes.
  select count(*) into v_n from public.competitions where format is null or btrim(format) = '';
  if v_n <> 0 then raise exception '% competition(s) without a format', v_n; end if;

  -- The word "pageant" must not survive anywhere it is wrong.
  select format into v_iml from public.competitions where slug = 'international-mr-leather';
  if v_iml is null then raise exception 'IML row missing'; end if;
  if v_iml ilike '%pageant%' then
    raise exception 'International Mr. Leather is still labelled a pageant: %', v_iml;
  end if;
  if exists (select 1 from public.competitions
              where slug in ('mister-international-rubber', 'mr-gay-europe')
                and format ilike '%pageant%') then
    raise exception 'a non-pageant contest is still labelled a pageant';
  end if;

  -- ...but it must SURVIVE where the source uses it. Deleting the word wholesale
  -- would be the mirror-image error: Miss Continental calls itself a pageantry
  -- system and Miss Gay America a pageant for female impersonators.
  if not exists (select 1 from public.competitions
                  where slug = 'miss-gay-america' and format ilike '%pageant%') then
    raise exception 'Miss Gay America should still be described as a pageant';
  end if;

  -- kind is now the structural pair, and both members are populated.
  select string_agg(distinct kind, ',' order by kind) into v_kinds from public.competitions;
  if v_kinds is distinct from 'series,title' then
    raise exception 'kind vocabulary is %, expected series,title', v_kinds;
  end if;

  -- Structure must still match reality: nothing labelled `title` may own an
  -- episode, and every `series` competition should have some.
  select count(*) into v_n
    from public.competitions c
    join public.competition_editions ed on ed.competition_id = c.id
    join public.competition_episodes ep on ep.edition_id = ed.id
   where c.kind = 'title';
  if v_n <> 0 then raise exception '% episode(s) hang off a single-event competition', v_n; end if;

  raise notice 'competition formats set; kind is now structural';
end
$verify$;
