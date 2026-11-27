-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127183200 with no repo file — the signature of
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
create function public.logo_review_business_context(p_targets jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets)>500 then raise exception 'invalid context batch'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('entity_table',t.entity_table,'entity_id',t.entity_id,
  'address',left(coalesce(to_jsonb(v)->>'address',to_jsonb(e)->>'address',to_jsonb(o)->>'address',''),250),
  'country',coalesce(to_jsonb(v)->>'country',to_jsonb(e)->>'country',''),
  'description',left(coalesce(to_jsonb(v)->>'description',to_jsonb(e)->>'description',to_jsonb(o)->>'description',to_jsonb(b)->>'description',''),1200)
 )),'[]'::jsonb) into result
 from jsonb_to_recordset(p_targets) as t(entity_table text,entity_id uuid)
 left join public.venues v on t.entity_table='venues' and v.id=t.entity_id
 left join public.events e on t.entity_table='events' and e.id=t.entity_id
 left join public.organizations o on t.entity_table='organizations' and o.id=t.entity_id
 left join public.marketplace_brands b on t.entity_table='marketplace_brands' and b.id=t.entity_id;
 return result;
end $$;
revoke all on function public.logo_review_business_context(jsonb) from public,anon,authenticated;
grant execute on function public.logo_review_business_context(jsonb) to service_role;
;
