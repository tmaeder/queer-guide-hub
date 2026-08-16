-- STI structured data: transmission routes, testing windows, protection
-- methods, and the read RPCs behind the sexual-health band + /tags/sti-guide.
--
-- WHAT THIS IS FOR
--
-- The glossary carries a tag per STI, each with a description and diagnostic
-- codes. What it cannot answer are the three questions people actually have:
-- *how does this spread*, *when can I test for it*, and *what protects against
-- it*. Those answers exist as structured public-health facts, and this is the
-- typed home for them — the same shape as `medical_code_systems` (vocabulary
-- tables + per-tag rows + server-side composition) and
-- `substance_interactions` (a risk scale ranked in SQL, not TS).
--
-- RISK IS A NORMALISED KEY WITH A RANK IN SQL
--
-- `low | medium | high` mirrors the source material's three dot weights;
-- `sti_risk_rank()` is what every consumer sorts by, so "worst first" is a
-- database fact. `blood_involved` is a separate boolean, not a fourth level —
-- the source marks "risk with blood" as a modifier on a cell, and flattening
-- it into the scale would force an ordering ("is blood-risk worse than
-- high?") the data does not express.
--
-- ABSENCE OF A CELL MEANS "NO DOCUMENTED ROUTE", NOT ZERO
--
-- The matrix stores only practices with a documented transmission route. The
-- UI states this out loud, the same way the interaction chart handles missing
-- pairs.
--
-- ATTRIBUTION IS A COLUMN, NOT A FOOTNOTE
--
-- The factual grounding is Depistage.be's transmission/testing material as
-- presented by the Kink Responsibly programme (Darklands), cross-checked
-- against standard sexual-health guidance; prose is ours. `source` /
-- `source_url` are NOT NULL with defaults so an unattributed row cannot exist.

set local statement_timeout = '600s';

-- ── vocabulary: practices ───────────────────────────────────────────────────

create table if not exists public.sti_practices (
  slug           text primary key,
  label          text not null,
  practice_group text not null,
  sort           int  not null,
  constraint sti_practices_group_check check (practice_group = any (array[
    'anorectal', 'oral_touching', 'chems', 'vaginal']))
);

comment on table public.sti_practices is
  'Sexual/chem practices that can transmit STIs. Vocabulary for sti_transmission_risks; groups mirror the transmission-mode table this is derived from.';

-- ── vocabulary: protection methods ──────────────────────────────────────────

create table if not exists public.sti_protection_methods (
  slug        text primary key,
  label       text not null,
  description text not null,
  sort        int  not null
);

comment on table public.sti_protection_methods is
  'Combination-prevention toolkit: each method with a one-line plain-language description. Vocabulary for sti_protection_links.';

-- ── per-STI tables ──────────────────────────────────────────────────────────

create table if not exists public.sti_profiles (
  tag_id       uuid primary key references public.unified_tags(id) on delete cascade,
  pathogen     text not null,
  vaccine_note text,
  source       text not null default 'Depistage.be for Kink Responsibly, Darklands',
  source_url   text not null default 'https://depistage.be/',
  updated_at   timestamptz not null default now(),
  constraint sti_profiles_pathogen_check check (pathogen in ('virus', 'bacteria'))
);

create table if not exists public.sti_transmission_risks (
  tag_id         uuid not null references public.sti_profiles(tag_id) on delete cascade,
  practice_slug  text not null references public.sti_practices(slug) on delete cascade,
  risk           text not null,
  blood_involved boolean not null default false,
  primary key (tag_id, practice_slug),
  constraint sti_transmission_risks_risk_check check (risk in ('low', 'medium', 'high'))
);

create table if not exists public.sti_testing_windows (
  id             uuid primary key default gen_random_uuid(),
  tag_id         uuid not null references public.sti_profiles(tag_id) on delete cascade,
  test_kind      text not null,
  sample         text not null,
  earliest_weeks int,
  symptoms_only  boolean not null default false,
  note           text,
  sort           int not null default 0,
  -- A window is either anchored in time or symptom-driven; a row that is
  -- neither would render as an empty bar.
  constraint sti_testing_windows_anchor_check check (earliest_weeks is not null or symptoms_only)
);
create index if not exists sti_testing_windows_tag_idx on public.sti_testing_windows (tag_id);

create table if not exists public.sti_protection_links (
  tag_id      uuid not null references public.sti_profiles(tag_id) on delete cascade,
  method_slug text not null references public.sti_protection_methods(slug) on delete cascade,
  primary key (tag_id, method_slug)
);

-- ── RLS + grants (both halves, per 20260902100000 / 20260906100000) ─────────

do $rls$
declare t text;
begin
  foreach t in array array['sti_practices','sti_protection_methods','sti_profiles',
                           'sti_transmission_risks','sti_testing_windows','sti_protection_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_public_read on public.%I', t, t);
    execute format('create policy %I_public_read on public.%I for select to public using (true)', t, t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end
$rls$;

-- ── rank ────────────────────────────────────────────────────────────────────

create or replace function public.sti_risk_rank(p_risk text)
returns int language sql immutable parallel safe as $$
  select case p_risk when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 99 end;
$$;

-- ── seed ────────────────────────────────────────────────────────────────────

insert into public.sti_practices (slug, label, practice_group, sort) values
  ('anal-penetration',    'Anal penetration',            'anorectal',     1),
  ('fisting',             'Fisting',                     'anorectal',     2),
  ('rimming',             'Rimming',                     'anorectal',     3),
  ('toy-sharing',         'Sharing sex toys',            'anorectal',     4),
  ('fellatio',            'Fellatio',                    'oral_touching', 5),
  ('kissing',             'Kissing',                     'oral_touching', 6),
  ('sexual-caress',       'Skin-to-skin contact',        'oral_touching', 7),
  ('syringe-sharing',     'Sharing syringes (slamming)', 'chems',         8),
  ('straw-sharing',       'Sharing sniffing straws',     'chems',         9),
  ('vaginal-penetration', 'Vaginal penetration',         'vaginal',      10),
  ('cunnilingus',         'Cunnilingus',                 'vaginal',      11)
on conflict (slug) do update set
  label = excluded.label, practice_group = excluded.practice_group, sort = excluded.sort;

insert into public.sti_protection_methods (slug, label, description, sort) values
  ('condom-use', 'Condom use',
   'The best-known prevention method, effective against most STIs. Use the right size and a water- or silicone-based lubricant to prevent tearing.', 1),
  ('vaccination', 'Vaccination',
   'Long-term protection against some viral STIs — hepatitis A and B, HPV and mpox. Keep vaccinations up to date and discuss them with your doctor.', 2),
  ('prep', 'PrEP',
   'A pill taken preventively so an HIV infection cannot establish itself, for when condom use is not always possible. Protects only against HIV — combine it with condoms for the rest.', 3),
  ('pep', 'PEP',
   'Emergency HIV treatment for one month, started within 72 hours after sexual contact without a condom or PrEP. Available via a hospital emergency room or an HIV reference centre.', 4),
  ('testing-treatment', 'Regular testing & treatment',
   'Testing is the only way to be certain, since many infections cause no symptoms. Treating yourself also directly protects your sexual partners.', 5),
  ('no-needle-sharing', 'No needle sharing',
   'Essential during injecting drug use (slamming) to prevent blood-borne transmission. Always use your own sterile set.', 6),
  ('gloves-hygiene', 'Gloves & hand washing',
   'Indispensable for fisting and other manual play to prevent transmission of viral and bacterial STIs. Hygiene is a sign of respect for each other''s bodies.', 7),
  ('u-equals-u', 'U=U',
   'Undetectable = Untransmittable: someone with HIV who takes their medication correctly and keeps their viral load undetectable no longer transmits HIV.', 8)
on conflict (slug) do update set
  label = excluded.label, description = excluded.description, sort = excluded.sort;

do $seed$
declare
  r record;
  v_tag uuid;
begin
  perform set_config('app.actor', 'admin:sti-profiles-seed', true);

  ---------------------------------------------------------------------------
  -- Revive. Several STI tags sit at status='deprecated' (genital-warts,
  -- hepatitis twins…) because deprecate_unused_tags() prunes zero-usage tags
  -- and nothing ever linked them. A tag carrying an STI profile must be
  -- active and human_reviewed, or the band's data is invisible and the next
  -- nightly run kills the tag again. Names are NOT touched here —
  -- normalize_tag_input() regenerates the slug on a name change.
  ---------------------------------------------------------------------------
  for r in select * from (values
      ('hiv'), ('hepatitis-a'), ('hepatitis-b'), ('hepatitis-c'), ('mpox'),
      ('genital-herpes'), ('genital-warts'), ('syphilis'), ('chlamydia'),
      ('gonorrhea'), ('shigella')
    ) as p(slug) loop
    update public.unified_tags
       set status = 'active',
           human_reviewed = true,
           verification_status = 'reviewed',
           seo_indexable = true,
           merged_into_id = null,
           deprecated_at = null,
           deprecation_reason = null,
           last_verified_at = now(),
           updated_at = now()
     where slug = r.slug
       and (status <> 'active' or human_reviewed is not true
            or verification_status <> 'reviewed');
  end loop;

  ---------------------------------------------------------------------------
  -- Profiles.
  ---------------------------------------------------------------------------
  for r in select * from (values
      ('hiv',            'virus',    null),
      ('hepatitis-a',    'virus',    'A safe, effective vaccine exists and is recommended for men who have sex with men.'),
      ('hepatitis-b',    'virus',    'A vaccine is available and is part of routine vaccination in many countries.'),
      ('hepatitis-c',    'virus',    null),
      ('mpox',           'virus',    'A vaccine is available.'),
      ('genital-herpes', 'virus',    null),
      ('genital-warts',  'virus',    'The HPV vaccine covers the highest-risk types.'),
      ('syphilis',       'bacteria', null),
      ('chlamydia',      'bacteria', null),
      ('gonorrhea',      'bacteria', null),
      ('shigella',       'bacteria', null)
    ) as p(slug, pathogen, vaccine_note) loop
    select id into v_tag from public.unified_tags where slug = r.slug;
    if v_tag is null then
      raise exception 'sti_profiles seed: tag % missing (run the vocabulary migration first)', r.slug;
    end if;
    insert into public.sti_profiles (tag_id, pathogen, vaccine_note)
    values (v_tag, r.pathogen, r.vaccine_note)
    on conflict (tag_id) do update set
      pathogen = excluded.pathogen, vaccine_note = excluded.vaccine_note, updated_at = now();
  end loop;

  ---------------------------------------------------------------------------
  -- Transmission risks. Only documented routes get a row; blood=true marks
  -- routes whose risk exists or rises sharply when blood is involved.
  ---------------------------------------------------------------------------
  delete from public.sti_transmission_risks;
  for r in select * from (values
      -- HIV: semen/blood/mucosa. Intact skin and saliva are not routes.
      ('hiv', 'anal-penetration',    'high',   false),
      ('hiv', 'vaginal-penetration', 'high',   false),
      ('hiv', 'syringe-sharing',     'high',   true),
      ('hiv', 'toy-sharing',         'medium', false),
      ('hiv', 'fisting',             'low',    true),
      ('hiv', 'fellatio',            'low',    false),
      ('hiv', 'cunnilingus',         'low',    false),
      ('hiv', 'straw-sharing',       'low',    true),
      -- Hepatitis A: fecal-oral.
      ('hepatitis-a', 'rimming',          'high',   false),
      ('hepatitis-a', 'fisting',          'medium', false),
      ('hepatitis-a', 'toy-sharing',      'medium', false),
      ('hepatitis-a', 'anal-penetration', 'medium', false),
      ('hepatitis-a', 'fellatio',         'low',    false),
      ('hepatitis-a', 'cunnilingus',      'low',    false),
      -- Hepatitis B: highly infectious via blood and sexual fluids.
      ('hepatitis-b', 'anal-penetration',    'high',   false),
      ('hepatitis-b', 'vaginal-penetration', 'high',   false),
      ('hepatitis-b', 'syringe-sharing',     'high',   true),
      ('hepatitis-b', 'fellatio',            'medium', false),
      ('hepatitis-b', 'cunnilingus',         'medium', false),
      ('hepatitis-b', 'toy-sharing',         'medium', false),
      ('hepatitis-b', 'fisting',             'medium', true),
      ('hepatitis-b', 'straw-sharing',       'medium', true),
      ('hepatitis-b', 'rimming',             'low',    false),
      ('hepatitis-b', 'kissing',             'low',    false),
      -- Hepatitis C: essentially blood-borne — every route flagged.
      ('hepatitis-c', 'syringe-sharing',     'high',   true),
      ('hepatitis-c', 'fisting',             'medium', true),
      ('hepatitis-c', 'straw-sharing',       'medium', true),
      ('hepatitis-c', 'anal-penetration',    'medium', true),
      ('hepatitis-c', 'toy-sharing',         'medium', true),
      ('hepatitis-c', 'vaginal-penetration', 'low',    true),
      ('hepatitis-c', 'fellatio',            'low',    true),
      ('hepatitis-c', 'rimming',             'low',    true),
      -- Mpox: prolonged close physical contact.
      ('mpox', 'sexual-caress',       'high',   false),
      ('mpox', 'anal-penetration',    'high',   false),
      ('mpox', 'vaginal-penetration', 'high',   false),
      ('mpox', 'fisting',             'medium', false),
      ('mpox', 'rimming',             'medium', false),
      ('mpox', 'fellatio',            'medium', false),
      ('mpox', 'kissing',             'medium', false),
      ('mpox', 'toy-sharing',         'medium', false),
      -- Genital herpes: skin/mucosa contact, oral included.
      ('genital-herpes', 'anal-penetration',    'high',   false),
      ('genital-herpes', 'vaginal-penetration', 'high',   false),
      ('genital-herpes', 'fellatio',            'high',   false),
      ('genital-herpes', 'cunnilingus',         'high',   false),
      ('genital-herpes', 'kissing',             'high',   false),
      ('genital-herpes', 'rimming',             'medium', false),
      ('genital-herpes', 'sexual-caress',       'medium', false),
      ('genital-herpes', 'toy-sharing',         'low',    false),
      -- HPV / genital warts: skin-to-skin.
      ('genital-warts', 'anal-penetration',    'high',   false),
      ('genital-warts', 'vaginal-penetration', 'high',   false),
      ('genital-warts', 'sexual-caress',       'medium', false),
      ('genital-warts', 'fellatio',            'medium', false),
      ('genital-warts', 'cunnilingus',         'medium', false),
      ('genital-warts', 'toy-sharing',         'medium', false),
      ('genital-warts', 'fisting',             'low',    false),
      ('genital-warts', 'rimming',             'low',    false),
      -- Syphilis: contact with a sore; oral sex is a major route.
      ('syphilis', 'anal-penetration',    'high',   false),
      ('syphilis', 'vaginal-penetration', 'high',   false),
      ('syphilis', 'fellatio',            'high',   false),
      ('syphilis', 'cunnilingus',         'medium', false),
      ('syphilis', 'rimming',             'medium', false),
      ('syphilis', 'kissing',             'low',    false),
      ('syphilis', 'toy-sharing',         'low',    false),
      ('syphilis', 'syringe-sharing',     'medium', true),
      -- Chlamydia.
      ('chlamydia', 'anal-penetration',    'high',   false),
      ('chlamydia', 'vaginal-penetration', 'high',   false),
      ('chlamydia', 'fellatio',            'medium', false),
      ('chlamydia', 'cunnilingus',         'medium', false),
      ('chlamydia', 'toy-sharing',         'medium', false),
      ('chlamydia', 'rimming',             'low',    false),
      -- Gonorrhea: throat carriage makes oral routes real.
      ('gonorrhea', 'anal-penetration',    'high',   false),
      ('gonorrhea', 'vaginal-penetration', 'high',   false),
      ('gonorrhea', 'fellatio',            'high',   false),
      ('gonorrhea', 'cunnilingus',         'medium', false),
      ('gonorrhea', 'rimming',             'medium', false),
      ('gonorrhea', 'toy-sharing',         'medium', false),
      ('gonorrhea', 'kissing',             'low',    false),
      -- Shigella: fecal-oral, tiny amounts suffice.
      ('shigella', 'rimming',          'high',   false),
      ('shigella', 'fisting',          'high',   false),
      ('shigella', 'toy-sharing',      'medium', false),
      ('shigella', 'anal-penetration', 'medium', false),
      ('shigella', 'sexual-caress',    'low',    false),
      ('shigella', 'fellatio',         'low',    false)
    ) as t(slug, practice, risk, blood) loop
    insert into public.sti_transmission_risks (tag_id, practice_slug, risk, blood_involved)
    select id, r.practice, r.risk, r.blood from public.unified_tags where slug = r.slug;
  end loop;

  ---------------------------------------------------------------------------
  -- Testing windows.
  ---------------------------------------------------------------------------
  delete from public.sti_testing_windows;
  for r in select * from (values
      ('hiv',            'Lab blood test',       'blood',                 6,    false, 'A 4th-generation lab test is reliable from 6 weeks after the risk.', 1),
      ('hiv',            'Rapid test / self-test','blood',                12,   false, 'Rapid and self-tests are reliable from 12 weeks.', 2),
      ('hepatitis-a',    'Blood test',           'blood',                 4,    false, null, 1),
      ('hepatitis-b',    'Blood test',           'blood',                 8,    false, null, 1),
      ('hepatitis-c',    'Blood test',           'blood',                 12,   false, null, 1),
      ('hepatitis-c',    'Rapid test',           'blood',                 12,   false, null, 2),
      ('mpox',           'Swab of a lesion',     'swab',                  null, true,  'Tested when symptoms are present.', 1),
      ('genital-herpes', 'Swab of a lesion',     'swab',                  null, true,  'Tested when symptoms are present.', 1),
      ('genital-warts',  'Visual check / swab',  'swab',                  null, true,  'Checked when warts are visible.', 1),
      ('syphilis',       'Blood test',           'blood',                 6,    false, null, 1),
      ('syphilis',       'Rapid test',           'blood',                 12,   false, null, 2),
      ('chlamydia',      'Swab / urine test',    'anal, throat or urine', 2,    false, null, 1),
      ('gonorrhea',      'Swab / urine test',    'anal, throat or urine', 2,    false, null, 1),
      ('shigella',       'Stool sample',         'feces',                 null, true,  'Tested when symptoms (severe diarrhea) are present.', 1)
    ) as t(slug, kind, sample, weeks, sympt, note, sort) loop
    insert into public.sti_testing_windows (tag_id, test_kind, sample, earliest_weeks, symptoms_only, note, sort)
    select id, r.kind, r.sample, r.weeks, r.sympt, r.note, r.sort
      from public.unified_tags where slug = r.slug;
  end loop;

  ---------------------------------------------------------------------------
  -- Match & Protect.
  ---------------------------------------------------------------------------
  delete from public.sti_protection_links;
  for r in select * from (values
      ('hiv',            array['condom-use','prep','pep','testing-treatment','no-needle-sharing','u-equals-u']),
      ('gonorrhea',      array['condom-use','testing-treatment']),
      ('syphilis',       array['condom-use','testing-treatment']),
      ('chlamydia',      array['condom-use','testing-treatment']),
      ('genital-warts',  array['condom-use','vaccination','testing-treatment']),
      ('genital-herpes', array['condom-use','testing-treatment']),
      ('shigella',       array['gloves-hygiene','condom-use','testing-treatment']),
      ('mpox',           array['vaccination','testing-treatment']),
      ('hepatitis-a',    array['vaccination','gloves-hygiene']),
      ('hepatitis-b',    array['vaccination','condom-use','testing-treatment','no-needle-sharing']),
      ('hepatitis-c',    array['no-needle-sharing','gloves-hygiene','condom-use','testing-treatment'])
    ) as t(slug, methods) loop
    insert into public.sti_protection_links (tag_id, method_slug)
    select u.id, m from public.unified_tags u, unnest(r.methods) as m
     where u.slug = r.slug;
  end loop;
end
$seed$;

-- ── read RPCs ───────────────────────────────────────────────────────────────

-- Everything one STI tag carries, in one round trip. Returns SQL NULL when the
-- tag has no profile, which is how the band self-selects.
create or replace function public.get_tag_sti_profile(p_tag_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.tag_id is null then null else jsonb_build_object(
    'pathogen', p.pathogen,
    'vaccine_note', p.vaccine_note,
    'source', p.source,
    'source_url', p.source_url,
    'transmission', coalesce((
      select jsonb_agg(jsonb_build_object(
               'practice', pr.slug, 'label', pr.label, 'group', pr.practice_group,
               'risk', tr.risk, 'severity', public.sti_risk_rank(tr.risk),
               'blood', tr.blood_involved)
             order by public.sti_risk_rank(tr.risk), pr.sort)
        from public.sti_transmission_risks tr
        join public.sti_practices pr on pr.slug = tr.practice_slug
       where tr.tag_id = p.tag_id), '[]'::jsonb),
    'testing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'test_kind', w.test_kind, 'sample', w.sample,
               'earliest_weeks', w.earliest_weeks, 'symptoms_only', w.symptoms_only,
               'note', w.note)
             order by w.sort)
        from public.sti_testing_windows w
       where w.tag_id = p.tag_id), '[]'::jsonb),
    'protection', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', m.slug, 'label', m.label, 'description', m.description)
             order by m.sort)
        from public.sti_protection_links l
        join public.sti_protection_methods m on m.slug = l.method_slug
       where l.tag_id = p.tag_id), '[]'::jsonb)
  ) end
  from public.unified_tags t
  left join public.sti_profiles p on p.tag_id = t.id
  where t.id = p_tag_id and t.status = 'active';
$$;

-- The whole transmission grid in one round trip; the client pivots.
create or replace function public.sti_transmission_matrix()
returns jsonb language sql stable security definer set search_path = public as $$
  with stis as (
    select t.id, t.slug, t.name, p.pathogen
      from public.sti_profiles p
      join public.unified_tags t on t.id = p.tag_id
     where t.status = 'active'
  )
  select jsonb_build_object(
    'stis', coalesce((select jsonb_agg(jsonb_build_object(
              'id', id, 'slug', slug, 'name', name, 'pathogen', pathogen)
              order by pathogen, name) from stis), '[]'::jsonb),
    'practices', coalesce((select jsonb_agg(jsonb_build_object(
              'slug', slug, 'label', label, 'group', practice_group)
              order by sort) from public.sti_practices), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object(
              'tag', tr.tag_id, 'practice', tr.practice_slug, 'risk', tr.risk,
              'severity', public.sti_risk_rank(tr.risk), 'blood', tr.blood_involved))
              from public.sti_transmission_risks tr
              join stis s on s.id = tr.tag_id), '[]'::jsonb),
    'source', 'Depistage.be for Kink Responsibly, Darklands',
    'source_url', 'https://depistage.be/'
  );
$$;

-- Match & Protect + testing windows for the guide page, one round trip.
create or replace function public.sti_protection_matrix()
returns jsonb language sql stable security definer set search_path = public as $$
  with stis as (
    select t.id, t.slug, t.name, p.pathogen, p.vaccine_note
      from public.sti_profiles p
      join public.unified_tags t on t.id = p.tag_id
     where t.status = 'active'
  )
  select jsonb_build_object(
    'stis', coalesce((select jsonb_agg(jsonb_build_object(
              'id', id, 'slug', slug, 'name', name, 'pathogen', pathogen,
              'vaccine_note', vaccine_note) order by pathogen, name) from stis), '[]'::jsonb),
    'methods', coalesce((select jsonb_agg(jsonb_build_object(
              'slug', slug, 'label', label, 'description', description)
              order by sort) from public.sti_protection_methods), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object(
              'tag', l.tag_id, 'method', l.method_slug))
              from public.sti_protection_links l
              join stis s on s.id = l.tag_id), '[]'::jsonb),
    'testing', coalesce((select jsonb_agg(jsonb_build_object(
              'tag', w.tag_id, 'test_kind', w.test_kind, 'sample', w.sample,
              'earliest_weeks', w.earliest_weeks, 'symptoms_only', w.symptoms_only,
              'note', w.note) order by w.sort)
              from public.sti_testing_windows w
              join stis s on s.id = w.tag_id), '[]'::jsonb)
  );
$$;

revoke all on function public.get_tag_sti_profile(uuid) from public;
revoke all on function public.sti_transmission_matrix() from public;
revoke all on function public.sti_protection_matrix() from public;
grant execute on function public.get_tag_sti_profile(uuid) to anon, authenticated, service_role;
grant execute on function public.sti_transmission_matrix() to anon, authenticated, service_role;
grant execute on function public.sti_protection_matrix() to anon, authenticated, service_role;
grant execute on function public.sti_risk_rank(text) to anon, authenticated, service_role;

-- ── verify ──────────────────────────────────────────────────────────────────

do $verify$
declare v_doc jsonb; v_n int;
begin
  select public.get_tag_sti_profile(id) into v_doc
    from public.unified_tags where slug = 'hiv';
  if v_doc is null or jsonb_array_length(v_doc->'transmission') < 5
     or jsonb_array_length(v_doc->'protection') < 5 then
    raise exception 'sti_profiles verify: hiv profile incomplete: %', v_doc;
  end if;

  select public.get_tag_sti_profile(id) into v_doc
    from public.unified_tags where slug = 'ssc';
  if v_doc is not null then
    raise exception 'sti_profiles verify: a non-STI tag returned a profile';
  end if;

  select jsonb_array_length(public.sti_transmission_matrix()->'stis') into v_n;
  if v_n <> 11 then
    raise exception 'sti_profiles verify: expected 11 STIs in the matrix, got %', v_n;
  end if;

  -- A bad risk key must be rejected.
  begin
    insert into public.sti_transmission_risks (tag_id, practice_slug, risk)
    values ((select tag_id from public.sti_profiles limit 1), 'kissing', 'HIGH RISK');
    raise exception 'sti_profiles verify: raw source label accepted as a risk';
  exception when check_violation or unique_violation then null;
  end;
end
$verify$;
