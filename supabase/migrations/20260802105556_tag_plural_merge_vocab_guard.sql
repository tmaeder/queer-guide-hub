-- Controlled-vocabulary collision guard for the plural auto-merge.
--
-- Found by verifying the first production run rather than trusting its exit
-- code: 2 of 55 merges reported success while changing nothing.
--
-- news_articles carries trg_normalize_news_tags -> normalize_news_tags(), a
-- default-reject controlled vocabulary whose canonical form for some concepts
-- is the PLURAL ('hate-crimes', 'pride-events'). merge_tag_concept() rewrote
-- news_articles.tags from the plural to the singular and the trigger
-- immediately rewrote it back. Net effect: the 319 news rows kept the plural,
-- but unified_tags still marked the plural 'merged' and moved its
-- unified_tag_assignments across. The tag then vanished from the UI with its
-- articles stranded behind a merged, unreachable row -- and merge_tag_concept
-- returned an audit id, so nothing looked wrong.
--
-- The guard is generic rather than a denylist: after each merge, re-check
-- whether the duplicate slug survives anywhere in the 13 entity tags[] columns.
-- If it does, some vocabulary owns that slug and outranks us, so roll the pair
-- back through unmerge_tag_concept() and record a permanent exclusion. A future
-- vocabulary with the same shape is handled without a code change.

insert into public.tag_plural_exclusions (singular_slug, plural_slug, reason) values
  ('hate-crime',  'hate-crimes',  'news controlled vocabulary (normalize_news_tags) canonicalises to the plural'),
  ('pride-event', 'pride-events', 'news controlled vocabulary (normalize_news_tags) canonicalises to the plural')
on conflict do nothing;

create or replace function public.tag_slug_still_in_use(p_slug text)
returns boolean
language plpgsql stable
set search_path = public
as $fn$
declare
  v_tables text[] := array['venues','news_articles','personalities','events','festivals',
                           'hotels','milestones','organizations','queer_villages',
                           'community_groups','community_posts','cms_content','cms_pages'];
  v_tbl text; v_found boolean;
begin
  foreach v_tbl in array v_tables loop
    execute format('select exists (select 1 from %I where %L = any(tags))', v_tbl, p_slug)
      into v_found;
    if v_found then return true; end if;
  end loop;
  return false;
end;
$fn$;

create or replace function public.run_tag_plural_merge(
  p_limit int default 200,
  p_dry_run boolean default false
)
returns table (singular_slug text, plural_slug text, rule text, merged boolean, note text)
language plpgsql security definer
set search_path = public
as $fn$
declare r record; v_audit uuid;
begin
  perform public.assert_admin_or_internal();
  -- merge_tag_concept sets app.actor itself, but the trigger cascade it fires
  -- runs under whatever is set here, and log_unified_tag_change() RAISES for a
  -- 'system:%' actor touching a human_reviewed tag.
  perform set_config('app.actor', 'admin:tag-plural-merge', true);

  for r in select * from public.tag_plural_pairs(p_limit) loop
    if p_dry_run then
      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := false; note := 'dry-run';
      return next;
      continue;
    end if;

    begin
      v_audit := public.merge_tag_concept(r.singular_id, r.plural_id, 'auto', 'auto:plural');

      -- Did it actually take? A controlled-vocabulary trigger on any entity
      -- table can rewrite our change back without raising.
      if public.tag_slug_still_in_use(r.plural_slug) then
        perform public.unmerge_tag_concept(v_audit);
        insert into public.tag_plural_exclusions (singular_slug, plural_slug, reason)
        values (r.singular_slug, r.plural_slug,
                'auto: a controlled vocabulary re-asserted the plural on entity rows')
        on conflict do nothing;
        singular_slug := r.singular_slug; plural_slug := r.plural_slug;
        rule := r.rule; merged := false;
        note := 'rolled back: vocabulary owns this slug';
        return next;
        continue;
      end if;

      -- merge_tag_concept records the absorbed slug as a generic 'synonym';
      -- label it for what it is so the alias table stays diagnosable.
      update public.tag_aliases
         set alias_type = 'plural'
       where alias_slug = r.plural_slug and canonical_tag_id = r.singular_id;

      -- The alias table is not a router; without this /tags/pubs would 404 for
      -- everyone holding an old link.
      insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
      values (r.plural_slug, r.singular_slug, r.singular_id)
      on conflict (old_slug) do nothing;

      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := true; note := v_audit::text;
    exception when others then
      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := false; note := 'failed: ' || sqlerrm;
    end;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.run_tag_plural_merge(int, boolean) from public;
grant execute on function public.run_tag_plural_merge(int, boolean) to service_role;
grant execute on function public.tag_slug_still_in_use(text) to service_role;

-- The two rolled-back merges left stale routing behind: a redirect would send
-- /tags/hate-crimes to an emptier page than the one it came from.
delete from public.tag_slug_redirects
 where old_slug in ('hate-crimes', 'pride-events');
delete from public.tag_aliases
 where alias_slug in ('hate-crimes', 'pride-events') and alias_type = 'plural';
