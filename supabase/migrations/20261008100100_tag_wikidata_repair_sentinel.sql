-- Regression sentinel for the wrong-entity Wikidata repair (20261008100000).
--
-- The repair clears 1,535 identifiers; `tag-enrichment-sweep` runs on a cron and its
-- work-list selector is `wikidata_id is null and wikipedia_url is null`, i.e. EXACTLY
-- the rows the repair just created. So the sweep will revisit every cleared tag, and if
-- the guard in `_shared/tag-wiki-guard.ts` is ever weakened, bypassed or deployed late,
-- the cohort regrows silently and the weekly `tag_medical_codes_sync` and
-- `tag_wikidata_hierarchy` jobs rebuild the wrong facts on top of it.
--
-- The sentinel fires only when a cleared tag re-acquires **the same identifier it was
-- cleared of**. A DIFFERENT id is a human or a corrected resolver doing the right
-- thing, and failing on that would make the repair a permanent ban on ever linking
-- these tags — which is the opposite of the intent. Equality is the whole predicate.
create or replace function public.tag_wikidata_repair_regressions()
returns table (slug text, wikidata_id text, cleared_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.slug, u.wikidata_id, a.repaired_at
    from public.tag_wikidata_repair_audit a
    join public.unified_tags u on u.id = a.tag_id
   where a.disposition = 'cleared'
     and u.wikidata_id is not null
     and u.wikidata_id = a.previous_wikidata_id
   order by u.slug
$$;

comment on function public.tag_wikidata_repair_regressions() is
  'Tags whose wrong Wikidata id came back after the 2026-08-29 repair. Non-empty means the tag-enrichment-sweep name-resolution guard is not holding. A different id is not a regression and is deliberately not reported.';

revoke all on function public.tag_wikidata_repair_regressions() from public, anon, authenticated;
grant execute on function public.tag_wikidata_repair_regressions() to service_role;

do $verify$
declare v_n int;
begin
  select count(*) into v_n from public.tag_wikidata_repair_regressions();
  if v_n > 0 then
    raise exception 'tag wikidata repair sentinel: % cleared tag(s) already carry their old identifier again', v_n;
  end if;
end $verify$;
