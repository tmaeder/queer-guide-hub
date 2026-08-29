-- Tag glossary content quality, phase 4: related terms by verified promotion.
--
-- The embedding-similarity pool (tag_relationships, 69,633 pairs at a 0.70
-- floor) published noise as relatedness on /tags/:slug ("Tickler↔God",
-- "Little↔Board Member"); the footer that rendered it is gone (frontend,
-- 2026-08-29). Hand-measured precision of the pool: ~70% at >=0.90, ~50% at
-- 0.85-0.90, ~25% at 0.80-0.85 — "Sexting↔Stretching" scores 0.93 on surface
-- form. No automatic floor is clean enough to display, which is why the
-- decision (2026-08-29) is VERIFIED PROMOTION: pairs >=0.85 go to an LLM that
-- must NAME the relationship (a_covers_b / b_covers_a / related / none, see
-- tag-enrichment-sweep mode='relations'); a named verdict lands in
-- tag_relations as review_status='pending' and is NEVER displayed until an
-- admin approves it.
--
-- Display contract (get_tag_ontology):
--   broader/narrower — 'auto' + 'approved' display. Wikidata P279/P361 edges
--     are provenance-grounded and keep their existing auto display; the LLM
--     verifier writes 'pending', which does not display.
--   related — 'approved' ONLY. This also hides the 120 pre-existing 'auto'
--     co-occurrence rows until reviewed: a related chip is an editorial
--     assertion, and unreviewed machine output stops being displayed as one
--     (same rule the alias display gate applies).
--   Nothing 'rejected' ever displays (previously unfiltered).

-- 1) 'pending' joins the review vocabulary.
alter table public.tag_relations drop constraint tag_relations_review_status_check;
alter table public.tag_relations add constraint tag_relations_review_status_check
  check (review_status = any (array['auto','approved','rejected','pending']));
comment on column public.tag_relations.review_status is
  'auto = provenance-grounded machine edge (wikidata hierarchy; displays for broader), pending = LLM-proposed, awaiting review (never displays), approved = human-confirmed, rejected = human-refused (never re-proposed by the verifier: the tag_relations row stays as the tombstone).';

-- 2) Verification cursor on the signal pool.
alter table public.tag_relationships
  add column if not exists verified_at timestamptz,
  add column if not exists verdict text;
comment on column public.tag_relationships.verified_at is
  'When mode=relations examined this pair. Stamped on every visit (cursor), whatever the verdict.';

create index if not exists idx_tag_relationships_verify_cursor
  on public.tag_relationships (similarity_score desc)
  where verified_at is null and relationship_type = 'embedding' and similarity_score >= 0.85;

-- 3) Work list for the verifier (service_role only): unverified embedding
--    pairs between active tags, best first.
create or replace function public.tag_relation_verify_worklist(p_limit int default 40)
returns table (
  id uuid,
  similarity_score numeric,
  a_id uuid, a_name text, a_category text, a_short text,
  b_id uuid, b_name text, b_category text, b_short text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.similarity_score,
         a.id, a.name, a.category, a.short_description,
         b.id, b.name, b.category, b.short_description
  from public.tag_relationships r
  join public.unified_tags a on a.id = r.tag1_id and a.status = 'active'
  join public.unified_tags b on b.id = r.tag2_id and b.status = 'active'
  where r.relationship_type = 'embedding'
    and r.similarity_score >= 0.85
    and r.verified_at is null
  order by r.similarity_score desc
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.tag_relation_verify_worklist(int) from public, anon, authenticated;
grant execute on function public.tag_relation_verify_worklist(int) to service_role;

-- 4) Review-aware display.
create or replace function public.get_tag_ontology(p_tag_id uuid)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'broader', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                        'category',t.category,'confidence',r.confidence) order by t.name)
      from public.tag_relations r
      join public.unified_tags t on t.id = r.target_tag_id
      where r.source_tag_id = p_tag_id and r.relation_type = 'broader' and t.status = 'active'
        and r.review_status in ('auto','approved')
    ), '[]'::jsonb),
    'narrower', coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                        'category',t.category,'confidence',r.confidence) order by t.name)
      from public.tag_relations r
      join public.unified_tags t on t.id = r.source_tag_id
      where r.target_tag_id = p_tag_id and r.relation_type = 'broader' and t.status = 'active'
        and r.review_status in ('auto','approved')
    ), '[]'::jsonb),
    'related', coalesce((
      select jsonb_agg(x.obj order by (x.obj->>'confidence')::numeric desc)
      from (
        select distinct on (other) jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,
                          'category',t.category,'confidence',r.confidence) as obj, t.id as other
        from public.tag_relations r
        join public.unified_tags t
          on t.id = case when r.source_tag_id = p_tag_id then r.target_tag_id else r.source_tag_id end
        where r.relation_type = 'related'
          and (r.source_tag_id = p_tag_id or r.target_tag_id = p_tag_id)
          and t.status = 'active'
          and r.review_status = 'approved'
        order by other, r.confidence desc
      ) x
    ), '[]'::jsonb)
  );
$$;

-- 5) Cron + registry (record of record; retirement = disable, never delete).
insert into admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
values (
  'tag_relation_verify',
  'Tag related-terms verified promotion',
  'tag-enrichment-sweep mode=relations: LLM-verifies embedding-similarity pairs (>=0.85) into named tag_relations rows (review_status=pending). Nothing displays until an admin approves.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'tag_relation_verify',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'relations', 'batch_limit', 40, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cmd$
  ),
  '45 */2 * * *',
  true,
  'system'
)
on conflict (slug) do update
  set enabled = true,
      schedule = excluded.schedule,
      action = excluded.action,
      description = excluded.description;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'tag_relation_verify') then
    perform cron.unschedule('tag_relation_verify');
  end if;
end $$;

select cron.schedule(
  'tag_relation_verify',
  '45 */2 * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/tag-enrichment-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'relations', 'batch_limit', 40, 'triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cron$
);
