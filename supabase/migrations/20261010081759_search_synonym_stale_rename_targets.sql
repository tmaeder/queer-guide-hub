select set_config('app.actor', 'admin:search-synonym-stale-rename-targets', true);

update public.search_synonyms s
   set replacements = array[lower(t.name)]
  from public.unified_tags t
 where t.id = s.tag_id and t.status='active' and s.status='approved'
   and s.created_at >= '2026-10-10T04:50:00Z' and s.created_at < '2026-10-10T06:00:00Z'
   and lower(s.replacements[1]) is distinct from lower(t.name);

do $verify$
declare v_stale int; v_active_changed int; v_bias text;
begin
  select count(*) into v_stale from public.search_synonyms s join public.unified_tags t on t.id=s.tag_id
   where t.status='active' and s.status='approved'
     and s.created_at >= '2026-10-10T04:50:00Z' and s.created_at < '2026-10-10T06:00:00Z'
     and lower(s.replacements[1]) is distinct from lower(t.name);
  if v_stale <> 0 then raise exception 'P1 failed: % campaign-window synonyms still stale', v_stale; end if;

  select count(*) into v_active_changed from public.search_synonyms s join public.unified_tags t on t.id=s.tag_id
   where s.status='active' and lower(s.replacements[1]) is distinct from lower(t.name);
  if v_active_changed <> 3 then raise exception 'P2 failed: expected the 3 pre-existing active rows untouched, found %', v_active_changed; end if;

  select s.replacements[1] into v_bias from public.search_synonyms s where s.terms[1]='bias' and s.status='active';
  if v_bias is distinct from 'prejudice' then raise exception 'P3 failed: bias now expands to %, expected untouched "prejudice"', v_bias; end if;

  if (select count(*) from public.search_synonyms where status='approved'
       and created_at >= '2026-10-10T04:50:00Z' and created_at < '2026-10-10T06:00:00Z') < 50 then
    raise exception 'P4 failed: campaign-window synonym set implausibly small'; end if;
  raise notice 'campaign-window synonyms consistent; 3 pre-existing active rows left as they were';
end
$verify$;
