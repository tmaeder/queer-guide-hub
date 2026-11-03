-- The option list for the "Competed in" filter on /personalities.
--
-- The filter itself needs no RPC: /personalities filters through an embedded
-- inner join (personalities -> competition_entrants -> competition_editions ->
-- competitions), all three tables already anon-readable. What it needs is to
-- know WHICH competitions are worth offering. Of the competitions on record,
-- most title contests link almost no public personality (measured 2026-11-03:
-- drag_series 423 people, drag_pageant 8, trans_pageant 2, gay_title 1,
-- leather_title 1, drag_king 0), so a dropdown listing all of them is mostly
-- options that return "No personalities match". The only other source of that
-- answer is `competition_roster()`, which is ~130 KB gzipped — far too much to
-- fetch for a select box.
--
-- SECURITY INVOKER on purpose: the count must see `personalities` exactly as
-- the caller does (visibility, RLS, safety gating), so the list can never offer
-- a competition whose only linked people the caller is not allowed to see. A
-- DEFINER aggregate here would count rows the filter then hides. Same
-- predicate as the list query: public and not a duplicate.
--
-- `people` counts DISTINCT personalities, because a queen who returned for an
-- All Stars season is one person with two entrant rows.

create or replace function public.competition_personality_counts()
returns table (slug text, name text, category text, people integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.slug, c.name, c.category::text, count(distinct p.id)::integer as people
    from public.competitions c
    join public.competition_editions ed on ed.competition_id = c.id
    join public.competition_entrants e on e.edition_id = ed.id
    join public.personalities p on p.id = e.personality_id
   where p.visibility = 'public'
     and p.duplicate_of_id is null
   group by c.slug, c.name, c.category
  having count(distinct p.id) > 0
   order by c.category, count(distinct p.id) desc, c.name;
$$;

revoke all on function public.competition_personality_counts() from public;
grant execute on function public.competition_personality_counts() to anon, authenticated, service_role;

comment on function public.competition_personality_counts() is
  'Competitions with at least one linked public, non-duplicate personality, with the distinct count. Backs the "Competed in" filter on /personalities. SECURITY INVOKER so the count matches what the caller can see.';

-- The same count per CATEGORY, for the "People" links on the /personalities
-- line key, plus ONE overall row (`category = 'any'`) for "Any competition".
-- Neither can be summed from the rows above it: a queen on both RuPaul's Drag
-- Race and All Stars is one person in drag_series, and a person who competed
-- in a drag series and a pageant is one person overall. GROUPING SETS gives
-- every level its own DISTINCT count in a single scan. `any` cannot collide
-- with a category id: none of the competition categories is named 'any'.
-- Same predicate, same invoker semantics.
create or replace function public.competition_category_personality_counts()
returns table (category text, people integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case when grouping(c.category) = 1 then 'any' else c.category::text end as category,
         count(distinct p.id)::integer as people
    from public.competitions c
    join public.competition_editions ed on ed.competition_id = c.id
    join public.competition_entrants e on e.edition_id = ed.id
    join public.personalities p on p.id = e.personality_id
   where p.visibility = 'public'
     and p.duplicate_of_id is null
   group by grouping sets ((c.category), ())
  having count(distinct p.id) > 0
   order by grouping(c.category), c.category;
$$;

revoke all on function public.competition_category_personality_counts() from public;
grant execute on function public.competition_category_personality_counts() to anon, authenticated, service_role;

comment on function public.competition_category_personality_counts() is
  'Distinct linked public, non-duplicate personalities per competition category, plus an overall row with category = ''any''. Backs the People links on the /personalities line key and the Competed in counts. SECURITY INVOKER.';

do $verify$
declare
  v_def boolean;
  v_fn text;
  v_rows integer;
begin
  foreach v_fn in array array[
    'public.competition_personality_counts()',
    'public.competition_category_personality_counts()'
  ] loop
    select p.prosecdef into v_def from pg_proc p where p.oid = v_fn::regprocedure;
    if v_def then
      raise exception '% must be SECURITY INVOKER', v_fn;
    end if;
    if not has_function_privilege('anon', v_fn, 'execute') then
      raise exception '% must be executable by anon', v_fn;
    end if;
  end loop;
  -- Both execute, so a planning error surfaces at apply time rather than as a
  -- 400 on the page. No row-count floor: an empty corpus is a valid state.
  select count(*) into v_rows from public.competition_personality_counts();
  select count(*) into v_rows from public.competition_category_personality_counts();
end
$verify$;
