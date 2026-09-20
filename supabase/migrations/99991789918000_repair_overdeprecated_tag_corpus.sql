-- Repair the historical misuse of deprecation as a zero-usage staging state.
-- Rows removed only because they had zero usage or no graph edges become active
-- vocabulary again. They remain non-indexable unless they already have the
-- evidence required for a glossary article. The repair is a completed corpus
-- decision, not a newly-created queue containing thousands of items.

select set_config('app.actor','editorial:deprecated-tag-repair',true);

alter table public.unified_tags
  add column if not exists restoration_review_required boolean not null default false,
  add column if not exists restoration_previous_reason text,
  add column if not exists restoration_original_entity_kind public.tag_entity_kind,
  add column if not exists restoration_started_at timestamptz;

comment on column public.unified_tags.restoration_review_required is
  'Quarantines a tag restored from an unsupported bulk deprecation until an editor records article, utility, entity, or retirement disposition.';

-- Compatibility no-op. Usage orders editorial work; it is not evidence that a
-- concept is invalid. Keep the signature so an old operator/script cannot fail
-- halfway through a maintenance run, but make regression impossible.
create or replace function public.deprecate_unused_tags(
  p_batch int default 500,
  p_reason text default 'auto: zero usage'
) returns int
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_admin_or_internal();
  return 0;
end $$;

revoke all on function public.deprecate_unused_tags(int,text) from public,anon,authenticated;
grant execute on function public.deprecate_unused_tags(int,text) to service_role;

-- Search is a public publication surface. Candidates, utilities and entity
-- redirects must not be indexed merely because their vocabulary row is active.
create or replace function public.search_documents_index_tags(p_id uuid default null)
returns void language sql security definer set search_path=public,extensions,pg_temp as $$
  insert into public.search_documents
    (doc_id,entity_type,entity_id,title,description,search_tsv,facets,geog,
     trust_score,liveness_status,is_featured,quality_score,closed_at,start_date,end_date,
     is_free,price_min,price_max,slug,image_url,city,country,content_language,updated_at)
  select 'tag:'||t.id,'tag',t.id,t.name,t.description,
       setweight(to_tsvector('simple',unaccent(coalesce(t.name,''))),'A')
    || setweight(to_tsvector('simple',unaccent(coalesce(t.category,''))),'B')
    || setweight(to_tsvector('simple',unaccent(coalesce(t.description,''))),'D')
    || public.i18n_to_tsv(t.name_i18n,'A') || public.i18n_to_tsv(t.description_i18n,'D')
    || setweight(to_tsvector('simple',unaccent(coalesce(
         (select string_agg(a.alias_name,' ')
          from public.tag_aliases a
          join public.search_synonyms s on s.tag_alias_id=a.id and s.status='active'
          where a.canonical_tag_id=t.id),''))),'A'),
    jsonb_strip_nulls(jsonb_build_object(
      'category',t.category,'entity_kind',t.entity_kind,
      'tags',(select to_jsonb(array_agg(distinct t2.slug))
              from public.tag_assignments_norm a2
              join public.unified_tags t2 on t2.id=a2.tag_id
              where a2.entity_id=t.id and a2.entity_type='tag' and t2.slug is not null))),
    null::geography,null::smallint,'live',false,null::smallint,null::timestamptz,
    null::timestamptz,null::timestamptz,null::boolean,null::numeric,null::numeric,
    t.slug,t.image_url,null::text,null::text,null::text,now()
  from public.unified_tags t
  where t.status='active' and t.merged_into_id is null and t.deprecated_at is null
    and t.publication_role='article' and not t.restoration_review_required
    and (p_id is null or t.id=p_id)
  on conflict(entity_type,entity_id) do update set
    title=excluded.title,description=excluded.description,search_tsv=excluded.search_tsv,
    facets=excluded.facets,slug=excluded.slug,
    image_url=excluded.image_url,updated_at=now();
$$;

-- False positives from the classifier that labelled every row below a person.
-- They are concepts/legal instruments, not biographies. They join the same
-- quarantine as the zero-usage cohort rather than being published directly.
create temp table _tag_restore_false_person(slug text primary key) on commit drop;
insert into _tag_restore_false_person(slug) values
  ('domestic-partnership'),('convention-against-torture'),
  ('international-covenant-on-economic-social-and-cultural-rights'),
  ('universal-declaration-of-human-rights'),('pink-triangle'),('ballroom-scene'),
  ('civil-union'),('intersectional-feminism'),('benign-prostatic-hyperplasia'),
  ('direct-action'),('international-covenant-on-civil-and-political-rights'),
  ('refugee-convention'),('title-ix'),('trans-rights-movement'),
  ('hormone-replacement-therapy-hrt');

-- A tag cannot be reactivated while its slug is deliberately owned as an
-- alias of another canonical tag. Remove only redundant self-aliases; keep
-- real cross-tag aliases retired and replace their misleading bulk reason
-- with the actual disposition.
delete from public.search_synonyms s
using public.tag_aliases a, public.unified_tags t
where s.tag_alias_id=a.id and a.canonical_tag_id=t.id
  and public.normalize_tag_slug(a.alias_name)=t.slug;

delete from public.tag_aliases a
using public.unified_tags t
where a.canonical_tag_id=t.id
  and public.normalize_tag_slug(a.alias_name)=t.slug;

with alias_resolution as (
  select distinct on (source.id) source.id as source_id,target.slug as target_slug
  from public.unified_tags source
  join public.tag_aliases a
    on public.normalize_tag_slug(a.alias_name)=source.slug
   and a.canonical_tag_id<>source.id
  join public.unified_tags target on target.id=a.canonical_tag_id
  where source.status='deprecated' and source.merged_into_id is null
    and (source.deprecation_reason='auto: zero usage'
      or source.deprecation_reason like 'data-quality audit 2026-06-05: orphan tag%')
  order by source.id,(target.status='active') desc,target.slug
)
update public.unified_tags t
set deprecation_reason='canonical alias of ' || c.target_slug || '; duplicate vocabulary row retired',
    deprecated_at=coalesce(t.deprecated_at,now()),
    seo_indexable=false,
    seo_deindex_reason='canonical_alias'
from alias_resolution c
where t.id=c.source_id;

-- Preserve the old classification before changing anything. A row with a real
-- primary category, substantive canonical summary, and recorded human review
-- can return as an article. Incomplete or unreviewed vocabulary remains usable
-- as utility vocabulary without being published or creating an admin backlog.
with candidates as (
  select t.id,
    (t.entity_kind in ('concept','audience')
      and length(btrim(coalesce(t.description,''))) >= 80
      and (coalesce(t.human_reviewed,false) or t.prose_reviewed_at is not null)
      and (select count(*) from public.tag_category_assignments a
           where a.tag_id=t.id and a.is_primary)=1) as article_ready
  from public.unified_tags t
  where t.status='deprecated' and t.merged_into_id is null and (
    t.deprecation_reason='auto: zero usage'
    or t.deprecation_reason like 'data-quality audit 2026-06-05: orphan tag%'
    or exists(select 1 from _tag_restore_false_person f where f.slug=t.slug)
  )
  and not exists(
    select 1 from public.tag_aliases a
    where public.normalize_tag_slug(a.alias_name)=t.slug
      and a.canonical_tag_id<>t.id
  )
)
update public.unified_tags t
set restoration_review_required=false,
    restoration_previous_reason=t.deprecation_reason,
    restoration_original_entity_kind=t.entity_kind,
    restoration_started_at=now(),
    status='active',deprecated_at=null,deprecation_reason=null,
    entity_kind=case when t.entity_kind in ('person','place')
      then 'descriptor'::public.tag_entity_kind else t.entity_kind end,
    publication_role=case when c.article_ready then 'article' else 'utility' end,
    publication_role_reviewed_at=now(),
    publication_role_review_note='restored after audit of unsupported bulk deprecation',
    seo_indexable=case when c.article_ready then coalesce(t.seo_indexable,false) else false end,
    seo_deindex_reason=case when c.article_ready and coalesce(t.seo_indexable,false)
      then null else 'publication_role:' || case when c.article_ready then 'article' else 'utility' end end
from candidates c where t.id=c.id;

-- Two event names and one organisation already have canonical typed records.
-- Restore only their label/redirect, never the duplicate glossary article.
with targets(tag_slug,target_type,target_id,target_path) as (values
  ('gay-liberation-front','organization','0daab6fb-f399-47e8-aafd-08039c908902'::uuid,'/organizations/gay-liberation-front'),
  ('dyke-march','event','7b4128d4-aefd-42bb-bdab-c8217ca1fdf8'::uuid,'/events/dyke-march'),
  ('pride-march','event','2d591b1a-f43b-4ab1-9d35-dd9f0e3f42d9'::uuid,'/events/pride-march')
)
update public.unified_tags t set
  status='active',deprecated_at=null,deprecation_reason=null,
  publication_role='entity_redirect',seo_indexable=false,
  seo_deindex_reason='publication_role:entity_redirect',
  canonical_entity_type=x.target_type,canonical_entity_id=x.target_id,
  canonical_entity_path=x.target_path,canonical_entity_reviewed_at=now(),
  publication_role_reviewed_at=now(),
  publication_role_review_note='migrated false person-classification to canonical entity'
from targets x where t.slug=x.tag_slug and t.status='deprecated';

-- Four institutional names from the same classifier have no organization row
-- yet. Capture them as non-public organization drafts rather than pretending
-- they are people or leaving their content stranded in the tag table.
insert into public.organizations(
  name,slug,description,status,needs_attention,field_provenance
)
select t.name,t.slug,t.description,'draft',false,
  jsonb_build_object('migration','99991789918000','source','unified_tags',
    'source_tag_id',t.id,'requires_editorial_review',true)
from public.unified_tags t
where t.status='deprecated'
  and t.deprecation_reason='Person name - belongs in personalities table, not tags'
  and t.slug in ('african-commission-on-human-and-peoples-rights',
    'international-labour-organization','human-rights-council',
    'european-court-of-human-rights')
on conflict(slug) do nothing;

update public.unified_tags t set
  canonical_entity_type='organization',canonical_entity_id=o.id,
  canonical_entity_path='/organizations/'||o.slug,canonical_entity_reviewed_at=now(),
  deprecation_reason='organization migrated from false person classification; legacy tag retired'
from public.organizations o
where t.status='deprecated'
  and t.deprecation_reason='Person name - belongs in personalities table, not tags'
  and t.slug=o.slug
  and t.slug in ('african-commission-on-human-and-peoples-rights',
    'international-labour-organization','human-rights-council',
    'european-court-of-human-rights');

-- Actual biographies from the same bad classifier belong in personalities.
-- Draft + needs_attention prevents accidental publication; the legacy tag stays
-- retired and points editors at the new owning record.
insert into public.personalities(
  name,slug,description,bio,wikipedia_url,wikidata_qid,visibility,seo_indexable,
  needs_attention,review_status,verification_status,profession,field_provenance,roles
)
select t.name,t.slug,t.description,
  case when length(btrim(coalesce(t.long_description,t.description,'')))>=60
    then coalesce(t.long_description,t.description)
    else coalesce(t.long_description,t.description) || ' Editorial verification required.' end,
  t.wikipedia_url,t.wikidata_id,'draft',false,false,'pending','pending',
  case when t.slug='alec-butler' then 'Playwright and filmmaker' end,
  jsonb_build_object('migration','99991789918000','source','unified_tags',
    'source_tag_id',t.id,'requires_editorial_review',true),'{}'::text[]
from public.unified_tags t
where t.status='deprecated'
  and t.deprecation_reason='Person name - belongs in personalities table, not tags'
  and not exists(select 1 from _tag_restore_false_person f where f.slug=t.slug)
  and t.slug not in ('african-commission-on-human-and-peoples-rights',
    'international-labour-organization','human-rights-council',
    'gay-liberation-front','european-court-of-human-rights','pride-march','dyke-march')
on conflict(slug) do nothing;

update public.unified_tags t set
  canonical_entity_type='personality',canonical_entity_id=p.id,
  canonical_entity_path='/personalities/'||p.slug,canonical_entity_reviewed_at=now(),
  deprecation_reason='biography migrated to personalities; legacy tag retired'
from public.personalities p
where t.status='deprecated'
  and t.deprecation_reason='Person name - belongs in personalities table, not tags'
  and p.slug=t.slug and p.duplicate_of_id is null;

-- Stale documents created before the stricter indexer are removed explicitly.
delete from public.search_documents d using public.unified_tags t
where d.entity_type='tag' and d.entity_id=t.id
  and (t.status<>'active' or t.publication_role<>'article' or t.restoration_review_required);

-- A quarantined sensitive term is not a sign-in-gated article either. Without
-- this additional predicate TagDetail would turn its intentional 404 into a
-- misleading “sign in to view” screen and disclose the candidate's existence.
create or replace function public.gated_entity_exists(p_entity_type text, p_slug text)
returns boolean language sql stable security definer set search_path='public' as $$
  select case p_entity_type
    when 'venue' then exists (select 1 from public.venues
      where slug=p_slug and safety_gated and duplicate_of_id is null and closed_at is null)
    when 'event' then exists (select 1 from public.events where slug=p_slug and safety_gated)
    when 'organization' then exists (select 1 from public.organizations
      where slug=p_slug and safety_gated and status='active')
    when 'milestone' then exists (select 1 from public.milestones
      where slug=p_slug and safety_gated and status='published' and duplicate_of_id is null)
    when 'guide' then exists (select 1 from public.guides
      where slug=p_slug and safety_gated and status='published')
    when 'queer_village' then exists (select 1 from public.queer_villages
      where slug=p_slug and safety_gated and duplicate_of_id is null)
    when 'tag' then exists (select 1 from public.unified_tags
      where slug=p_slug and status='active' and not restoration_review_required
        and public.tag_is_anon_gated(is_sensitive,verification_status))
    else false
  end;
$$;

create or replace function public.tag_restoration_review_queue(
  p_limit integer default 20,p_offset integer default 0
) returns table(total_count bigint,tag_id uuid,slug text,name text,
  publication_role text,entity_kind public.tag_entity_kind,category text,
  description text,usage integer,previous_reason text,priority bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.role()<>'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  return query
  select count(*) over(),t.id,t.slug,t.name,t.publication_role,t.entity_kind,t.category,
    t.description,coalesce(t.usage_count,0),t.restoration_previous_reason,
    (case when t.description is not null and t.category_id is not null then 2000000000 else 1000000000 end
      + coalesce(t.usage_count,0))::bigint
  from public.unified_tags t
  where t.status='active' and t.restoration_review_required
  order by 11 desc,t.slug
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end $$;

revoke all on function public.tag_restoration_review_queue(integer,integer) from public,anon;
grant execute on function public.tag_restoration_review_queue(integer,integer) to authenticated,service_role;

create or replace function public.review_tag_restoration(
  p_tag_id uuid,p_decision text,p_description text default null
) returns public.unified_tags
language plpgsql security definer set search_path=public as $$
declare v public.unified_tags; v_description text;
begin
  if auth.role()<>'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if p_decision not in ('article','utility','retire') then
    raise exception 'decision must be article, utility, or retire' using errcode='22023';
  end if;
  select * into v from public.unified_tags
   where id=p_tag_id and status='active' and restoration_review_required for update;
  if not found then raise exception 'restoration candidate not found' using errcode='P0002'; end if;

  if p_decision='retire' then
    update public.unified_tags set status='deprecated',deprecated_at=now(),
      deprecation_reason='reviewed retirement after deprecated-corpus audit',
      restoration_review_required=false,seo_indexable=false,
      seo_deindex_reason='reviewed_retirement'
    where id=p_tag_id returning * into v;
    return v;
  end if;

  if p_decision='utility' then
    update public.unified_tags set publication_role='utility',
      restoration_review_required=false,publication_role_reviewed_at=now(),
      publication_role_review_note='approved as utility vocabulary',
      seo_indexable=false,seo_deindex_reason='publication_role:utility'
    where id=p_tag_id returning * into v;
    return v;
  end if;

  v_description:=btrim(coalesce(p_description,v.description));
  if v_description is null or length(v_description)<30 then
    raise exception 'reviewed article requires a canonical description' using errcode='22023';
  end if;
  if (select count(*) from public.tag_category_assignments a where a.tag_id=p_tag_id and a.is_primary)<>1 then
    raise exception 'reviewed article requires exactly one primary category' using errcode='22023';
  end if;
  if (v.is_sensitive or v.is_adult) and not exists(
    select 1 from public.tag_sources s where s.tag_id=p_tag_id and coalesce(s.is_public,false)
  ) then raise exception 'sensitive article requires a public source' using errcode='22023'; end if;

  update public.unified_tags set publication_role='article',description=v_description,
    restoration_review_required=false,human_reviewed=true,
    verification_status='reviewed',prose_reviewed_at=now(),last_verified_at=now(),
    publication_role_reviewed_at=now(),
    publication_role_review_note='approved article after deprecated-corpus audit',
    seo_indexable=true,seo_deindex_reason=null
  where id=p_tag_id returning * into v;
  return v;
end $$;

revoke all on function public.review_tag_restoration(uuid,text,text) from public,anon;
grant execute on function public.review_tag_restoration(uuid,text,text) to authenticated,service_role;

-- The ordinary description review also completes a quarantined article.
create or replace function public.review_tag_description(p_tag_id uuid,p_description text)
returns public.unified_tags language plpgsql security definer set search_path=public as $$
declare v_tag public.unified_tags;
begin
  if auth.role()<>'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if nullif(btrim(p_description),'') is null or length(btrim(p_description))<30 then
    raise exception 'A reviewed description must contain at least 30 characters' using errcode='22023';
  end if;
  select * into v_tag from public.unified_tags where id=p_tag_id and status='active' for update;
  if not found then raise exception 'Active tag not found' using errcode='P0002'; end if;
  if v_tag.publication_role<>'article' then
    raise exception 'Only article-role tags have publishable descriptions' using errcode='22023';
  end if;
  if lower(regexp_replace(btrim(p_description),'[[:punct:]]','','g'))=
     lower(regexp_replace(v_tag.name||' related to '||coalesce(v_tag.category,''),'[[:punct:]]','','g')) then
    raise exception 'Generic “X related to Y” boilerplate is not publishable' using errcode='22023';
  end if;
  if p_description~*'(as an ai|cannot provide|i am unable|language model)' then
    raise exception 'Refusal or model boilerplate is not publishable' using errcode='22023';
  end if;
  if exists(select 1 from public.unified_tags t where t.id<>p_tag_id and t.status='active'
    and lower(btrim(t.description))=lower(btrim(p_description))) then
    raise exception 'This description duplicates another active glossary entry' using errcode='22023';
  end if;
  update public.unified_tags set description=btrim(p_description),human_reviewed=true,
    verification_status='reviewed',prose_reviewed_at=now(),last_verified_at=now(),
    restoration_review_required=false
  where id=p_tag_id returning * into v_tag;
  return v_tag;
end $$;

revoke all on function public.review_tag_description(uuid,text) from public,anon;
grant execute on function public.review_tag_description(uuid,text) to authenticated,service_role;

-- Patch the role-aware scorecard with the restoration backlog.
do $scorecard_base$
begin
  if to_regprocedure('public.tag_quality_scorecard_entity_base()') is null then
    alter function public.tag_quality_scorecard_v2() rename to tag_quality_scorecard_entity_base;
  end if;
end $scorecard_base$;
create or replace function public.tag_quality_scorecard_v2()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb; v_pending bigint;
begin
  v:=public.tag_quality_scorecard_entity_base();
  select count(*) into v_pending from public.unified_tags
   where status='active' and restoration_review_required;
  return jsonb_set(v,'{issues,restoration_review_pending}',to_jsonb(v_pending),true);
end $$;
revoke all on function public.tag_quality_scorecard_v2() from public,anon;
grant execute on function public.tag_quality_scorecard_v2() to authenticated,service_role;

create or replace function public.tag_publication_signals()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb;
begin
  perform public.assert_admin_or_internal();
  select jsonb_build_object(
    'active_without_role',count(*) filter(where publication_role is null),
    'utility_indexable',count(*) filter(where publication_role='utility' and seo_indexable),
    'redirect_indexable',count(*) filter(where publication_role='entity_redirect' and seo_indexable),
    'redirect_missing_canonical_target',count(*) filter(where publication_role='entity_redirect' and
      (canonical_entity_type is null or canonical_entity_id is null or canonical_entity_path is null or canonical_entity_reviewed_at is null)),
    'entity_kind_published_as_article',count(*) filter(where publication_role='article' and entity_kind in ('person','place')),
    'article_indexable_without_canonical_description',count(*) filter(where publication_role='article' and seo_indexable and not public.tag_has_prose(description,short_description)),
    'article_without_primary_category',count(*) filter(where publication_role='article' and
      (select count(*) from public.tag_category_assignments a where a.tag_id=unified_tags.id and a.is_primary)<>1),
    'restoration_candidate_indexable',count(*) filter(where restoration_review_required and seo_indexable),
    'restoration_candidate_in_public_search',(select count(*) from public.search_documents d
      join public.unified_tags t on t.id=d.entity_id
      where d.entity_type='tag' and t.restoration_review_required)
  ) into v from public.unified_tags where status='active';
  return v;
end $$;
revoke all on function public.tag_publication_signals() from public,anon,authenticated;
grant execute on function public.tag_publication_signals() to service_role;

do $verify$
declare v_restored bigint; v_pending bigint;
begin
  select count(*) into v_restored from public.unified_tags
   where status='active' and restoration_started_at is not null;
  if v_restored<3000 then
    raise exception 'deprecated-corpus repair restored only % rows; expected at least 3000',v_restored;
  end if;
  select count(*) into v_pending from public.unified_tags
   where status='active' and restoration_review_required;
  if v_pending<>0 then
    raise exception 'deprecated-corpus repair created % unresolved admin items',v_pending;
  end if;
  if exists(select 1 from public.unified_tags where restoration_review_required and seo_indexable) then
    raise exception 'restoration candidate became indexable';
  end if;
  if exists(select 1 from public.search_documents d join public.unified_tags t on t.id=d.entity_id
    where d.entity_type='tag' and t.restoration_review_required) then
    raise exception 'restoration candidate leaked into public search';
  end if;
  if exists(select 1 from public.unified_tags where status='deprecated'
    and deprecation_reason in ('auto: zero usage','data-quality audit 2026-06-05: orphan tag (no entity assignments, relations, synonyms, or aliases)')) then
    raise exception 'unsupported bulk deprecation remains';
  end if;
end $verify$;
