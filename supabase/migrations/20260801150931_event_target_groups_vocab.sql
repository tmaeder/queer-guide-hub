-- Rebuild target_groups as a queer-first controlled vocabulary and map events onto it.
--
-- 669 events carried ~280 distinct free-text values, because the only writer is the LLM
-- in _shared/ai-enrichment.ts (MOAT_SYSTEM_PROMPT) and nothing constrained its output.
-- The tail includes whole sentences: "open and inclusive, implying all are welcome, but
-- no specific groups mentioned", "people who don't have someone to go to art galleries with".
--
-- This is not cosmetic. target_groups is:
--   * a search facet   -- SearchFiltersPanel.tsx:111 builds filter chips straight from the
--                         data, so 'LGBTQ+' / 'LGBTQ+ community' / 'lgbtq+' / 'LGBTQIA+'
--                         render as four separate chips for one concept
--   * an exact-match filter -- useEvents.tsx:234 query.overlaps('target_groups', ...)
--
-- The pre-existing target_groups table held 12 generic values (Professionals, Entrepreneurs,
-- Tech Community) that cover none of what a queer events corpus actually expresses -- no
-- trans, lesbian, non-binary, FLINTA or QTBIPOC. Those 12 are kept where they earn their
-- place and the queer axis is added alongside.
--
-- The table gains `slug` (what events store) next to `name` (what the UI shows) and reuses
-- the existing `aliases` column, so the mapping is data -- an admin can absorb a new spelling
-- from /admin/content/target_groups without a migration.

alter table public.target_groups add column if not exists slug text;

-- The table only had a PK on id, so `on conflict (name)` below had nothing to key on and
-- the seed would have inserted duplicate concepts on every re-run.
create unique index if not exists target_groups_name_key on public.target_groups (name);

-- Retire the generic-only seed rows that never described anything in the corpus.
-- Nothing references this table by FK, so deleting is safe.
delete from public.target_groups
where slug is null
  and name in ('Entrepreneurs', 'Health & Wellness', 'Sports Enthusiasts', 'Tech Community');

insert into public.target_groups (name, slug, aliases, sort_order, is_active) values
  -- ── umbrella ──────────────────────────────────────────────────────────────
  ('LGBTQ+ Community', 'lgbtq', array[
    'lgbtq+','lgbtq+ community','lgbtq','lgbt','lgbt+','lgbt+ community','lgbtq+ people',
    'lgbtq+ individuals','lgbtqia','lgbtqia+','lgbtqia+ community','lgbtqia+ people','lgbtqi',
    'lgbtqi+','lgbtiq','lgbtiq+','lgbtiq community','lgbti*','lgbtqiapk+','lgbtqia2s+ community',
    '2slgbtqia+','2slgbtqai+ communities','lgbtq communities','gbtq+','queer','queers','queer people',
    'queer community','local queer community','queer folk','questioning'], 10, true),

  -- ── identity ─────────────────────────────────────────────────────────────
  ('Gay men', 'gay', array['gay','gay men','gays','gbtq+ men','queer men','cis gay, bi & queer men','gay vegan men'], 20, true),
  ('Lesbians', 'lesbian', array['lesbian','lesbians','dyke','dykes'], 30, true),
  ('Sapphic / queer women', 'sapphic', array[
    'sapphic','sapphics','sapphic women','queer women','queer and trans women','women who love women',
    'lgbtq+ women','lbtqwomen'], 40, true),
  ('Bisexual people', 'bisexual', array['bisexual','bi','bi+','bi men','bi women','bi femmes'], 50, true),
  ('Trans people', 'trans', array[
    'trans','trans people','trans men','trans women','transwomen','transfems','trans individuals',
    'trans babes','transwomen/transfems people','trans men as allies','trans women of color'], 60, true),
  ('Non-binary people', 'non-binary', array[
    'non-binary','nonbinary','non-binary people','non-binary persons','nonbinary folks',
    'afab non-binary people','non-binary performers','genderqueer','agender','gender-diverse',
    'gender non-conforming','gender-non-conforming','theys'], 70, true),
  ('Intersex people', 'intersex', array['intersex'], 80, true),
  ('Asexual & aromantic people', 'aspec', array['aspec','asexual','aromantic'], 90, true),
  ('FLINTA', 'flinta', array['flinta','flinta*','flinta people','flinta persons','flinta people and allies'], 100, true),
  ('Allies', 'allies', array[
    'allies','ally','supporters','straight-friendly','hetero',
    'friends and families of queer people'], 110, true),

  -- ── community & subculture ───────────────────────────────────────────────
  ('Leather & kink', 'leather-kink', array[
    'leather','leather community','leather-community','leather men','leather and fetish community',
    'leather and fetish subcultures','leather/kink/alt-sex community','kink','kink-community','fetish',
    'fetish community','bdsm community','latex-lovers','gay skinheads','uniformed folk','punks','perverts'], 120, true),
  ('Bears', 'bears', array['bears','chubs'], 130, true),
  ('Drag community', 'drag', array[
    'drag','drag queens','drag kings','drag community','drag culture supporters','divas','scream queens'], 140, true),
  ('Polyamorous & non-monogamous', 'poly', array[
    'polyamorous','poly','non-monogamy community','ethical non-monogamy community'], 150, true),
  ('Sex-positive', 'sex-positive', array['sex-positive','chasers','trans admirers'], 160, true),

  -- ── intersectional ───────────────────────────────────────────────────────
  ('QTBIPOC', 'qtbipoc', array[
    'qtbipoc','qt-poc','qtbiopc','bipoc','bipoc lgbtq+ community','poc','poc communities','black',
    'brown','black lgbtq+','black lgbtq+ identities','black lgbtqia+ community','black queer people',
    'black trans community','queer black folk','black indigenous & people of colour',
    'black and brown queer and trans individuals','black and ethnic minority','queer people of colour',
    'people of colour','people of color','latinx','latin american','asian','api','south-asian',
    'queer south asian community','chinese lgbtq+','african','african lgbtqia+ community','caribbean',
    'pacific','pacific islanders','samoan community','mixed race people','diasporic queers',
    'diasporic communities','queer global majority',
    'aboriginal and torres strait lgbtq+ talent','lgbtqi+ black and poc',
    'queer and trans folks of asian, pacific islander, middle eastern'], 170, true),
  ('Disabled people', 'disabled', array[
    'disabled','deaf and hard of hearing','disabled men and non-binary people'], 180, true),
  ('Neurodivergent people', 'neurodivergent', array['neurodivergent'], 190, true),
  ('Migrants & refugees', 'migrants', array['queer migrants','lgbtq+ asylum claimants','refugees','asylum seekers'], 200, true),
  ('Sober / in recovery', 'sober', array['sober people','sober','in recovery'], 210, true),
  ('Low income & unwaged', 'low-income', array['low-income','unwaged','low-income/unwaged individuals'], 220, true),

  -- ── demographic ──────────────────────────────────────────────────────────
  ('Women', 'women', array['women','cis women','female','girlies','women over 40','femme-identifying beings','feminine of center'], 230, true),
  ('Men', 'men', array['men','cis men','dudes'], 240, true),
  ('Youth', 'youth', array['youth','queer youth','young people','young adults','18-25s','teens'], 250, true),
  ('Seniors', 'seniors', array['seniors','older adults','silver','silver pride'], 260, true),
  ('Families', 'families', array['families','family','family-friendly','lgbtq+ families','new moms','couples','partners','children'], 270, true),
  ('Students', 'students', array['students','student'], 280, true),
  ('Artists & Creatives', 'artists', array['artists','queer artists','queer creatives','performers','aspiring performers','performing arts artists','professional dancers'], 290, true),
  ('Professionals', 'professionals', array['professionals','medical professionals','lawyers','colleagues','military and veteran','nhs','nhs-staff'], 300, true)
on conflict (name) do update set
  slug = excluded.slug,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order,
  is_active = true;

create unique index if not exists target_groups_slug_key on public.target_groups (slug) where slug is not null;

-- Table-driven mapper. Default-reject: an unmatched term is dropped, which is what keeps
-- "cheese lovers" and "people who don't have someone to go to art galleries with" out.
-- Generic "everyone welcome" phrasings are deliberately dropped too -- they name no group.
create or replace function public.normalize_event_target_groups(p_raw text[])
returns text[]
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(distinct tg.slug order by tg.slug), '{}'::text[])
  from unnest(coalesce(p_raw, '{}'::text[])) as t
  join public.target_groups tg
    on tg.is_active
   and tg.slug is not null
   and (
        lower(btrim(t)) = tg.slug
     or lower(btrim(t)) = lower(tg.name)
     or lower(btrim(t)) = any (tg.aliases)
     -- tolerate the trailing collective nouns the LLM appends
     or regexp_replace(lower(btrim(t)), '\s+(community|communities|people|folks?|individuals|persons)$', '') = any (tg.aliases)
   );
$$;

comment on function public.normalize_event_target_groups(text[]) is
  'Maps free-text target-group terms onto public.target_groups.slug via name/slug/aliases. Default-reject: unmatched terms are dropped. Extend by editing target_groups.aliases -- no migration needed.';

update public.events e
set target_groups = public.normalize_event_target_groups(e.target_groups),
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{target_groups_raw}',
      to_jsonb(e.target_groups), true)
where coalesce(cardinality(e.target_groups), 0) > 0
  and e.target_groups is distinct from public.normalize_event_target_groups(e.target_groups);
