-- One-shot repair of the 67 slugs that the old diacritic-deleting slugifier
-- produced. Idempotent: it only touches rows whose slug still disagrees with
-- normalize_tag_slug(name), so re-running is a no-op.
--
-- Two hazards, both hit for real on the first attempt:
--
-- (a) A corrected slug can collide with an EXISTING tag. 'caf' (Cafe, 70 uses)
--     wants 'cafe', and a 'cafe' tag already existed. A rename would have
--     raised on unified_tags_slug_key; the right move is a merge, so the 70
--     usages are absorbed rather than orphaned.
--
-- (b) Two corrupt rows can want the SAME corrected slug. 'm-llerian' and
--     'muellerian' both normalise to 'mullerian'. A NOT EXISTS guard against
--     current slugs does not see this, because the conflict is between two rows
--     inside the same UPDATE. DISTINCT ON resolves it, preferring the active,
--     most-used row.
--
-- Rows with status='merged' are skipped: their slug is the redirect/alias trail
-- pointing at the canonical tag, so rewriting it would break the very lookup it
-- exists to serve.

do $do$
declare v_id uuid; v_target uuid; v_n int := 0;
begin
  perform set_config('app.actor', 'admin:tag-slug-repair', true);

  -- (a) collisions with an existing tag -> merge
  for v_id, v_target in
    select t.id, o.id
      from public.unified_tags t
      join public.unified_tags o
        on o.slug = public.normalize_tag_slug(t.name) and o.id <> t.id
     where t.slug <> public.normalize_tag_slug(t.name)
       and t.name ~ '[^\x00-\x7F]'
       and t.status <> 'merged'
       and o.status <> 'merged'
  loop
    begin
      perform public.merge_tag_concept(v_target, v_id, 'admin', 'repair:diacritic-slug');
      v_n := v_n + 1;
    exception when others then
      raise notice 'slug-repair merge skipped for %: %', v_id, sqlerrm;
    end;
  end loop;
  raise notice 'slug repair: merged % colliding rows', v_n;

  -- (b) everything else -> rename, deduplicated within the batch
  with cand as (
    select distinct on (public.normalize_tag_slug(t.name))
           t.id, public.normalize_tag_slug(t.name) want
      from public.unified_tags t
     where t.slug <> public.normalize_tag_slug(t.name)
       and t.name ~ '[^\x00-\x7F]'
       and t.status <> 'merged'
       and not exists (select 1 from public.unified_tags o
                        where o.slug = public.normalize_tag_slug(t.name) and o.id <> t.id)
     order by public.normalize_tag_slug(t.name), (t.status = 'active') desc,
              coalesce(t.usage_count, 0) desc
  )
  update public.unified_tags u set slug = c.want from cand c where u.id = c.id;
end $do$;

do $do$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.unified_tags
   where status <> 'merged'
     and slug <> public.normalize_tag_slug(name)
     and name ~ '[^\x00-\x7F]';
  if v_bad > 0 then
    raise exception '% live tags still carry a diacritic-corrupted slug', v_bad;
  end if;
end $do$;;