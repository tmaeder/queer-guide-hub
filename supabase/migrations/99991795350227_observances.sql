-- Observances: annual awareness days as first-class entities.
-- Design: docs/plans/2026-11-22-observances-design.md; plan: docs/superpowers/plans/2026-11-22-observances-phase1.md
--
-- ONE date implementation (observance_rule_range) feeds the linker, the hub RPC and the
-- postconditions below, so "what date is Spirit Day" cannot drift between them.
-- Linker rule: an auto link needs the TITLE to name the day AND a date inside the window of
-- the event's own country rule (falling back to the global rule). A description-only or
-- name-only match -> 'review' (most such events merely mention the day). Date only -> nothing.
-- 'rejected' is a tombstone. In full mode an auto link that no longer qualifies is demoted to
-- 'review'. Nothing auto-links until conditions.mode = 'full'.

-- ===== 1. tables =====
create table public.observances (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  kind text not null check (kind in ('day', 'month')),
  tone text not null check (tone in ('memorial', 'awareness', 'celebration')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  summary text not null,
  body text,
  founded_year smallint,
  founded_milestone_id uuid references public.milestones(id) on delete set null,
  tag_id uuid references public.unified_tags(id) on delete set null,
  match_terms text[] not null check (cardinality(match_terms) > 0),
  window_days_before smallint not null default 3 check (window_days_before between 0 and 31),
  window_days_after smallint not null default 3 check (window_days_after between 0 and 31),
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.observance_dates (
  id uuid primary key default gen_random_uuid(),
  observance_id uuid not null references public.observances(id) on delete cascade,
  country_id uuid references public.countries(id) on delete cascade,  -- null = global default
  rule_type text not null check (rule_type in ('fixed', 'month', 'nth_weekday')),
  month smallint not null check (month between 1 and 12),
  day smallint check (day between 1 and 31),
  nth smallint check (nth between 1 and 4),          -- a 5th weekday can spill into the next month
  weekday smallint check (weekday between 0 and 6),        -- 0 = Sunday, = extract(dow)
  check (
    (rule_type = 'fixed'       and day is not null and nth is null and weekday is null) or
    (rule_type = 'month'       and day is null and nth is null and weekday is null) or
    (rule_type = 'nth_weekday' and day is null and nth is not null and weekday is not null)
  ),
  -- the day must exist in its month in a leap year; 02-29 falls back to 02-28 in other years
  check (day is null or day <= case when month = 2 then 29 when month in (4, 6, 9, 11) then 30 else 31 end)
);
create unique index observance_dates_one_rule_per_country
  on public.observance_dates (observance_id, coalesce(country_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.event_observances (
  event_id uuid not null references public.events(id) on delete cascade,
  observance_id uuid not null references public.observances(id) on delete cascade,
  method text not null check (method in ('auto', 'human')),
  status text not null check (status in ('linked', 'review', 'rejected')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, observance_id)
);
create index event_observances_by_observance on public.event_observances (observance_id, status);

-- ===== 2. RLS + grants =====
-- public-schema default privileges grant anon/authenticated write on new relations;
-- revoke first, then grant read only.
alter table public.observances enable row level security;
alter table public.observance_dates enable row level security;
alter table public.event_observances enable row level security;

create policy observances_public_read on public.observances
  for select using (status = 'published');
create policy observance_dates_public_read on public.observance_dates
  for select using (exists (select 1 from public.observances o
                            where o.id = observance_id and o.status = 'published'));
-- satellite RLS repeats the parent predicates; events RLS applies inside the subquery,
-- so a link to a safety-gated event disappears for anon along with the event
create policy event_observances_public_read on public.event_observances
  for select using (status = 'linked'
                    and exists (select 1 from public.events e where e.id = event_id and e.duplicate_of_id is null)
                    and exists (select 1 from public.observances o where o.id = observance_id and o.status = 'published'));

revoke all on table public.observances from anon, authenticated;
revoke all on table public.observance_dates from anon, authenticated;
revoke all on table public.event_observances from anon, authenticated;
grant select on table public.observances to anon, authenticated;
grant select on table public.observance_dates to anon, authenticated;
grant select on table public.event_observances to anon, authenticated;

-- ===== 3. date functions =====
create or replace function public.observance_rule_range(
  p_rule text, p_year int, p_month smallint, p_day smallint, p_nth smallint, p_weekday smallint)
returns daterange language sql immutable set search_path to 'public' as $fn$
  select case p_rule
    when 'fixed' then (
      select daterange(d, d, '[]') from (
        select make_date(p_year, p_month,
                         case when p_month = 2 and p_day = 29
                                   and extract(day from make_date(p_year, 3, 1) - 1) = 28
                              then 28 else p_day end) as d) s)
    when 'month' then daterange(make_date(p_year, p_month, 1),
                                (make_date(p_year, p_month, 1) + interval '1 month')::date, '[)')
    when 'nth_weekday' then (
      select daterange(d, d, '[]') from (
        select make_date(p_year, p_month, 1)
             + ((p_weekday - extract(dow from make_date(p_year, p_month, 1))::int + 7) % 7)
             + (p_nth - 1) * 7 as d) s)
  end
$fn$;

-- Occurrence for one year in one country; the country's own rule wins over the global one.
create or replace function public.observance_occurrence(p_observance_id uuid, p_year int, p_country_id uuid)
returns daterange language sql stable set search_path to 'public' as $fn$
  select public.observance_rule_range(r.rule_type, p_year, r.month, r.day, r.nth, r.weekday)
  from public.observance_dates r
  where r.observance_id = p_observance_id
    and (r.country_id = p_country_id or r.country_id is null)
  order by (r.country_id is null)
  limit 1
$fn$;

-- Hub: current (still inside its after-window) or next occurrence, one row per rule.
create or replace function public.observance_next_dates(p_observance_id uuid)
returns table (country_id uuid, country_name text, starts date, ends date)
language sql stable set search_path to 'public' as $fn$
  select r.country_id, c.name, lower(x.rng), upper(x.rng) - 1
  from public.observance_dates r
  join public.observances o on o.id = r.observance_id
  left join public.countries c on c.id = r.country_id
  cross join lateral (
    select case when upper(t.rng) - 1 + o.window_days_after >= current_date then t.rng else n.rng end as rng
    from (select public.observance_rule_range(r.rule_type, extract(year from current_date)::int,
                                              r.month, r.day, r.nth, r.weekday) as rng) t,
         (select public.observance_rule_range(r.rule_type, extract(year from current_date)::int + 1,
                                              r.month, r.day, r.nth, r.weekday) as rng) n
  ) x
  where r.observance_id = p_observance_id
  order by r.country_id nulls first, c.name
$fn$;

grant execute on function public.observance_rule_range(text, int, smallint, smallint, smallint, smallint) to anon, authenticated;
grant execute on function public.observance_occurrence(uuid, int, uuid) to anon, authenticated;
grant execute on function public.observance_next_dates(uuid) to anon, authenticated;

-- ===== 4. gated count (aggregate only; same contract as gated_count_for_location) =====
create or replace function public.observance_gated_count(p_observance_id uuid, p_from date, p_to date)
returns int language sql stable security definer set search_path to 'public' as $fn$
  select count(*)::int
  from public.event_observances eo
  join public.events e on e.id = eo.event_id
  where eo.observance_id = p_observance_id
    and eo.status = 'linked'
    and e.duplicate_of_id is null
    and e.start_date::date between p_from and p_to
    and e.safety_gated
    and exists (select 1 from public.observances o where o.id = p_observance_id and o.status = 'published')
$fn$;
revoke all on function public.observance_gated_count(uuid, date, date) from public;
grant execute on function public.observance_gated_count(uuid, date, date) to anon, authenticated, service_role;

-- ===== 5. linker =====
-- p_since bounds the nightly scan; pass null once for the historical backfill.
create or replace function public.run_observance_link(p_mode text default null,
                                                      p_since timestamptz default now() - interval '400 days')
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_mode text;
begin
  select coalesce(p_mode, a.conditions->>'mode', 'dry_run') into v_mode
  from public.admin_automations a where a.slug = 'observance_link';
  v_mode := coalesce(v_mode, p_mode, 'dry_run');
  if v_mode not in ('dry_run', 'full') then
    raise exception 'observance_link: unknown mode %', v_mode;
  end if;

  -- the candidate set is computed once and read by both the upsert and the demotion
  drop table if exists pg_temp._obs_s;
  create temp table pg_temp._obs_s on commit drop as
  with o as (
    select ob.id, ob.window_days_before as wb, ob.window_days_after as wa,
           -- ~* is case-insensitive; substring() is not, hence the (?i) prefix there
           -- ponytail: two compiled patterns per observance; past ~16 published observances the
           -- 32-entry regex cache thrashes. Precompile per observance or prefilter with a trigram index then.
           '\m(' || array_to_string(ob.match_terms, '|') || ')\M' as rx
    from public.observances ob where ob.status = 'published'
  ),
  cand as (
    -- ponytail: UTC date of start_date, the ±window absorbs the day-edge error;
    -- switch to the event's timezone if a hand-read shows misses at the window edge.
    -- ponytail: occurrence is computed for the event's own year only — an observance near
    -- 1 Jan with window_days_before > 0 would miss late-December events; compute
    -- year-1/year/year+1 and take the nearest if one is ever added.
    select e.id as event_id, o.id as observance_id, o.wb, o.wa,
           substring(e.title from ('(?i)' || o.rx)) as title_term,
           substring(coalesce(e.description, '') from ('(?i)' || o.rx)) as desc_term,
           e.start_date::date as d,
           public.observance_occurrence(o.id, extract(year from e.start_date)::int, e.country_id) as occ,
           exists (select 1 from public.observance_dates r
                   where r.observance_id = o.id and r.country_id = e.country_id) as country_rule
    from public.events e
    -- name match lives in the JOIN; the WHERE holds only event filters
    -- (`a or b and c` would parse as `a or (b and c)` and leak duplicates)
    join o on (e.title ~* o.rx or coalesce(e.description, '') ~* o.rx)
    where e.duplicate_of_id is null
      and e.start_date is not null
      and (p_since is null or e.start_date >= p_since)
  )
  select c.*,
         c.occ is not null
           and c.d >= lower(c.occ) - c.wb
           and c.d <= (upper(c.occ) - 1) + c.wa as date_sig,
         case when c.occ is null then null else c.d - lower(c.occ) end as offset_days
  from cand c;

  insert into public.event_observances (event_id, observance_id, method, status, evidence)
  select s.event_id, s.observance_id, 'auto',
         case when v_mode = 'full' and s.title_term is not null and s.date_sig then 'linked' else 'review' end,
         jsonb_build_object('title_term', s.title_term, 'desc_term', s.desc_term,
                            'date_signal', coalesce(s.date_sig, false), 'offset_days', s.offset_days,
                            'country_rule', s.country_rule, 'mode', v_mode)
  from pg_temp._obs_s s
  on conflict (event_id, observance_id) do update
    set status = excluded.status, evidence = excluded.evidence, updated_at = now()
    where public.event_observances.status = 'review'
      and public.event_observances.method = 'auto'
      and excluded.status = 'linked';

  -- demotion: an auto link whose event no longer qualifies (date moved out of the window,
  -- title no longer names the day, event merged away as a duplicate) goes back to review.
  -- Same p_since window as the scan; human decisions and rejections are never touched.
  if v_mode = 'full' then
    update public.event_observances eo
       set status = 'review', evidence = eo.evidence || '{"demoted": true}'::jsonb, updated_at = now()
      from public.events e
     where e.id = eo.event_id
       and eo.method = 'auto' and eo.status = 'linked'
       and (p_since is null or e.start_date >= p_since)
       and not exists (select 1 from pg_temp._obs_s s
                       where s.event_id = eo.event_id and s.observance_id = eo.observance_id
                         and s.title_term is not null and s.date_sig);
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'by_status', (select jsonb_object_agg(status, n)
                  from (select status, count(*) n from public.event_observances group by status) x));
end
$fn$;
revoke all on function public.run_observance_link(text, timestamptz) from public, anon, authenticated;
grant execute on function public.run_observance_link(text, timestamptz) to service_role;

-- ===== 6. seed =====
insert into public.observances
  (slug, name, kind, tone, status, summary, founded_year, match_terms, window_days_before, window_days_after, sources)
values
  ('world-aids-day', 'World AIDS Day', 'day', 'memorial', 'published',
   'Held every 1 December since 1988 to remember people who died of AIDS-related illness and to push for HIV prevention, testing and treatment.',
   1988, array['world aids day','welt-?aids-?tag','journ[ée]e mondiale (de lutte contre le )?sida','d[ií]a mundial (de la lucha contra el )?sida','giornata mondiale (contro l.)?aids'],
   3, 3, '[{"url": "https://www.who.int/campaigns/world-aids-day", "checked": "2026-11-22"}]'::jsonb),
  ('transgender-day-of-remembrance', 'Transgender Day of Remembrance', 'day', 'memorial', 'published',
   'Held every 20 November to remember trans people killed by anti-trans violence. Founded in 1999 after the murder of Rita Hester.',
   1999, array['trans(gender)? day of remembrance','tdor','transgender gedenktag'], 7, 1, '[{"url": "https://glaad.org/tdor/", "checked": "2026-11-22", "unverifiable": true}, {"url": "https://en.wikipedia.org/wiki/Transgender_Day_of_Remembrance", "checked": "2026-11-22"}]'::jsonb),
  ('transgender-day-of-visibility', 'Transgender Day of Visibility', 'day', 'celebration', 'published',
   'Held every 31 March to recognise trans people and the discrimination they face.',
   2009, array['trans(gender)? day of visibility','tdov'], 3, 3, '[{"url": "https://transstudent.org/tdov/", "checked": "2026-11-22"}]'::jsonb),
  ('idahobit', 'IDAHOBIT', 'day', 'awareness', 'published',
   'The International Day Against Homophobia, Biphobia and Transphobia, held every 17 May — the date in 1990 the WHO removed homosexuality from its list of mental disorders.',
   2004, array['idahobi?t','idahotb','idahot','international day against homophobia'], 3, 3, '[{"url": "https://may17.org/faq/", "checked": "2026-11-22"}]'::jsonb),
  ('coming-out-day', 'Coming Out Day', 'day', 'celebration', 'published',
   'Held every 11 October, first observed in the United States in 1988.',
   1988, array['coming[- ]out[- ]day','coming-out-tag'], 4, 2, '[{"url": "https://www.hrc.org/press-releases/new-hrc-data-despite-political-headwinds-lgbtq-people-are-choosing-visibility-ahead-of-2026-midterms", "checked": "2026-11-22"}]'::jsonb),
  ('bi-visibility-day', 'Bi Visibility Day', 'day', 'celebration', 'published',
   'Held every 23 September to recognise bisexual people, first observed in 1999.',
   1999, array['bi(sexual)? visibility day','celebrate bisexuality day'], 3, 3, '[{"url": "https://bivisibilityday.com/", "checked": "2026-11-22"}]'::jsonb),
  ('lesbian-visibility-day', 'Lesbian Visibility Day', 'day', 'celebration', 'published',
   'Held every 26 April to recognise lesbians and their contributions.',
   null, array['lesbian visibility (day|week)'], 3, 3, '[{"url": "https://www.stonewall.org.uk/resources/lgbtq-hubs/lesbian-hub/lesbian-visibility-week", "checked": "2026-11-22"}, {"url": "https://www.lesbianvisibilityweek.com/", "checked": "2026-11-22"}]'::jsonb),
  ('intersex-awareness-day', 'Intersex Awareness Day', 'day', 'awareness', 'published',
   'Held every 26 October, marking the first public intersex demonstration in Boston in 1996.',
   1996, array['intersex awareness day'], 3, 3, '[{"url": "https://intersexday.org/en/", "checked": "2026-11-22"}]'::jsonb),
  ('spirit-day', 'Spirit Day', 'day', 'awareness', 'published',
   'Held on the third Thursday of October; people wear purple to stand against bullying of LGBTQ+ youth.',
   2010, array['spirit day'], 1, 1, '[{"url": "https://glaad.org/spiritday/", "checked": "2026-11-22", "unverifiable": true}, {"url": "https://en.wikipedia.org/wiki/Spirit_Day", "checked": "2026-11-22"}]'::jsonb),
  ('zero-discrimination-day', 'Zero Discrimination Day', 'day', 'awareness', 'published',
   'A UNAIDS day held every 1 March for equality before the law and in practice.',
   2014, array['zero discrimination day'], 3, 3, '[{"url": "https://www.unaids.org/en/zero-discrimination-day", "checked": "2026-11-22"}]'::jsonb),
  ('stonewall-anniversary', 'Stonewall anniversary', 'day', 'awareness', 'published',
   'Marks the start of the Stonewall uprising in New York on 28 June 1969.',
   1969, array['stonewall anniversary','anniversary of (the )?stonewall'], 3, 3, '[{"url": "https://www.nps.gov/ston/", "checked": "2026-11-22"}]'::jsonb),
  ('lgbt-history-month', 'LGBT+ History Month', 'month', 'awareness', 'published',
   'A month of LGBT+ history events. The month differs by country: February in the UK, October in the United States and Canada.',
   1994, array['lgbt(q|qia)?\+? history month','queer history month'], 0, 0, '[{"url": "https://lgbtplushistorymonth.co.uk/", "checked": "2026-11-22", "country": "GB"}, {"url": "https://lgbthistorymonth.com/background", "checked": "2026-11-22", "country": "US"}, {"url": "https://www.canada.ca/en/department-national-defence/maple-leaf/defence/2022/10/lgbt-history-month-importance-defence-team.html", "checked": "2026-11-22", "country": "CA"}]'::jsonb);

insert into public.observance_dates (observance_id, country_id, rule_type, month, day, nth, weekday)
select o.id, null, v.rule_type, v.month, v.day, v.nth, v.weekday
from (values
  ('world-aids-day', 'fixed', 12::smallint, 1::smallint, null::smallint, null::smallint),
  ('transgender-day-of-remembrance', 'fixed', 11, 20, null, null),
  ('transgender-day-of-visibility', 'fixed', 3, 31, null, null),
  ('idahobit', 'fixed', 5, 17, null, null),
  ('coming-out-day', 'fixed', 10, 11, null, null),
  ('bi-visibility-day', 'fixed', 9, 23, null, null),
  ('lesbian-visibility-day', 'fixed', 4, 26, null, null),
  ('intersex-awareness-day', 'fixed', 10, 26, null, null),
  ('spirit-day', 'nth_weekday', 10, null, 3, 4),
  ('zero-discrimination-day', 'fixed', 3, 1, null, null),
  ('stonewall-anniversary', 'fixed', 6, 28, null, null)
) v(slug, rule_type, month, day, nth, weekday)
join public.observances o on o.slug = v.slug;

insert into public.observance_dates (observance_id, country_id, rule_type, month)
select o.id, c.id, 'month', v.month
from (values ('GB', 2::smallint), ('US', 10), ('CA', 10)) v(code, month)
join public.countries c on c.code = v.code
cross join public.observances o
where o.slug = 'lgbt-history-month';

-- founding milestones + existing tags (by stable slug; null if absent, never guessed)
update public.observances o set founded_milestone_id = m.id
from (values
  ('world-aids-day', '1988-first-world-aids-day'),
  ('transgender-day-of-remembrance', '1999-transgender-day-of-remembrance-founded')
) v(slug, m_slug)
join public.milestones m on m.slug = v.m_slug and m.duplicate_of_id is null and m.status = 'published'
where o.slug = v.slug;

update public.observances o set tag_id = t.id
from (values
  ('transgender-day-of-remembrance', 'trans-day-of-remembrance'),
  ('transgender-day-of-visibility', 'transgender-day-of-visibility'),
  ('bi-visibility-day', 'bi-visibility-day'),
  ('world-aids-day', 'aids-awareness')
) v(slug, t_slug)
join public.unified_tags t on t.slug = v.t_slug and t.status = 'active'
where o.slug = v.slug;

-- ===== 7. registry + cron (starts in dry_run: proposes, never links) =====
insert into public.admin_automations
  (name, slug, action, enabled, trigger, schedule, conditions, managed_by, description, auto_pause_threshold)
values (
  'Link events to observances', 'observance_link',
  jsonb_build_object('type', 'cron', 'command', 'SELECT public.run_observance_link()', 'jobname', 'observance_link'),
  true, '{"type":"schedule"}'::jsonb, '25 3 * * *', '{"mode":"dry_run"}'::jsonb, 'system',
  'Nightly: links events to observances (World AIDS Day, TDoR, …) when the event TITLE names the day AND it starts inside that day''s window for the event''s country. Description-only or name-only -> review. conditions.mode: dry_run (everything -> review) | full (both signals -> linked; links that stop qualifying are demoted to review). Disabling this row (or switching to dry_run) stops new links and demotions, but links already made stay public; to unpublish, set those rows to rejected.',
  3
)
on conflict (slug) do nothing;

select cron.schedule('observance_link', '25 3 * * *', 'SELECT public.run_observance_link()');

-- ===== 8. postconditions =====
do $verify$
declare v_bad int; v_d date;
begin
  -- the date function, asserted on dates a human can check on a calendar
  select lower(public.observance_rule_range('nth_weekday', 2025, 10::smallint, null, 3::smallint, 4::smallint)) into v_d;
  if v_d is distinct from '2025-10-16'::date then raise exception 'P1 failed: Spirit Day 2025 = %', v_d; end if;
  select lower(public.observance_rule_range('nth_weekday', 2026, 10::smallint, null, 3::smallint, 4::smallint)) into v_d;
  if v_d is distinct from '2026-10-15'::date then raise exception 'P2 failed: Spirit Day 2026 = %', v_d; end if;
  select upper(public.observance_rule_range('month', 2028, 2::smallint, null, null, null)) - 1 into v_d;
  if v_d is distinct from '2028-02-29'::date then raise exception 'P3 failed: Feb 2028 ends %', v_d; end if;
  select lower(public.observance_rule_range('fixed', 2027, 2::smallint, 29::smallint, null, null)) into v_d;
  if v_d is distinct from '2027-02-28'::date then raise exception 'P3b failed: 29 Feb 2027 = %', v_d; end if;

  -- country rule wins; a country with no rule falls back to null for a month-only observance
  select lower(public.observance_occurrence(o.id, 2027, c.id)) into v_d
  from public.observances o, public.countries c where o.slug = 'lgbt-history-month' and c.code = 'GB';
  if v_d is distinct from '2027-02-01'::date then raise exception 'P4 failed: GB history month = %', v_d; end if;
  select lower(public.observance_occurrence(o.id, 2027, c.id)) into v_d
  from public.observances o, public.countries c where o.slug = 'lgbt-history-month' and c.code = 'US';
  if v_d is distinct from '2027-10-01'::date then raise exception 'P5 failed: US history month = %', v_d; end if;

  -- every published observance has at least one date rule
  select count(*) into v_bad from public.observances o
  where o.status = 'published' and not exists (select 1 from public.observance_dates r where r.observance_id = o.id);
  if v_bad <> 0 then raise exception 'P6 failed: % published observances without a date rule', v_bad; end if;

  -- a founding milestone, when set, is live (published, not a duplicate). A missing one is only a
  -- notice: the WAD fix may have skipped, and a rebuild from zero has no milestones yet.
  select count(*) into v_bad from public.observances o
  where o.founded_milestone_id is not null
    and not exists (select 1 from public.milestones m
                    where m.id = o.founded_milestone_id and m.status = 'published' and m.duplicate_of_id is null);
  if v_bad <> 0 then raise exception 'P7 failed: % founding milestones are not live', v_bad; end if;
  select count(*) into v_bad from public.observances
  where slug in ('world-aids-day', 'transgender-day-of-remembrance') and founded_milestone_id is null;
  if v_bad <> 0 then raise notice 'P7 notice: founding milestone unset on % of WAD/TDoR', v_bad; end if;

  -- 'idaho' alone must not match (the US state)
  if 'Idaho Pride Picnic' ~* (select '\m(' || array_to_string(match_terms, '|') || ')\M' from public.observances where slug = 'idahobit') then
    raise exception 'P8 failed: IDAHOBIT terms match the state of Idaho';
  end if;
  if not ('IDAHOBIT 2027' ~* (select '\m(' || array_to_string(match_terms, '|') || ')\M' from public.observances where slug = 'idahobit')) then
    raise exception 'P8b failed: IDAHOBIT terms do not match IDAHOBIT';
  end if;

  -- anon can read nothing it should not
  if has_function_privilege('anon', 'public.run_observance_link(text, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.run_observance_link(text, timestamptz)', 'EXECUTE') then
    raise exception 'P9 failed: anon or authenticated can execute the linker';
  end if;
  if has_table_privilege('anon', 'public.event_observances', 'INSERT') then
    raise exception 'P10 failed: anon can write event_observances';
  end if;
end $verify$;
