-- Spots P1: parent links on the spine, and spot_id on the five tables that link to an org.
--
-- Spec: docs/superpowers/specs/2026-11-22-spots-unification-design.md
-- Plan: docs/superpowers/plans/2026-11-22-spots-unification.md (P1)
-- Gate: merge only after spots_drift_log shows seven consecutive nightly zeros (P0 merged
--       2026-11-22, so not before 2026-11-29).
--
-- 1. spots.parent_id mirrors venues.organization_id. Today every venue with an org points at
--    it, shadows included (106,389 rows); once P2 folds the 104k shadows and nulls their
--    organization_id, only chain branches keep a parent. One rule, no "is this a chain"
--    query inside the sync trigger.
--    NO foreign key on parent_id: spots_sync runs inside every venue write, and an FK
--    violation there would abort the venue write itself. The drift check reports bad parents
--    instead (not an organization, or itself parented; a missing one shows as missing_orgs).
--
-- 2. spot_id on hotels / marketplace_merchants / marketplace_brands / news_sources /
--    affiliate_partners, FK -> spots(id) ON DELETE SET NULL (same action as their
--    organization_id FK). A BEFORE trigger derives it from organization_id, so every existing
--    linking path (link_organization_entity, the business console, importers) keeps working
--    unchanged. A writer that sets spot_id itself in the same statement wins: P2 needs that,
--    to null a shadow organization_id and point spot_id at the venue in one UPDATE.
--    764 rows are linked today (hotels 209, merchants 111, brands 385, news 45, partners 14).
--
-- Adding a column changes the spots row type, so the two projection helpers, spots_sync and
-- spots_drift_check are restated in this same file; split across files, the helpers would
-- return a row of the wrong width between migrations and break every venue write.

set lock_timeout = '10s';

-- Lock order is load-bearing. The first prod dry run DEADLOCKED: it held spots (from the
-- ALTER below) and then waited on news_sources, while live traffic held news_sources and
-- waited on spots. Taking the five link tables first, then spots, means this migration
-- waits for that traffic instead of forming a cycle with it.
--
-- Retried, not tried once: the second dry run hit lock_timeout behind a schema-dump session
-- (`dumpFunc` over Supavisor, idle in transaction for 100s holding ACCESS SHARE on all six
-- tables). Drift and object-dump CI jobs run around merges, so a single 10s attempt would
-- fail db push on main. Each failed attempt rolls back to its savepoint and releases what it
-- took. Worst case ~6 minutes, then a clear error.
do $lock$
declare
  i integer;
begin
  for i in 1..24 loop
    begin
      lock table public.hotels, public.marketplace_merchants, public.marketplace_brands,
        public.news_sources, public.affiliate_partners in access exclusive mode;
      lock table public.spots in access exclusive mode;
      return;
    exception when lock_not_available then
      perform pg_sleep(5);
    end;
  end loop;
  raise exception 'spots P1: could not lock the link tables and spots after 24 attempts';
end
$lock$;

alter table public.spots add column parent_id uuid;
create index spots_parent_idx on public.spots (parent_id) where parent_id is not null;

create or replace function public.spots_from_venue(v public.venues)
returns public.spots
language sql
stable
as $$
  select row(
    v.id, 'place', '{}'::text[], coalesce(v.slug, v.id::text), coalesce(v.name, ''), v.category,
    v.city_id, v.country_id, v.latitude, v.longitude, coalesce(v.safety_gated, false),
    v.duplicate_of_id, case when v.closed_at is not null then 'closed' else 'active' end,
    coalesce(v.created_at, 'epoch'::timestamptz), null::timestamptz, v.organization_id
  )::public.spots
$$;

create or replace function public.spots_from_org(o public.organizations)
returns public.spots
language sql
stable
as $$
  select row(
    o.id, 'organization', coalesce(o.roles, '{}'::text[]), coalesce(o.slug, o.id::text),
    coalesce(o.name, ''), null::text, o.city_id, o.country_id, o.latitude::numeric,
    o.longitude::numeric, coalesce(o.safety_gated, false), o.duplicate_of_id,
    coalesce(o.status, 'active'), coalesce(o.created_at, 'epoch'::timestamptz), null::timestamptz,
    null::uuid
  )::public.spots
$$;

create or replace function public.spots_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.spots;
  r_old public.spots;
begin
  if tg_op = 'DELETE' then
    delete from public.spots where id = old.id;
    return null;
  end if;

  if tg_table_name = 'venues' then
    r := public.spots_from_venue(new);
    if tg_op = 'UPDATE' then r_old := public.spots_from_venue(old); end if;
  else
    r := public.spots_from_org(new);
    if tg_op = 'UPDATE' then r_old := public.spots_from_org(old); end if;
  end if;

  if tg_op = 'UPDATE' and r is not distinct from r_old and old.id = new.id then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.id <> new.id then
    delete from public.spots where id = old.id;
  end if;

  r.updated_at := now();
  insert into public.spots values (r.*)
  on conflict (id) do update set
    kind = excluded.kind, roles = excluded.roles, slug = excluded.slug, name = excluded.name,
    category = excluded.category, city_id = excluded.city_id, country_id = excluded.country_id,
    latitude = excluded.latitude, longitude = excluded.longitude,
    safety_gated = excluded.safety_gated, duplicate_of_id = excluded.duplicate_of_id,
    status = excluded.status, created_at = excluded.created_at, updated_at = excluded.updated_at,
    parent_id = excluded.parent_id;
  return null;
end;
$$;

update public.spots s set parent_id = v.organization_id
from public.venues v
where v.id = s.id and v.organization_id is not null;

create function public.spots_link_from_org()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    if new.spot_id is null then new.spot_id := new.organization_id; end if;
  elsif new.organization_id is distinct from old.organization_id
        and new.spot_id is not distinct from old.spot_id then
    new.spot_id := new.organization_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.spots_link_from_org() from public, anon, authenticated;

do $links$
declare
  t text;
begin
  foreach t in array array['hotels', 'marketplace_merchants', 'marketplace_brands',
                           'news_sources', 'affiliate_partners'] loop
    execute format('alter table public.%I add column spot_id uuid references public.spots(id) on delete set null', t);
    execute format('create index %I on public.%I (spot_id) where spot_id is not null', t || '_spot_id_idx', t);
    execute format('create trigger trg_spots_link before insert or update of organization_id, spot_id on public.%I '
                   'for each row execute function public.spots_link_from_org()', t);
    -- Only where the org has a spot: the CI snapshot (scripts/ci/db-snapshot.sh) is a capped
    -- sample loaded with FKs off, so organization_id can point at a row it does not hold.
    -- On prod every organization has its spot (P0 drift 0), so this links every row.
    execute format('update public.%I set spot_id = organization_id where organization_id is not null '
                   'and exists (select 1 from public.spots s where s.id = organization_id)', t);
  end loop;
end
$links$;

create or replace function public.spots_drift_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_detail jsonb;
  v_total integer;
begin
  select jsonb_build_object(
    'missing_venues', (select count(*) from venues v where not exists (select 1 from spots s where s.id = v.id)),
    'missing_orgs',   (select count(*) from organizations o where not exists (select 1 from spots s where s.id = o.id)),
    'orphans',        (select count(*) from spots s
                        where not exists (select 1 from venues v where v.id = s.id)
                          and not exists (select 1 from organizations o where o.id = s.id)),
    'stale_venues',   (select count(*) from venues v join spots s on s.id = v.id
                        where row(s.id, s.kind, s.roles, s.slug, s.name, s.category, s.city_id, s.country_id,
                                  s.latitude, s.longitude, s.safety_gated, s.duplicate_of_id, s.status,
                                  s.created_at, null::timestamptz, s.parent_id)::public.spots
                              is distinct from public.spots_from_venue(v)),
    'stale_orgs',     (select count(*) from organizations o join spots s on s.id = o.id
                        where row(s.id, s.kind, s.roles, s.slug, s.name, s.category, s.city_id, s.country_id,
                                  s.latitude, s.longitude, s.safety_gated, s.duplicate_of_id, s.status,
                                  s.created_at, null::timestamptz, s.parent_id)::public.spots
                              is distinct from public.spots_from_org(o)),
    'bad_parents',    (select count(*) from spots c
                        left join spots p on p.id = c.parent_id
                        -- A parent missing from spots is reported by missing_orgs (prod FKs make a
                        -- dangling one impossible); counting it here would fire on the CI snapshot,
                        -- which samples spots and organizations independently.
                        where c.parent_id is not null
                          and (p.kind <> 'organization' or p.parent_id is not null)),
    'stale_links',    (select sum(n) from (
                         select count(*) n from hotels where organization_id is not null and spot_id is distinct from organization_id and exists (select 1 from spots s where s.id = organization_id)
                         union all select count(*) from marketplace_merchants where organization_id is not null and spot_id is distinct from organization_id and exists (select 1 from spots s where s.id = organization_id)
                         union all select count(*) from marketplace_brands where organization_id is not null and spot_id is distinct from organization_id and exists (select 1 from spots s where s.id = organization_id)
                         union all select count(*) from news_sources where organization_id is not null and spot_id is distinct from organization_id and exists (select 1 from spots s where s.id = organization_id)
                         union all select count(*) from affiliate_partners where organization_id is not null and spot_id is distinct from organization_id and exists (select 1 from spots s where s.id = organization_id)
                       ) x)
  ) into v_detail;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(v_detail);
  insert into public.spots_drift_log (drift_count, detail) values (v_total, v_detail);
  delete from public.spots_drift_log where run_at < now() - interval '60 days';
  return jsonb_build_object('drift_count', v_total, 'detail', v_detail);
end;
$$;

revoke execute on function public.spots_drift_check() from public, anon, authenticated;

-- Postconditions scoped to what P1 changed. The P0 arms of the drift check (missing/stale
-- venues and orgs) were verified when P0 applied; asserting the global drift_count here fails on
-- the CI snapshot, which samples spots, venues and orgs independently (max 3,000 rows each).
do $verify$
declare
  v jsonb;
  v_bad bigint;
  v_linked bigint;
  v_eligible bigint;
begin
  v := public.spots_drift_check() -> 'detail';
  if coalesce((v ->> 'bad_parents')::bigint, 0) <> 0 or coalesce((v ->> 'stale_links')::bigint, 0) <> 0 then
    raise exception 'spots P1 links inconsistent: bad_parents=%, stale_links=%',
      v ->> 'bad_parents', v ->> 'stale_links';
  end if;

  -- Every spot of a venue mirrors that venue's organization_id.
  select count(*) into v_bad
    from public.spots s join public.venues v2 on v2.id = s.id
   where s.parent_id is distinct from v2.organization_id;
  if v_bad <> 0 then
    raise exception 'parent_id differs from venues.organization_id on % spots', v_bad;
  end if;

  select (select count(*) from public.hotels where spot_id is not null)
       + (select count(*) from public.marketplace_merchants where spot_id is not null)
       + (select count(*) from public.marketplace_brands where spot_id is not null)
       + (select count(*) from public.news_sources where spot_id is not null)
       + (select count(*) from public.affiliate_partners where spot_id is not null)
    into v_linked;
  select (select count(*) from public.hotels h where exists (select 1 from public.spots s where s.id = h.organization_id))
       + (select count(*) from public.marketplace_merchants m where exists (select 1 from public.spots s where s.id = m.organization_id))
       + (select count(*) from public.marketplace_brands b where exists (select 1 from public.spots s where s.id = b.organization_id))
       + (select count(*) from public.news_sources n where exists (select 1 from public.spots s where s.id = n.organization_id))
       + (select count(*) from public.affiliate_partners a where exists (select 1 from public.spots s where s.id = a.organization_id))
    into v_eligible;
  if v_linked <> v_eligible then
    raise exception 'spot_id backfilled on % rows, % rows have an org with a spot', v_linked, v_eligible;
  end if;
  if v_eligible > 0 and v_linked = 0 then
    raise exception 'no spot_id was backfilled — the link loop did nothing';
  end if;
end
$verify$;
