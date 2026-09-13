-- Sentinel for the inline-glossary-link vocabulary.
--
-- STANDALONE, deliberately, rather than a new key on `tag_hygiene_stats()`:
-- restating that function's body to add a counter is a merge-collision surface
-- (two sessions touching it produce a conflict that resolves by silently losing
-- one counter), and adding a hygiene key there is a four-layer change. Follows
-- `venue_dup_signals` / `news_image_signals` / `styleguide_signals` instead.
--
-- The reporting shape matters as much as the counts. `terms_active` is returned
-- SEPARATELY from every violation count, because an empty vocabulary and a clean
-- vocabulary both make the violations zero — and an unshipped feature reading as
-- a healthy one is the failure mode `accessibility_contradictions` was built to
-- avoid. `view_present` is likewise distinct from a zero count: a dropped view
-- must not look like a corpus with nothing wrong in it.

create or replace function public.glossary_link_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with terms as (
    select t.id, t.status, t.surface_form, t.rejection_reason, u.id as tag_id,
           u.status as tag_status, u.merged_into_id, u.seo_indexable,
           u.is_adult, u.is_sensitive, u.verification_status,
           coalesce(
             nullif(btrim(coalesce(u.description, '')), ''),
             nullif(btrim(coalesce(u.short_description, '')), ''),
             nullif(btrim(coalesce(u.long_description, '')), '')
           ) as prose
      from public.glossary_link_terms t
      left join public.unified_tags u on u.id = t.tag_id
  )
  select jsonb_build_object(
    -- Coverage, reported on its own so "no violations" can never be mistaken
    -- for "the vocabulary is live".
    'terms_active',    (select count(*) from terms where status = 'active'),
    'terms_candidate', (select count(*) from terms where status = 'candidate'),
    'terms_rejected',  (select count(*) from terms where status = 'rejected'),
    'view_present',    (to_regclass('public.glossary_link_terms_public') is not null),

    -- Zero-tolerance. An active term pointing at a tag that no longer resolves
    -- is a dead link in body prose — the failure InfographicTermChip's header
    -- names: "a figure must not be able to emit a dead link".
    'dead_link_terms', (
      select count(*) from terms
       where status = 'active'
         and (tag_id is null or tag_status <> 'active' or merged_into_id is not null)
    ),

    -- An adult or anon-gated term must never be injected into prose: an inline
    -- link has no affirmation step, unlike the FromTheGlossary rail.
    'adult_or_gated_terms', (
      select count(*) from terms
       where status = 'active'
         and (coalesce(is_adult, false)
              or public.tag_is_anon_gated(is_sensitive, verification_status))
    ),

    -- Linking to an entry with no definition is worse than not linking; and a
    -- deindexed target passes no crawl equity, which is half the point.
    'definitionless_terms', (
      select count(*) from terms where status = 'active' and prose is null
    ),
    'deindexed_terms', (
      select count(*) from terms where status = 'active' and not coalesce(seo_indexable, false)
    ),

    -- A refusal with no reason is what makes the next reviewer re-litigate it.
    'reasonless_rejections', (
      select count(*) from terms
       where status = 'rejected'
         and nullif(btrim(coalesce(rejection_reason, '')), '') is null
    ),

    -- Backstop under the human review. The measured worst case was a real
    -- active, indexable tag named "A" that matched 747 of 800 city
    -- descriptions; the TypeScript matcher refuses anything this short too, so
    -- neither layer is load-bearing alone.
    'short_surface_forms', (
      select count(*) from terms
       where status = 'active' and length(btrim(surface_form)) < 3
    )
  );
$$;

comment on function public.glossary_link_signals() is
  'Sentinel for glossary_link_terms. dead_link_terms / adult_or_gated_terms / definitionless_terms / reasonless_rejections / short_surface_forms are zero-invariants with no baseline allowance. terms_active and view_present are reported separately so an unshipped vocabulary cannot read as a clean one.';

revoke all on function public.glossary_link_signals() from public;
grant execute on function public.glossary_link_signals() to service_role;

do $verify$
declare v jsonb;
begin
  v := public.glossary_link_signals();
  if (v->>'view_present') is distinct from 'true' then
    raise exception 'glossary_link_terms_public missing: %', v;
  end if;
  -- Every zero-invariant must be present as a key, not merely zero: a key the
  -- health script asks for and does not get reads as "no problem found".
  if not (v ? 'dead_link_terms' and v ? 'adult_or_gated_terms'
          and v ? 'definitionless_terms' and v ? 'reasonless_rejections'
          and v ? 'short_surface_forms' and v ? 'terms_active') then
    raise exception 'glossary_link_signals is missing a key: %', v;
  end if;
  if (v->>'dead_link_terms')::int <> 0 or (v->>'adult_or_gated_terms')::int <> 0 then
    raise exception 'glossary_link_signals not clean on a freshly created table: %', v;
  end if;
end $verify$;
