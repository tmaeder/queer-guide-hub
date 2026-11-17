-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261116210200 with no repo file — the signature of
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
-- Claim only bounded new/changed inputs, preserving the existing retry and lease gates.
-- The exact fingerprint expression avoids passing every wide event row through
-- an opaque SQL helper; read-only plans measured 8.7s versus 1.3s for enrollment.
do $migration$
declare src text;
 from_anchor text:=$a$   from public.events e
   where e.duplicate_of_id$a$;
 conflict_anchor text:=$a$   on conflict(event_id,lane) do update$a$;
 hash_expr text:=$hash$pg_catalog.md5(pg_catalog.jsonb_build_array(e.website,e.ticket_url,e.status,
 e.start_date,e.end_date,e.duplicate_of_id,
 case when p_lane='image' then pg_catalog.to_jsonb(e.images) else
 pg_catalog.jsonb_build_array(e.description,e.venue_name,e.address,
 e.accessibility_attributes,e.target_groups,e.age_restriction) end)::text)$hash$;
begin
 src:=pg_get_functiondef('public.claim_event_gaps(text,uuid,integer,uuid[],boolean)'::regprocedure);
 if position('bounded_enrollment' in src)>0 then return;end if;
 if position(from_anchor in src)=0 or position(conflict_anchor in src)=0
 or position('public.event_gap_input(e,p_lane)' in src)=0 then
  raise exception 'Gap claim changed; inspect before patching';end if;
 src:=replace(src,from_anchor,$a$   from public.events e
   left join public.event_gap_queue bounded_enrollment
    on bounded_enrollment.event_id=e.id and bounded_enrollment.lane=p_lane
   where e.duplicate_of_id$a$);
 src:=replace(src,conflict_anchor,$a$     and (bounded_enrollment.event_id is null or
      (bounded_enrollment.input_hash is distinct from public.event_gap_input(e,p_lane)
       and coalesce(bounded_enrollment.lease_until,'-infinity')<now()))
   order by case when e.status='completed' then 1 else 0 end, case when e.start_date<now()-interval '30 days' and e.end_date-e.start_date>interval '90 days' and coalesce(e.is_recurring,false)=false and e.schedule is null then 1 else 0 end,
     case when p_lane='content' and length(btrim(coalesce(e.description,'')))<80 then 0 else 1 end,
     case when e.start_date<=now()+interval '30 days' then 0 else 1 end,
     greatest(e.start_date,now()) asc nulls last,e.id
   limit greatest(0,least(coalesce(p_limit,8),40))
   on conflict(event_id,lane) do update$a$);
 src:=replace(src,'public.event_gap_input(e,p_lane)',hash_expr);
 execute src;
end $migration$;
;
