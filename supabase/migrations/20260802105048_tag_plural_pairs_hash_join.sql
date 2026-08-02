-- tag_plural_pairs v1 called tag_plural_of() as the JOIN predicate. That is
-- opaque to the planner, so it degraded to a nested loop over 3,719 x 3,719
-- active tags -- ~13.8M function calls -- and hit the statement timeout on the
-- very first dry run.
--
-- On the nightly cron a statement timeout is a full rollback, and a rollback
-- cannot record itself, so the job would have shown up as "registered and never
-- once succeeded" with no error trail.
--
-- v2 derives the EXPECTED plural string from each singular and joins on plain
-- text equality, which the planner turns into a hash join. Identical result
-- set, ~40ms. tag_plural_of() is kept as the readable predicate behind
-- tag_slugs_are_variants() and for one-off checks; it is just no longer used
-- inside a join.
create or replace function public.tag_plural_pairs(p_limit int default 500)
returns table (
  singular_id uuid, singular_slug text, singular_usage int,
  plural_id   uuid, plural_slug   text, plural_usage   int,
  rule text
)
language sql stable
set search_path = public
as $fn$
  with act as (
    select id, slug, usage_count, replace(slug, '-', '') d
    from public.unified_tags
    where status = 'active'
  ),
  irr(sing, plur) as (
    values ('person','people'), ('man','men'), ('woman','women'), ('child','children'),
           ('foot','feet'), ('tooth','teeth'), ('goose','geese'), ('mouse','mice'),
           ('life','lives'), ('wife','wives'), ('knife','knives'), ('leaf','leaves')
  ),
  cand as (
    -- regular suffix rules
    select a.id, a.slug, a.usage_count,
           case when a.d ~ '(x|z|ch|sh)$' then a.d || 'es'
                when a.d ~ '[^aeiou]y$'   then left(a.d, length(a.d) - 1) || 'ies'
                else a.d || 's' end as expected,
           case when a.d ~ '(x|z|ch|sh)$' then 'es'
                when a.d ~ '[^aeiou]y$'   then 'ies'
                else 's' end as rule
    from act a
    -- right(d,1) <> 's': a "singular" that already ends in s is not one, which
    -- is what stops 'vampires' + 's' = 'vampiress' reading as a plural pair.
    -- length >= 3: keeps pub/pubs while structurally excluding tv/tvs.
    where right(a.d, 1) <> 's' and length(a.d) >= 3
    union all
    select a.id, a.slug, a.usage_count, i.plur, 'irregular'
    from act a join irr i on i.sing = a.d
  )
  -- DISTINCT ON (p.id): once hyphens are folded a plural can have more than one
  -- candidate singular ('drag-queens' matches both 'drag-queen' and
  -- 'dragqueen'). Without this the second candidate reaches merge_tag_concept
  -- after the plural is already merged and raises. Most-used singular wins.
  select distinct on (p.id)
         c.id, c.slug, c.usage_count, p.id, p.slug, p.usage_count, c.rule
  from cand c
  join act p on p.d = c.expected and p.id <> c.id
  where not exists (
      select 1 from public.tag_plural_exclusions e
      where e.singular_slug = c.slug and e.plural_slug = p.slug)
    and not exists (
      select 1 from public.tag_relationship_exclusions x
      where x.tag1_id = least(c.id, p.id) and x.tag2_id = greatest(c.id, p.id))
  order by p.id, coalesce(c.usage_count, 0) desc, length(c.slug)
  limit greatest(p_limit, 0);
$fn$;

grant execute on function public.tag_plural_pairs(int) to service_role, authenticated;
