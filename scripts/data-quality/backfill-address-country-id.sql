-- Address completeness, phase 0: resolve country_id / city_id relationally.
-- Pure SQL, no network. Run each block in a loop until it reports 0 rows.
--
-- WHY BATCHED AT 300: measured on prod 2026-08-07, a 300-row events UPDATE takes
-- 14.6s, of which 13.8s is trg_search_documents_event alone (~46ms/row). The
-- other seven triggers together cost ~150ms. statement_timeout is 2min, so 300
-- is roughly seven batches per window; do NOT raise the batch size to "go
-- faster" — you will just trip the timeout mid-statement.
--
-- Do NOT wrap these in a migration. Migrations run in one transaction and this
-- loop would hold locks for its entire runtime.
--
-- NOTE: events.country and venues.country hold ISO-2 CODES ('DE', 'FR'), not
-- names — venues even has a CHECK constraint enforcing it.
--
-- Country text is resolved through public.resolve_country_from_text(country, city),
-- NEVER with a bare `upper(code) = upper(country)`. Two dozen US state and
-- Canadian province abbreviations are also valid ISO country codes, and the
-- first pass of this backfill confidently produced Agawam MA -> Morocco,
-- Sturgis SD -> Sudan, Tuscaloosa AL -> Albania, Petaluma CA -> Canada. Two of
-- those are criminalizing countries, so the safety layer hid real US events.
-- The resolver demands city corroboration for ambiguous codes and returns NULL
-- instead of guessing. Do not "optimise" it back into a plain join.

-- ---------------------------------------------------------------------------
-- 0a. events.country_id  (~26,800 rows)
-- ---------------------------------------------------------------------------
do $$
declare v_n int; i int;
begin
  for i in 1..7 loop
    update public.events e
       set country_id = sub.cid, updated_at = now()
    from (
      select e2.id,
        coalesce(
          (select c.country_id from public.cities c where c.id = e2.city_id),
          public.resolve_country_from_text(e2.country, e2.city)
        ) as cid
      from public.events e2
      where e2.country_id is null
        and e2.duplicate_of_id is null
        and coalesce(btrim(e2.country),'') <> ''
      limit 300
    ) sub
    where e.id = sub.id and sub.cid is not null;
    get diagnostics v_n = row_count;
    commit;
    exit when v_n = 0;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 0b. events.city_id — MUST run after 0a. Country scoping is what makes the
--     name match safe; unscoped, "Springfield" and "Valencia" land anywhere.
-- ---------------------------------------------------------------------------
do $$
declare v_n int; i int;
begin
  for i in 1..7 loop
    update public.events e
       set city_id = sub.cid, updated_at = now()
    from (
      select e2.id,
        (select c.id from public.cities c
          where lower(c.name) = lower(btrim(e2.city))
            and c.country_id = e2.country_id
            and c.duplicate_of_id is null
            and (c.slug is null or c.slug not like 'tmp-%')
          order by c.population desc nulls last
          limit 1) as cid
      from public.events e2
      where e2.city_id is null
        and e2.country_id is not null
        and e2.duplicate_of_id is null
        and coalesce(btrim(e2.city),'') <> ''
      limit 300
    ) sub
    where e.id = sub.id and sub.cid is not null;
    get diagnostics v_n = row_count;
    commit;
    exit when v_n = 0;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 0c. venues.country_id — same ladder. (scripts/data-quality/backfill-venue-
--     country-id.sql covers only venues WITH coordinates; this one does not
--     require them.)
-- ---------------------------------------------------------------------------
do $$
declare v_n int; i int;
begin
  for i in 1..7 loop
    update public.venues v
       set country_id = sub.cid, updated_at = now()
    from (
      select v2.id,
        coalesce(
          (select c.country_id from public.cities c where c.id = v2.city_id),
          public.resolve_country_from_text(v2.country, v2.city)
        ) as cid
      from public.venues v2
      where v2.country_id is null
        and v2.duplicate_of_id is null
      limit 300
    ) sub
    where v.id = sub.id and sub.cid is not null;
    get diagnostics v_n = row_count;
    commit;
    exit when v_n = 0;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 0d. hotels / organizations — tiny, single pass. Organizations with neither a
--     city nor a country are genuinely unresolvable; leave them NULL rather
--     than inventing a location.
-- ---------------------------------------------------------------------------
update public.hotels h
   set country_id = c.country_id
from public.cities c
where c.id = h.city_id and h.country_id is null and c.country_id is not null;

update public.organizations o
   set country_id = c.country_id
from public.cities c
where c.id = o.city_id and o.country_id is null and c.country_id is not null;

-- Progress check
select 'events_country_id' as k, count(*) from public.events where country_id is null and duplicate_of_id is null
union all select 'events_city_id',  count(*) from public.events where city_id is null and duplicate_of_id is null
union all select 'venues_country_id', count(*) from public.venues where country_id is null and duplicate_of_id is null;
