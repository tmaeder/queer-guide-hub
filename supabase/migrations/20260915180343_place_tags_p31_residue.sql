-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915180343 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
do $$
declare
  v_deindex text[] := array['uk','espana','turkiye','venezia','spandau','epsom','bon-encontre',
                            'qawra','west-hollywood','castro-district','fortitude-valley'];
  v_keep    text[] := array['wales','queensland','manhattan','bali','yucatan','town'];
  v_written int; v_leak int; v_lost text;
begin
  perform set_config('app.actor', 'migration:place_tags_p31_residue', true);

  update public.unified_tags t
     set seo_indexable      = false,
         seo_deindex_reason = 'place-duplicate',
         updated_at         = now()
   where t.status = 'active'
     and t.slug = any(v_deindex)
     and (t.seo_indexable is true or t.seo_deindex_reason = 'thin')
     and t.seo_deindex_reason is distinct from 'place-duplicate';
  get diagnostics v_written = row_count;
  raise notice 'p31 residue deindexed: %', v_written;

  select count(*) into v_leak from public.unified_tags
   where status = 'active' and slug = any(v_deindex) and seo_indexable is true;
  if v_leak > 0 then
    raise exception 'postcondition failed: % residue tags still indexable', v_leak;
  end if;

  select string_agg(slug, ', ' order by slug) into v_lost
    from public.unified_tags
   where status = 'active' and slug = any(v_keep) and seo_deindex_reason = 'place-duplicate';
  if v_lost is not null then
    raise exception 'bucket E/F tags were deindexed as place duplicates: %', v_lost;
  end if;
end $$;;
