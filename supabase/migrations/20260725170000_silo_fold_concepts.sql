-- P5 fold: materialize governed concepts for silo vocabulary terms not yet in the
-- unified graph (the 82 'unmapped' crosswalk rows minus 6 that collide on slug with an
-- existing deprecated tag — those are skipped, never duplicated). Additive + fully
-- reversible: every created concept is recorded in silo_fold_audit (a durable
-- silo_id <-> tag_id crosswalk the eventual reader cut-over will consume). Concepts are
-- non-indexable (seo_indexable=false, no SEO surface) and human_reviewed=true so the
-- nightly unused-tag prune never reaps this curated vocabulary. NO reader is touched and
-- the silo lookup tables are left in place — this is the "fold" half of P5, not the cut-over.

create table if not exists public.silo_fold_audit (
  tag_id uuid primary key references public.unified_tags(id) on delete cascade,
  silo text not null,
  silo_id uuid,
  silo_name text,
  facet text,
  created_at timestamptz not null default now()
);
comment on table public.silo_fold_audit is
  'Durable crosswalk: which unified_tags concept was folded from which silo lookup row (P5). Reverse via unfold_silo_terms().';

-- Fold: create one concept per unmapped silo term (skip slug collisions). Idempotent —
-- re-running only creates terms that still have no matching tag.
create or replace function public.fold_silo_terms()
returns table(created int, skipped int)
language plpgsql security definer set search_path = public as $$
declare r record; v_created int := 0; v_skip int := 0; v_id uuid;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'silo-fold', true);
  for r in
    select silo, facet, silo_id, silo_name, derived_slug
    from public.v_silo_concept_crosswalk
    where match_kind = 'unmapped'
    order by silo, silo_name
  loop
    v_id := null;
    -- ON CONFLICT on the FINAL (post-trigger) slug: the unified_tags slug normalizers
    -- rewrite the slug on insert, so a pre-check against the crosswalk's derived_slug is
    -- unreliable. Let the unique index be the authority — a collision (e.g. an existing
    -- deprecated tag) is skipped, never duplicated.
    insert into public.unified_tags
      (name, slug, category, category_id, status, human_reviewed, seo_indexable, is_sensitive, is_adult, description)
    values (
      r.silo_name, r.derived_slug,
      case r.silo
        when 'venue_categories'        then 'Venue Category'
        when 'venue_services'          then 'Venue Service'
        when 'event_types'             then 'Event Type'
        when 'event_amenities'         then 'Event Amenity'
        when 'event_services'          then 'Event Service'
        when 'accessibility_attributes' then 'Accessibility'
        when 'target_groups'           then 'Audience'
        when 'professions'             then 'Profession'
        else 'Vocabulary'
      end,
      null,               -- leave category_id NULL: avoids the category-assignment sync trigger
      'active', true, false, false,
      (lower(r.silo_name) like '%adult%'),   -- flag 'Adult performer' etc. for SafeMode filtering
      'Vocabulary concept folded from the ' || r.silo || ' catalog (P5).'
    )
    on conflict (slug) do nothing
    returning id into v_id;
    if v_id is null then
      v_skip := v_skip + 1;
    else
      insert into public.silo_fold_audit(tag_id, silo, silo_id, silo_name, facet)
      values (v_id, r.silo, r.silo_id, r.silo_name, r.facet);
      v_created := v_created + 1;
    end if;
  end loop;
  return query select v_created, v_skip;
end $$;

-- Reverse: deprecate every folded concept (audit kept as the record of what was folded).
create or replace function public.unfold_silo_terms()
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'silo-fold', true);
  with del as (
    update public.unified_tags u
      set status = 'deprecated', deprecation_reason = 'unfolded silo concept (P5 reverse)'
    from public.silo_fold_audit a
    where a.tag_id = u.id and u.status <> 'deprecated'
    returning u.id
  )
  select count(*) into v_n from del;
  return v_n;
end $$;

revoke all on function public.fold_silo_terms()   from public;
revoke all on function public.unfold_silo_terms() from public;
grant execute on function public.fold_silo_terms()   to service_role;
grant execute on function public.unfold_silo_terms() to service_role;
