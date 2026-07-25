-- Load actionable near-duplicate pairs into tag_merge_review. Actionable = both endpoints active,
-- similarity >= threshold, not an exclusion, not already queued. Canonical = higher usage_count
-- (tie: shorter slug, then older). lexical_variant drives the auto-merge guard in Task 4.
create or replace function public.refresh_tag_merge_candidates(p_min_similarity numeric default 0.90)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  with pairs as (
    select tr.tag1_id, tr.tag2_id, tr.similarity_score,
           a.slug sa, a.usage_count ua, a.created_at ca,
           b.slug sb, b.usage_count ub, b.created_at cb
    from public.tag_relationships tr
    join public.unified_tags a on a.id = tr.tag1_id and a.status = 'active'
    join public.unified_tags b on b.id = tr.tag2_id and b.status = 'active'
    where tr.similarity_score >= p_min_similarity
      and not exists (select 1 from public.tag_relationship_exclusions e
         where e.tag1_id = least(tr.tag1_id,tr.tag2_id) and e.tag2_id = greatest(tr.tag1_id,tr.tag2_id))
  ), chosen as (
    select
      case when ua > ub or (ua = ub and length(sa) < length(sb))
             or (ua = ub and length(sa) = length(sb) and ca <= cb)
           then tag1_id else tag2_id end as canonical_id,
      case when ua > ub or (ua = ub and length(sa) < length(sb))
             or (ua = ub and length(sa) = length(sb) and ca <= cb)
           then tag2_id else tag1_id end as duplicate_id,
      similarity_score,
      public.tag_slugs_are_variants(sa, sb) as lexical_variant
    from pairs
  )
  insert into public.tag_merge_review (canonical_id, duplicate_id, similarity, lexical_variant, reason)
  select canonical_id, duplicate_id, similarity_score, lexical_variant, 'proposer: embedding similarity'
  from chosen c
  where not exists (
    select 1 from public.tag_merge_review r
    where least(r.canonical_id,r.duplicate_id) = least(c.canonical_id,c.duplicate_id)
      and greatest(r.canonical_id,r.duplicate_id) = greatest(c.canonical_id,c.duplicate_id))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.refresh_tag_merge_candidates(numeric) from public;
grant execute on function public.refresh_tag_merge_candidates(numeric) to service_role;
