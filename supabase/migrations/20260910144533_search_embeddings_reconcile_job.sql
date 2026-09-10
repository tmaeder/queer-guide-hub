-- The only writer of search_embeddings for existing rows is search_embeddings_pull_on_doc_insert,
-- an AFTER INSERT trigger on search_documents. It pulls the vector from content_embeddings at the
-- moment the document is created -- so if the embedding does not exist yet, the pull finds nothing
-- and NOTHING EVER RETRIES. A document indexed before its vector was computed stays vector-invisible
-- permanently.
--
-- That is exactly the state the organizations arm would otherwise land in: all 6,284 organization
-- documents were inserted long before this session added organizations to embedding_candidates, so
-- their pull already fired against an empty content_embeddings and will never fire again.
--
-- A one-shot backfill would fix organizations and leave the mechanism broken for the next type.
-- This is a recurring reconciler instead, so the class self-heals: it also covers the 8 'group'
-- documents (embeddings exist but are NULL, last written 2026-04-14) and the 1 'landmark' document,
-- and any future entity type whose documents are indexed ahead of its vectors.
--
-- It is INSERT-only against missing doc_ids. Refreshing changed vectors remains the drain's job;
-- widening this to an UPDATE would make it fight the drain for row locks on every pass.

create or replace function public.search_embeddings_reconcile(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_inserted integer;
begin
  if p_limit is null or p_limit <= 0 or p_limit > 5000 then
    raise exception 'p_limit must be between 1 and 5000, got %', p_limit;
  end if;

  with missing as (
    select d.doc_id, ce.embedding
    from public.search_documents d
    join public.content_embeddings ce
      on ce.content_type = d.entity_type
     and ce.content_id  = d.entity_id
    where ce.embedding is not null
      and extensions.vector_dims(ce.embedding) = 1024
      and not exists (
        select 1 from public.search_embeddings se where se.doc_id = d.doc_id
      )
    limit p_limit
  )
  insert into public.search_embeddings (doc_id, embedding)
  select doc_id, embedding from missing
  on conflict (doc_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $function$;

revoke all on function public.search_embeddings_reconcile(integer) from public, anon, authenticated;
grant execute on function public.search_embeddings_reconcile(integer) to service_role;

-- Registry row first, then the cron, per the project's cron contract. `command` is included
-- deliberately: an action.type='rpc' row with no action.command cannot be rebuilt by
-- sync_automations_to_cron() branch (d), which is why six currently-disabled rpc automations
-- would come back on-but-unscheduled if someone simply flipped enabled=true.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'search_embeddings_reconcile',
  'Reconcile missing search embeddings',
  'Inserts search_embeddings rows for search_documents whose vector exists in content_embeddings but was never pulled (the pull trigger only fires on document insert).',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"fn": "search_embeddings_reconcile", "type": "rpc", "command": "SELECT public.search_embeddings_reconcile(500);", "jobname": "search_embeddings_reconcile"}'::jsonb,
  '*/10 * * * *'
)
on conflict (slug) do update
  set action = excluded.action,
      schedule = excluded.schedule,
      enabled = true;

select cron.schedule(
  'search_embeddings_reconcile',
  '*/10 * * * *',
  $cron$SELECT public.admin_automation_run_begin('search_embeddings_reconcile'); SELECT public.search_embeddings_reconcile(500);$cron$
);
