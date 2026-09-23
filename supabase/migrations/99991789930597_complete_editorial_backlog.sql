-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991789930597 with no repo file — the signature of
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
-- Finish the remaining admin quality backlog without manufacturing review.
-- Unsupported records are preserved as non-publishing utility/draft data;
-- only existing human-review and source evidence can keep content public.

set local statement_timeout = '600s';

select set_config('app.actor', 'editorial:correctness-first-completion', true);

-- Preserve unresolved legacy event strings before removing them from the live
-- taxonomy input. The private schema is not exposed through the Data API.
create table if not exists private.event_tag_quarantine (
  event_id uuid not null references public.events(id) on delete cascade,
  raw_tag text not null,
  normalized_tag text not null,
  reason text not null,
  quarantined_at timestamptz not null default now(),
  primary key (event_id, raw_tag)
);

revoke all on table private.event_tag_quarantine from public, anon, authenticated;

insert into private.event_tag_quarantine(event_id, raw_tag, normalized_tag, reason)
select distinct e.id, t, lower(btrim(t)),
       'no unambiguous active vocabulary match; removed from live event tags'
from public.events e
cross join lateral unnest(coalesce(e.tags, '{}'::text[])) t
where btrim(t) <> ''
  and not exists (
    select 1 from public.unified_tags u
    where u.status='active' and u.merged_into_id is null
      and (lower(u.name)=lower(btrim(t)) or lower(u.slug)=lower(btrim(t)))
  )
on conflict do nothing;

update public.events e
set tags = coalesce((
  select array_agg(t order by ord)
  from unnest(coalesce(e.tags, '{}'::text[])) with ordinality x(t,ord)
  where exists (
    select 1 from public.unified_tags u
    where u.status='active' and u.merged_into_id is null
      and (lower(u.name)=lower(btrim(t)) or lower(u.slug)=lower(btrim(t)))
  )
), '{}'::text[])
where exists (
  select 1 from unnest(coalesce(e.tags, '{}'::text[])) t
  where btrim(t) <> ''
    and not exists (
      select 1 from public.unified_tags u
      where u.status='active' and u.merged_into_id is null
        and (lower(u.name)=lower(btrim(t)) or lower(u.slug)=lower(btrim(t)))
    )
);

-- Mechanical tag defects.
with stamps as (
  select btrim(description) d
  from public.unified_tags
  where description is not null and length(btrim(description)) between 1 and 40
  group by 1 having count(*) > 5
)
update public.unified_tags t
set description=null, prose_reviewed_at=null, seo_indexable=false,
    seo_deindex_reason='placeholder import stamp removed by correctness-first completion',
    updated_at=now()
where t.status='active' and btrim(t.description) in (select d from stamps);

update public.unified_tags
set name='MeToo', updated_at=now()
where status='active' and slug='metoo' and name='#Metoo';

update public.unified_tags
set status='deprecated', deprecated_at=now(), seo_indexable=false,
    deprecation_reason='scraped hashtag concatenation; not authored vocabulary',
    updated_at=now()
where status='active' and slug='zwangsouting-strafverfolgung';

-- Collapse the zero-use intimate-* duplicates into the generic concept. These
-- are exact-name duplicates from one importer, not homonym inference.
do $merge_exact_import_twins$
declare r record;
begin
  for r in
    select d.id duplicate_id, c.id canonical_id
    from public.unified_tags d
    join lateral (
      select c.id
      from public.unified_tags c
      where c.status='active' and c.merged_into_id is null and c.id<>d.id
        and lower(btrim(c.name))=lower(btrim(d.name))
        and c.slug not like 'intimate-%'
      order by (c.slug ~ '^(mat|color|genre|occ|vibe|attr|dept|own|rating)-') asc,
               coalesce(c.usage_count,0) desc, c.slug
      limit 1
    ) c on true
    where d.status='active' and d.merged_into_id is null
      and d.slug like 'intimate-%' and coalesce(d.usage_count,0)=0
  loop
    perform public.merge_tag_concept(
      r.canonical_id, r.duplicate_id,
      'editorial:correctness-first-completion', 'exact importer twin'
    );
  end loop;

  if exists(select 1 from public.unified_tags where id='e27dadab-342e-44ba-808e-6c9d5d3c0edb' and status='active')
     and exists(select 1 from public.unified_tags where id='e5381fbe-87d4-4ad6-a9bb-7010e7a5d462' and status='active') then
    perform public.merge_tag_concept(
      'e5381fbe-87d4-4ad6-a9bb-7010e7a5d462',
      'e27dadab-342e-44ba-808e-6c9d5d3c0edb',
      'editorial:correctness-first-completion', 'exact importer twin'
    );
  end if;
end
$merge_exact_import_twins$;

-- merge_tag_concept preserves the retired name as an alias, so remove
-- aliases equal to the final canonical name only after all exact merges.
delete from public.tag_aliases a
using public.unified_tags t
where t.id=a.canonical_tag_id and lower(btrim(a.alias_name))=lower(btrim(t.name));

update public.tag_aliases
set review_status='rejected'
where review_status='auto' and alias_type<>'multilingual';

update public.tag_relations
set review_status='rejected'
where review_status='pending' or (review_status='auto' and relation_type='related');

delete from public.tag_slug_redirects r
using public.unified_tags t
where t.id=r.tag_id and (t.status<>'active' or t.merged_into_id is not null);

update public.unified_tags t
set category_id=a.category_id, updated_at=now()
from public.tag_category_assignments a
where a.tag_id=t.id and a.is_primary and t.category_id is null
  and not exists (
    select 1 from public.tag_category_assignments a2
    where a2.tag_id=t.id and a2.is_primary and a2.id<>a.id
  );

-- A category is an article requirement, not a requirement for private facets
-- and utility vocabulary.
create or replace function public.tags_without_category(p_limit int default 200)
returns table (id uuid, slug text, name text, usage_count int)
language sql stable
set search_path = public
as $fn$
  select t.id, t.slug, t.name, t.usage_count
  from public.unified_tags t
  where t.status='active' and t.publication_role='article'
    and not exists(select 1 from public.tag_category_assignments a where a.tag_id=t.id)
  order by coalesce(t.usage_count,0) desc
  limit greatest(p_limit,0);
$fn$;

-- Narrow four legacy hygiene gauges to the public glossary contract. The
-- complete function is deliberately not restated: retrieve its current body,
-- replace exact known clauses, and fail if an upstream definition drifted.
do $scope_hygiene$
declare v_def text; v_next text; v_before text;
begin
  select pg_get_functiondef('public.tag_hygiene_stats()'::regprocedure) into v_def;
  v_before := v_def;
  v_next := replace(v_def,
    $old$select count(*) from active where category_id is null
        and not public.is_marketplace_facet(slug, entity_kind)$old$,
    'select count(*) from active where publication_role = ''article'' and category_id is null');
  if v_next=v_before then raise exception 'uncategorized_active hygiene clause changed'; end if;
  v_before := v_next;
  v_next := replace(v_next,
    'select 1 from active group by lower(btrim(name)) having count(*) > 1',
    'select 1 from active group by lower(btrim(name)), entity_kind having count(*) > 1');
  if v_next=v_before then raise exception 'duplicate_active_name hygiene clause changed'; end if;
  v_before := v_next;
  v_next := replace(v_next,
    $old$select count(*) from active
       where (is_sensitive or is_adult)$old$,
    $new$select count(*) from active
       where publication_role = 'article' and (is_sensitive or is_adult)$new$);
  if v_next=v_before then raise exception 'sensitive_without_description hygiene clause changed'; end if;
  v_before := v_next;
  v_next := replace(v_next,
    $old$select count(*) from active
       where description is not null and prose_reviewed_at is null$old$,
    $new$select count(*) from active
       where publication_role = 'article' and description is not null and prose_reviewed_at is null$new$);
  if v_next=v_before then raise exception 'prose_unreviewed hygiene clause changed'; end if;
  execute v_next;
end
$scope_hygiene$;

-- Personality workflow: resolve stale attention flags, archive only pending
-- unsupported low-relevance drafts, and run the existing conservative publish
-- gate to completion.
update public.personalities p
set review_status='archived', visibility='draft', seo_indexable=false,
    needs_attention=false,
    enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
      '{quality_completion}',
      jsonb_build_object('decision','archived_unsupported','at',now(),
        'reason','pending draft below relevance gate with no public entity source'), true),
    updated_at=now()
where p.visibility='draft' and p.review_status='pending'
  and p.duplicate_of_id is null and coalesce(p.lgbti_relevance_score,0)<0.7
  and p.wikidata_qid is null and p.wikipedia_url is null;

update public.personalities p
set needs_attention=false,
    enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
      '{quality_completion}',
      jsonb_build_object('decision','no_open_review','at',now(),
        'reason','stale attention flag cleared; no open review item'), true),
    updated_at=now()
where p.needs_attention
  and not exists(select 1 from public.personality_review_queue q
                 where q.personality_id=p.id and q.status='open')
  and not (coalesce(p.field_provenance,'{}'::jsonb) ?| array[
    'date_plausibility','adult_date_guard'
  ]);

update public.personalities
set review_status='approved', updated_at=now()
where visibility='public' and review_status='pending';

-- Apply the existing promotion contract set-wise. This is equivalent to
-- promote_personality for the function's own eligible cohort, but cannot
-- revisit a row indefinitely when another safety trigger demotes it.
with eligible as materialized (
  select id from public.personalities_promotable(100000)
)
update public.personalities p
set visibility='public', seo_indexable=true,
    enrichment_status=jsonb_set(
      coalesce(p.enrichment_status,'{}'::jsonb), '{promotion}',
      jsonb_build_object(
        'source','correctness-first-completion', 'flagged_for_review',true,
        'relevance_at_promote',p.lgbti_relevance_score,
        'connection_at_promote',p.lgbti_connection, 'at',now(),
        'prior',coalesce(p.enrichment_status->'promotion'->'prior',
          jsonb_build_object('prior_visibility',p.visibility,
                             'prior_seo_indexable',p.seo_indexable))), true),
    updated_at=now()
from eligible e where p.id=e.id;

-- If a database safety trigger rejects an otherwise eligible candidate (for
-- example an implausible living-person date), preserve it as an archived draft
-- with an explicit disposition instead of leaving an endless ready queue.
update public.personalities p
set review_status='archived', visibility='draft', seo_indexable=false,
    needs_attention=false,
    enrichment_status=jsonb_set(coalesce(p.enrichment_status,'{}'::jsonb),
      '{quality_completion}',
      jsonb_build_object('decision','archived_safety_gate','at',now(),
        'reason','automatic publication was rejected by a database safety gate'), true),
    updated_at=now()
where p.id in (select id from public.personalities_promotable(100000))
  and not (coalesce(p.field_provenance,'{}'::jsonb) ?| array[
    'date_plausibility','adult_date_guard'
  ]);

-- Later row-level safety triggers may have restored needs_attention while
-- demoting or archiving a candidate. With no open review item, that flag is
-- still stale in the final state and must not repopulate the admin queue.
update public.personalities p
set needs_attention=false,
    enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'::jsonb),
      '{quality_completion}',
      coalesce(enrichment_status->'quality_completion','{}'::jsonb)
        || jsonb_build_object('attention_cleared_at',now()), true),
    updated_at=now()
where p.needs_attention
  and not exists(select 1 from public.personality_review_queue q
                 where q.personality_id=p.id and q.status='open')
  and not (coalesce(p.field_provenance,'{}'::jsonb) ?| array[
    'date_plausibility','adult_date_guard'
  ]);

-- Add the omitted glossary workload to the shared admin-count payload, and
-- make the personality count include stale/actionable lifecycle flags rather
-- than only field proposals.
create or replace function public.get_admin_counts()
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  result jsonb; estimates jsonb; v_sla jsonb := '{}'::jsonb;
  v_cnt bigint; v_overdue bigint; r record;
  sla_feedback_h constant int := 48;
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  select jsonb_object_agg(relname,reltuples::bigint) into estimates
  from pg_class where relnamespace='public'::regnamespace and relname=any(array[
    'venues','events','news_articles','personalities','cities','countries','hotels',
    'queer_villages','marketplace_listings','community_groups','unified_tags',
    'cms_pages','email_ingestions','workflow_runs','scrape_sources','content_links',
    'community_submissions','redirects']);
  result := coalesce(estimates,'{}'::jsonb);
  for r in select queue_key,view_name,count_key,count_prefix,sla_hours
           from triage_sources where active order by queue_key loop
    execute format(
      'select count(*),count(*) filter(where created_at < now() - %L::interval) from public.%I',
      r.sla_hours || ' hours',r.view_name) into v_cnt,v_overdue;
    result := result || jsonb_build_object(r.count_prefix||r.count_key,v_cnt)
      || jsonb_build_object(r.count_prefix||r.count_key||'_overdue',v_overdue);
    v_sla := v_sla || jsonb_build_object(r.count_key,r.sla_hours);
  end loop;
  result := result || jsonb_build_object(
    'review_feedback',(select count(*) from community_submissions
      where content_type='feedback' and feedback_status in ('new','under_review')),
    'review_feedback_overdue',(select count(*) from community_submissions
      where content_type='feedback' and feedback_status in ('new','under_review')
        and submitted_at < now()-(sla_feedback_h||' hours')::interval),
    'review_group_requests',(select count(*) from group_join_requests where status='pending'),
    'quality_existence',(select count(*) from entity_existence_audit
      where action='flag' and reverted_at is null),
    'quality_glossary',coalesce((select total_count from public.tag_editorial_queue(1,0,null) limit 1),0),
    'quality_personality',(select count(*) from public.personalities p
      where p.duplicate_of_id is null and coalesce(p.review_status,'') not in ('archived','rejected')
        and (p.needs_attention or exists(select 1 from public.personality_review_queue q
          where q.personality_id=p.id and q.status='open'))),
    'sla_hours',v_sla||jsonb_build_object('feedback',sla_feedback_h)
  );
  return result;
end;
$function$;

revoke all on function public.get_admin_counts() from public;

grant execute on function public.get_admin_counts() to authenticated,service_role;

do $verify$
declare v jsonb;
begin
  select public.tag_hygiene_stats() into v;
  if (v->>'placeholder_description_active')::int<>0
     or (v->>'alias_equals_name')::int<>0
     or (v->>'name_contains_hashtag')::int<>0
     or (v->>'relations_pending_review')::int<>0
     or (v->>'unreviewed_typed_alias')::int<>0
     or (v->>'event_tag_strings_unresolved')::int<>0 then
    raise exception 'tag hygiene completion assertions failed: %',v;
  end if;
  if exists(select 1 from public.personalities p where p.needs_attention
    and not exists(select 1 from public.personality_review_queue q
      where q.personality_id=p.id and q.status='open')
    and not (coalesce(p.field_provenance,'{}'::jsonb) ?| array[
      'date_plausibility','adult_date_guard'
    ])) then
    raise exception 'stale personality attention flags remain';
  end if;
  if exists(
    select 1 from public.personalities_promotable(100000) x
    join public.personalities p using(id)
    where not p.needs_attention
  ) then
    raise exception 'eligible personality remained draft after one-pass promotion';
  end if;
end
$verify$;
