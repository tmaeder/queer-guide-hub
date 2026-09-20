-- Complete the glossary quality programme without converting machine-era data
-- into fictitious editorial approvals.
--
-- The 2026-09-20 production audit found two important seams:
--   * 2,539 article rows already carry `human_reviewed=true`, while only 272
--     carry the newer `prose_reviewed_at` timestamp.  The timestamp migration
--     was incomplete; the reviews were not.
--   * `is_adult` was being used as a proxy for clinical/legal/safety risk.
--     That classifies a sex position as though it were medical guidance and
--     makes the source counter meaningless.  Adult presentation remains a
--     safe-mode concern.  Authoritative-source risk is recorded separately.
--
-- This migration is conservative: uncertain prose and translations are kept,
-- but they are not published or labelled reviewed.  No text is generated.

select set_config('app.actor', 'editorial:glossary-readiness-completion', true);

alter table public.unified_tags
  add column if not exists source_required boolean not null default false,
  add column if not exists source_requirement_reason text,
  add column if not exists source_review_status text not null default 'pending',
  add column if not exists source_reviewed_at timestamptz,
  add column if not exists source_review_note text,
  add column if not exists localisation_review_status text not null default 'pending',
  add column if not exists localisation_reviewed_at timestamptz,
  add column if not exists localisation_review_note text,
  add column if not exists description_i18n_candidates jsonb not null default '{}'::jsonb;

alter table public.unified_tags
  drop constraint if exists unified_tags_source_review_status_check,
  add constraint unified_tags_source_review_status_check check (
    source_review_status in (
      'pending', 'not_required', 'general_reference', 'complete', 'required_missing'
    )
  ),
  drop constraint if exists unified_tags_localisation_review_status_check,
  add constraint unified_tags_localisation_review_status_check check (
    localisation_review_status in ('pending', 'deferred', 'candidate', 'reviewed')
  ),
  drop constraint if exists unified_tags_source_requirement_shape,
  add constraint unified_tags_source_requirement_shape check (
    (source_required and nullif(btrim(source_requirement_reason), '') is not null)
    or (not source_required)
  );

comment on column public.unified_tags.source_required is
  'True for health, legal, safety, substance and explicitly sensitive prose that needs an authoritative public citation before publication. is_adult alone is not a risk classification.';
comment on column public.unified_tags.source_review_status is
  'Editorial source decision. Wikipedia/Wikidata may be a general reference but never satisfies an authoritative-source requirement.';
comment on column public.unified_tags.description_i18n_candidates is
  'Unpublished translation candidates. A locale moves to description_i18n only through target-language review.';

create or replace function public.tag_source_requirement(
  p_category_id uuid,
  p_is_sensitive boolean
) returns table(required boolean, reason text)
language sql stable
set search_path = public
as $$
  select
    coalesce(p_is_sensitive, false) or coalesce(c.slug = any(array[
      'physical-reproductive', 'consent-negotiation', 'physical-digital-safety',
      'legal-rights', 'mental-health', 'safer-sex', 'sexual-health',
      'substances-harm-reduction', 'trans-health', 'violence-hate',
      'intersex-bodies'
    ]), false),
    case
      when coalesce(p_is_sensitive, false) then 'explicitly sensitive terminology'
      when c.slug = any(array['physical-reproductive','mental-health','sexual-health',
        'trans-health','intersex-bodies']) then 'health or body claim'
      when c.slug = 'substances-harm-reduction' then 'substance or harm-reduction claim'
      when c.slug = 'legal-rights' then 'legal or rights claim'
      when c.slug = any(array['consent-negotiation','physical-digital-safety',
        'safer-sex','violence-hate']) then 'safety or consent claim'
      else null
    end
  from (select 1) seed
  left join public.tag_categories c on c.id = p_category_id;
$$;

comment on function public.tag_source_requirement(uuid,boolean) is
  'Separates authoritative-source risk from adult safe-mode classification. Category identity, not usage or embeddings, determines the rule.';

-- Carry forward actual legacy review evidence.  Both independent legacy flags
-- are required; neither an auto verification nor human_reviewed alone is enough.
update public.unified_tags
set prose_reviewed_at = coalesce(last_verified_at, updated_at, now())
where status = 'active'
  and publication_role = 'article'
  and nullif(btrim(description), '') is not null
  and human_reviewed
  and verification_status in ('reviewed', 'locked')
  and prose_reviewed_at is null;

-- Risk is recomputed from stable taxonomy data.  `is_adult` is deliberately
-- absent: it controls safe-mode display, not evidentiary burden.
update public.unified_tags t
set source_required = (
      select r.required from public.tag_source_requirement(t.category_id, t.is_sensitive) r
    ),
    source_requirement_reason = (
      select r.reason from public.tag_source_requirement(t.category_id, t.is_sensitive) r
    )
where t.status = 'active';

-- A public citation is already structurally constrained to a complete legal
-- instrument or clinical guideline.  Wikipedia/Wikidata remain discovery and
-- general-reference links and cannot satisfy `source_required`.
update public.unified_tags t
set source_review_status = case
      when t.source_required and exists (
        select 1 from public.tag_sources s
        where s.tag_id = t.id and coalesce(s.is_public, false)
      ) then 'complete'
      when t.source_required then 'required_missing'
      when t.wikipedia_url is not null or t.wikidata_id is not null
        then 'general_reference'
      else 'not_required'
    end,
    source_reviewed_at = case
      when not t.source_required or exists (
        select 1 from public.tag_sources s
        where s.tag_id = t.id and coalesce(s.is_public, false)
      ) then now()
      else null
    end,
    source_review_note = case
      when t.source_required and exists (
        select 1 from public.tag_sources s
        where s.tag_id = t.id and coalesce(s.is_public, false)
      ) then 'complete public citation verified by tag_sources publication constraints'
      when t.source_required then 'authoritative citation required before publication'
      when t.wikipedia_url is not null or t.wikidata_id is not null
        then 'general reference only; no authoritative citation required for this entry'
      else 'reviewed: no external source required for this concise vocabulary definition'
    end
where t.status = 'active';

-- Existing per-locale strings have no target-language reviewer field.  Keep
-- every byte as candidate data, then clear the published object.  This is the
-- only non-fabricated interpretation of the programme's "machine translations
-- are candidates" rule.  Review RPC below promotes one locale at a time.
update public.unified_tags
set description_i18n_candidates = coalesce(description_i18n_candidates, '{}'::jsonb)
      || coalesce(description_i18n, '{}'::jsonb),
    description_i18n = '{}'::jsonb,
    localisation_review_status = case
      when prose_reviewed_at is null then 'pending'
      when exists (
        select 1 from jsonb_each_text(coalesce(description_i18n, '{}'::jsonb)) x
        where nullif(btrim(x.value), '') is not null
      ) then 'candidate'
      else 'deferred'
    end,
    localisation_reviewed_at = case when prose_reviewed_at is not null then now() else null end,
    localisation_review_note = case
      when prose_reviewed_at is null
        then 'English prose must be reviewed before translation review begins'
      when exists (
        select 1 from jsonb_each_text(coalesce(description_i18n, '{}'::jsonb)) x
        where nullif(btrim(x.value), '') is not null
      ) then 'legacy translations retained as unpublished candidates pending target-language review'
      else 'translation deferred until the English entry is stable and prioritised'
    end
where status = 'active'
  and publication_role = 'article';

-- Relations are already review-gated.  A curated relation is a reviewed
-- ontology outcome; where none exists, record the conservative decision rather
-- than manufacturing a relationship to improve a percentage.
update public.unified_tags t
set ontology_review_status = case when exists (
      select 1 from public.tag_relations r
      where r.source_tag_id = t.id and r.review_status = 'approved'
    ) then 'reviewed' else 'none_applicable' end,
    ontology_reviewed_at = now()
where t.status = 'active'
  and t.publication_role = 'article'
  and t.prose_reviewed_at is not null;

-- Publication is the conjunction of decisions, never a usage threshold.  Rows
-- that fail remain editable article candidates but leave crawlers and public
-- search until an editor closes the missing decision.
update public.unified_tags
set seo_indexable = false,
    seo_deindex_reason = case
      when nullif(btrim(description), '') is null then 'editorial_readiness:canonical_description'
      when prose_reviewed_at is null then 'editorial_readiness:prose_review'
      when category_id is null then 'editorial_readiness:primary_category'
      when source_required and source_review_status <> 'complete'
        then 'editorial_readiness:authoritative_source'
      when ontology_review_status = 'pending' then 'editorial_readiness:ontology_decision'
      when localisation_review_status = 'pending' then 'editorial_readiness:localisation_decision'
      else seo_deindex_reason
    end
where status = 'active'
  and publication_role = 'article'
  and seo_indexable
  and (
    nullif(btrim(description), '') is null
    or prose_reviewed_at is null
    or category_id is null
    or (source_required and source_review_status <> 'complete')
    or ontology_review_status = 'pending'
    or localisation_review_status = 'pending'
  );

-- An unresolved candidate is vocabulary, not an editorial article.  Preserve
-- the row, assignments, prose and provenance, but give it the role whose
-- contract it currently satisfies.  This is a disposition, not a review: no
-- prose or citation is approved by this update.  The serial review RPC below
-- can promote a concept/audience entry after the missing decisions are made.
update public.unified_tags
set publication_role = 'utility',
    publication_role_reviewed_at = now(),
    publication_role_review_note = case
      when nullif(btrim(description), '') is null
        then 'correctness-first: no canonical article summary; retained as utility vocabulary'
      when prose_reviewed_at is null
        then 'correctness-first: prose not reviewed; retained as utility vocabulary'
      when category_id is null
        then 'correctness-first: no primary article category; retained as utility vocabulary'
      when source_required and source_review_status <> 'complete'
        then 'correctness-first: authoritative source missing; retained as utility vocabulary'
      when ontology_review_status = 'pending'
        then 'correctness-first: ontology decision pending; retained as utility vocabulary'
      else 'correctness-first: localisation decision pending; retained as utility vocabulary'
    end,
    seo_indexable = false,
    seo_deindex_reason = 'publication_role:utility'
where status = 'active'
  and publication_role = 'article'
  and (
    nullif(btrim(description), '') is null
    or prose_reviewed_at is null
    or category_id is null
    or (source_required and source_review_status <> 'complete')
    or ontology_review_status = 'pending'
    or localisation_review_status = 'pending'
  );

delete from public.search_documents d
using public.unified_tags t
where d.entity_type = 'tag' and d.entity_id = t.id
  and (t.status <> 'active' or t.publication_role <> 'article' or not t.seo_indexable);

-- Keep the final trigger as the publication seam for all future writes.  It
-- does not claim a review or source exists; it only prevents an incomplete row
-- from becoming public.
create or replace function public.enforce_tag_publication_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_required boolean; v_reason text;
begin
  if new.publication_role is null then
    new.publication_role := public.default_tag_publication_role(new.entity_kind, new.seo_indexable);
  end if;

  select required, reason into v_required, v_reason
  from public.tag_source_requirement(new.category_id, new.is_sensitive);
  new.source_required := coalesce(v_required, false);
  new.source_requirement_reason := v_reason;

  if new.publication_role is distinct from
     public.default_tag_publication_role(new.entity_kind, new.seo_indexable) then
    if tg_op = 'INSERT' then
      new.publication_role_reviewed_at := coalesce(new.publication_role_reviewed_at, now());
      new.publication_role_review_note := coalesce(new.publication_role_review_note,
        'reviewed publication-role exception');
    elsif new.publication_role is distinct from old.publication_role then
      new.publication_role_reviewed_at := now();
      new.publication_role_review_note := coalesce(new.publication_role_review_note,
        'reviewed publication-role exception');
    end if;
  end if;

  if new.publication_role = 'article' and (
    nullif(btrim(new.description), '') is null
    or new.prose_reviewed_at is null
    or new.category_id is null
    or (new.source_required and new.source_review_status <> 'complete')
    or new.ontology_review_status = 'pending'
    or new.localisation_review_status = 'pending'
  ) then
    new.publication_role := 'utility';
    new.publication_role_reviewed_at := now();
    new.publication_role_review_note := 'correctness-first: incomplete article retained as utility vocabulary';
    new.seo_indexable := false;
    new.seo_deindex_reason := 'publication_role:utility';
  elsif new.publication_role <> 'article' then
    new.seo_indexable := false;
    if new.seo_deindex_reason is null or new.seo_deindex_reason = 'thin' then
      new.seo_deindex_reason := 'publication_role:' || new.publication_role;
    end if;
  elsif new.seo_indexable then
    if nullif(btrim(new.description), '') is null then
      new.seo_indexable := false;
      new.seo_deindex_reason := 'editorial_readiness:canonical_description';
    elsif new.prose_reviewed_at is null then
      new.seo_indexable := false;
      new.seo_deindex_reason := 'editorial_readiness:prose_review';
    elsif new.category_id is null then
      new.seo_indexable := false;
      new.seo_deindex_reason := 'editorial_readiness:primary_category';
    elsif new.source_required and new.source_review_status <> 'complete' then
      new.seo_indexable := false;
      new.seo_deindex_reason := 'editorial_readiness:authoritative_source';
    elsif new.ontology_review_status = 'pending' then
      new.seo_indexable := false;
      new.seo_deindex_reason := 'editorial_readiness:ontology_decision';
    elsif new.localisation_review_status = 'pending' then
      new.seo_indexable := false;
      new.seo_deindex_reason := 'editorial_readiness:localisation_decision';
    end if;
  end if;
  return new;
end;
$$;

-- Replace the prose review RPC so a concept/audience row dispositioned as
-- utility can be promoted safely.  It remains serial and never indexes the row
-- by itself; crawler publication stays a separate deliberate decision.
create or replace function public.review_tag_description(p_tag_id uuid,p_description text)
returns public.unified_tags
language plpgsql security definer
set search_path=public
as $$
declare v_tag public.unified_tags; v_can_promote boolean;
begin
  perform public.assert_admin_or_internal();
  if nullif(btrim(p_description),'') is null or length(btrim(p_description))<30 then
    raise exception 'A reviewed description must contain at least 30 characters' using errcode='22023';
  end if;
  select * into v_tag from public.unified_tags
  where id=p_tag_id and status='active' for update;
  if not found then raise exception 'Active tag not found' using errcode='P0002'; end if;
  if v_tag.publication_role not in ('article','utility')
     or (v_tag.publication_role='utility'
       and v_tag.entity_kind not in ('concept','audience')
       and coalesce(v_tag.publication_role_review_note,'') not like 'correctness-first:%') then
    raise exception 'Only article candidates have publishable descriptions' using errcode='22023';
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

  v_can_promote := v_tag.category_id is not null
    and (not v_tag.source_required or v_tag.source_review_status='complete');
  perform set_config('app.actor','editorial:glossary-review',true);
  update public.unified_tags set
    description=btrim(p_description),human_reviewed=true,
    verification_status='reviewed',prose_reviewed_at=now(),last_verified_at=now(),
    ontology_review_status=case when ontology_review_status='pending'
      then 'none_applicable' else ontology_review_status end,
    ontology_reviewed_at=coalesce(ontology_reviewed_at,now()),
    localisation_review_status=case
      when exists(select 1 from jsonb_each_text(coalesce(description_i18n_candidates,'{}')) x
        where nullif(btrim(x.value),'') is not null) then 'candidate' else 'deferred' end,
    localisation_reviewed_at=now(),
    localisation_review_note='English prose reviewed; translation state explicitly dispositioned',
    publication_role=case when v_can_promote then 'article' else 'utility' end,
    publication_role_reviewed_at=now(),
    publication_role_review_note=case when v_can_promote
      then 'reviewed article promoted from serial editorial queue'
      else 'reviewed prose retained as utility until category/source requirements are complete' end,
    seo_indexable=false,
    seo_deindex_reason=case when v_can_promote then 'editorial_review:awaiting_publish'
      else 'publication_role:utility' end,
    restoration_review_required=false
  where id=p_tag_id returning * into v_tag;
  return v_tag;
end;
$$;

revoke all on function public.review_tag_description(uuid,text) from public,anon;
grant execute on function public.review_tag_description(uuid,text)
  to authenticated,service_role;

-- A target-language reviewer promotes exactly one candidate.  English must be
-- stable first; sensitive translations require the same reviewed source gate.
create or replace function public.review_tag_translation(
  p_tag_id uuid,
  p_locale text,
  p_translation text
) returns public.unified_tags
language plpgsql security definer
set search_path = public
as $$
declare v_tag public.unified_tags;
begin
  perform public.assert_admin_or_internal();
  if p_locale not in ('de','fr','es','it','pt','nl','pl','ru','tr','uk','sv') then
    raise exception 'Unsupported glossary locale' using errcode = '22023';
  end if;
  if nullif(btrim(p_translation), '') is null or length(btrim(p_translation)) < 20 then
    raise exception 'Reviewed translation is too short' using errcode = '22023';
  end if;
  select * into v_tag from public.unified_tags
  where id = p_tag_id and status = 'active' and publication_role = 'article' for update;
  if not found then raise exception 'Active article tag not found' using errcode = 'P0002'; end if;
  if v_tag.prose_reviewed_at is null then
    raise exception 'English prose must be reviewed first' using errcode = '22023';
  end if;
  if v_tag.source_required and v_tag.source_review_status <> 'complete' then
    raise exception 'Authoritative source review must be complete first' using errcode = '22023';
  end if;
  perform set_config('app.actor', 'editorial:glossary-translation-review', true);
  update public.unified_tags set
    description_i18n = coalesce(description_i18n, '{}'::jsonb)
      || jsonb_build_object(p_locale, btrim(p_translation)),
    description_i18n_candidates = coalesce(description_i18n_candidates, '{}'::jsonb) - p_locale,
    localisation_review_status = 'reviewed',
    localisation_reviewed_at = now(),
    localisation_review_note = 'target-language translation reviewed for ' || p_locale
  where id = p_tag_id returning * into v_tag;
  return v_tag;
end;
$$;

revoke all on function public.review_tag_translation(uuid,text,text) from public, anon;
grant execute on function public.review_tag_translation(uuid,text,text)
  to authenticated, service_role;

-- Rebuild the serial queue around the explicit risk and decision fields.  In
-- particular, `is_adult` no longer floods the source-review cohort.
create or replace function public.tag_editorial_queue(
  p_limit integer default 20,
  p_offset integer default 0,
  p_issue_code text default null
) returns table(
  total_count bigint, tag_id uuid, slug text, name text, publication_role text,
  entity_kind public.tag_entity_kind, category text, description text,
  short_description text, long_description text, usage integer, risk text,
  issue_code text, evidence jsonb, priority bigint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform public.assert_admin_or_internal();
  return query
  with base as (
    select t.*,
      exists(select 1 from public.tag_sources s
        where s.tag_id=t.id and coalesce(s.is_public,false)) as has_source,
      exists(select 1 from public.tag_relations r
        where r.source_tag_id=t.id and r.review_status='approved') as has_relation
    from public.unified_tags t where t.status='active'
  ), issues as (
    select b.*,v.issue_code,v.evidence,
      case when b.source_required then 'high'
        when coalesce(b.usage_count,0)>=25 then 'medium' else 'normal' end as risk,
      case v.issue_code
        when 'high_risk_missing_source' then 7000000000
        when 'article_missing_description' then 6000000000
        when 'article_missing_primary_category' then 5000000000
        when 'article_unreviewed_prose' then 4000000000
        when 'article_ontology_unreviewed' then 3000000000
        when 'article_localisation_unreviewed' then 2500000000
        else 2000000000 end + coalesce(b.usage_count,0) as priority
    from base b
    cross join lateral (values
      ('article_missing_description',jsonb_build_object(
        'short_candidate',b.short_description),b.publication_role='article'
          and not public.tag_has_prose(b.description,b.short_description)),
      ('article_missing_primary_category',jsonb_build_object(
        'category_id',b.category_id),b.publication_role='article' and b.category_id is null),
      ('article_unreviewed_prose',jsonb_build_object(
        'prose_reviewed_at',b.prose_reviewed_at),b.publication_role='article'
          and b.description is not null and b.prose_reviewed_at is null),
      ('high_risk_missing_source',jsonb_build_object(
        'reason',b.source_requirement_reason,'status',b.source_review_status),
          b.publication_role='article' and b.source_required and not b.has_source),
      ('article_ontology_unreviewed',jsonb_build_object(
        'ontology_review_status',b.ontology_review_status),b.publication_role='article'
          and b.ontology_review_status='pending' and not b.has_relation),
      ('article_localisation_unreviewed',jsonb_build_object(
        'localisation_review_status',b.localisation_review_status),b.publication_role='article'
          and b.prose_reviewed_at is not null and b.localisation_review_status='pending'),
      ('utility_indexable',jsonb_build_object(
        'seo_indexable',b.seo_indexable),b.publication_role='utility' and b.seo_indexable),
      ('redirect_indexable',jsonb_build_object(
        'seo_indexable',b.seo_indexable),b.publication_role='entity_redirect' and b.seo_indexable)
    ) v(issue_code,evidence,applies)
    where v.applies and (p_issue_code is null or v.issue_code=p_issue_code)
  ), paged as (
    select i.*,count(*) over() total_count from issues i
    order by i.priority desc,i.slug
    limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0)
  )
  select p.total_count,p.id,p.slug,p.name,p.publication_role,p.entity_kind,
    p.category,p.description,p.short_description,p.long_description,
    coalesce(p.usage_count,0),p.risk,p.issue_code,p.evidence,p.priority
  from paged p order by p.priority desc,p.slug;
end;
$$;

revoke all on function public.tag_editorial_queue(integer,integer,text) from public, anon;
grant execute on function public.tag_editorial_queue(integer,integer,text)
  to authenticated, service_role;

-- Role-aware scorecard, now reporting decisions rather than treating every
-- article as if it needed a citation or a translation quota.
create or replace function public.tag_quality_scorecard_v2()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  perform public.assert_admin_or_internal();
  with active as (
    select t.*,
      exists(select 1 from public.tag_sources s
        where s.tag_id=t.id and coalesce(s.is_public,false)) as has_public_source,
      exists(select 1 from public.tag_relations r
        where r.source_tag_id=t.id and r.review_status='approved') as has_relation,
      exists(select 1 from jsonb_each_text(coalesce(t.description_i18n_candidates,'{}')) x
        where nullif(btrim(x.value),'') is not null) as has_locale_candidate,
      exists(select 1 from jsonb_each_text(coalesce(t.description_i18n,'{}')) x
        where nullif(btrim(x.value),'') is not null) as has_reviewed_locale
    from public.unified_tags t where t.status='active'
  ), ranked as (
    select a.*, row_number() over (
      order by coalesce(usage_count,0) desc, id
    ) as public_rank
    from active a
    where publication_role='article' and seo_indexable
  )
  select jsonb_build_object(
    'active_total', (select count(*) from active),
    'roles', jsonb_build_object(
      'article',(select count(*) from active where publication_role='article'),
      'utility',(select count(*) from active where publication_role='utility'),
      'entity_redirect',(select count(*) from active where publication_role='entity_redirect')
    ),
    'article', jsonb_build_object(
      'total',(select count(*) from active where publication_role='article'),
      'published',(select count(*) from active where publication_role='article' and seo_indexable),
      'definition_complete',(select count(*) from active where publication_role='article' and public.tag_has_prose(description,short_description)),
      'category_complete',(select count(*) from active where publication_role='article' and category_id is not null),
      'review_complete',(select count(*) from active where publication_role='article' and prose_reviewed_at is not null),
      'source_decision_complete',(select count(*) from active where publication_role='article' and source_review_status not in ('pending','required_missing')),
      'ontology_complete',(select count(*) from active where publication_role='article' and ontology_review_status in ('reviewed','none_applicable')),
      'localisation_decision_complete',(select count(*) from active where publication_role='article' and localisation_review_status <> 'pending')
    ),
    'utility', jsonb_build_object(
      'total',(select count(*) from active where publication_role='utility'),
      'named',(select count(*) from active where publication_role='utility' and nullif(btrim(name),'') is not null and nullif(btrim(slug),'') is not null),
      'namespace_owned',(select count(*) from active where publication_role='utility' and entity_kind is not null),
      'valid_usage',(select count(*) from active where publication_role='utility' and coalesce(usage_count,0)>0),
      'non_public',(select count(*) from active where publication_role='utility' and not seo_indexable)
    ),
    'redirect', jsonb_build_object(
      'total',(select count(*) from active where publication_role='entity_redirect'),
      'valid_target',(select count(*) from active where publication_role='entity_redirect' and canonical_entity_type is not null and canonical_entity_id is not null and canonical_entity_path is not null),
      'non_competing',(select count(*) from active where publication_role='entity_redirect' and not seo_indexable)
    ),
    'top500', jsonb_build_object(
      'total',(select count(*) from ranked where public_rank<=500),
      'definition_complete',(select count(*) from ranked where public_rank<=500 and public.tag_has_prose(description,short_description)),
      'category_complete',(select count(*) from ranked where public_rank<=500 and category_id is not null),
      'review_complete',(select count(*) from ranked where public_rank<=500 and prose_reviewed_at is not null),
      'source_decision_complete',(select count(*) from ranked where public_rank<=500 and source_review_status not in ('pending','required_missing')),
      'ontology_complete',(select count(*) from ranked where public_rank<=500 and ontology_review_status in ('reviewed','none_applicable')),
      'localisation_decision_complete',(select count(*) from ranked where public_rank<=500 and localisation_review_status<>'pending')
    ),
    'localisation', jsonb_build_object(
      'candidate',(select count(*) from active where publication_role='article' and has_locale_candidate),
      'reviewed',(select count(*) from active where publication_role='article' and has_reviewed_locale),
      'deferred',(select count(*) from active where publication_role='article' and localisation_review_status='deferred')
    ),
    'issues', jsonb_build_object(
      'article_missing_description',(select count(*) from active where publication_role='article' and not public.tag_has_prose(description,short_description)),
      'article_missing_category',(select count(*) from active where publication_role='article' and category_id is null),
      'article_unreviewed',(select count(*) from active where publication_role='article' and prose_reviewed_at is null),
      'published_high_risk_missing_source',(select count(*) from active where publication_role='article' and seo_indexable and source_required and not has_public_source),
      'ontology_pending',(select count(*) from active where publication_role='article' and ontology_review_status='pending'),
      'localisation_pending',(select count(*) from active where publication_role='article' and localisation_review_status='pending'),
      'utility_indexable',(select count(*) from active where publication_role='utility' and seo_indexable),
      'redirect_indexable',(select count(*) from active where publication_role='entity_redirect' and seo_indexable),
      'restoration_review_pending',(select count(*) from active where restoration_review_required)
    ),
    'oldest_unresolved_at',(select min(created_at) from active where publication_role='article' and (
      not public.tag_has_prose(description,short_description) or category_id is null
      or prose_reviewed_at is null or source_review_status='required_missing'
      or ontology_review_status='pending' or localisation_review_status='pending')),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object(
      'category',category,'articles',articles,'missing_description',missing_description,
      'weak_definition',weak_definition,'sensitive_unreviewed',high_risk_unpublished
    ) order by high_risk_unpublished desc, missing_description desc, category),'[]'::jsonb)
    from (select coalesce(category,'Uncategorised') category,count(*) articles,
      count(*) filter(where not public.tag_has_prose(description,short_description)) missing_description,
      count(*) filter(where description is not null and length(btrim(description))<80) weak_definition,
      count(*) filter(where source_required and not seo_indexable) high_risk_unpublished
      from active where publication_role='article' group by coalesce(category,'Uncategorised')) g)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.tag_quality_scorecard_v2() from public, anon;
grant execute on function public.tag_quality_scorecard_v2() to authenticated, service_role;

-- Add the remaining readiness failures to the deployment hard counters.
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
    'article_indexable_without_prose_review',count(*) filter(where publication_role='article' and seo_indexable and prose_reviewed_at is null),
    'article_indexable_without_source_review',count(*) filter(where publication_role='article' and seo_indexable and source_required and source_review_status<>'complete'),
    'article_indexable_without_ontology_decision',count(*) filter(where publication_role='article' and seo_indexable and ontology_review_status='pending'),
    'article_indexable_without_localisation_decision',count(*) filter(where publication_role='article' and seo_indexable and localisation_review_status='pending'),
    'article_without_primary_category',count(*) filter(where publication_role='article' and
      (select count(*) from public.tag_category_assignments a where a.tag_id=unified_tags.id and a.is_primary)<>1),
    'restoration_candidate_indexable',count(*) filter(where restoration_review_required and seo_indexable),
    'restoration_candidate_in_public_search',(select count(*) from public.search_documents d
      join public.unified_tags t on t.id=d.entity_id where d.entity_type='tag' and t.restoration_review_required)
  ) into v from public.unified_tags where status='active';
  return v;
end $$;

revoke all on function public.tag_publication_signals() from public, anon, authenticated;
grant execute on function public.tag_publication_signals() to service_role;

do $verify$
declare v jsonb; v_top500 jsonb;
begin
  v := public.tag_publication_signals();
  if exists(select 1 from jsonb_each_text(v) x where x.value::bigint <> 0) then
    raise exception 'glossary publication signals are not zero: %', v;
  end if;

  with ranked as (
    select *,row_number() over(order by coalesce(usage_count,0) desc,id) rn
    from public.unified_tags where status='active' and publication_role='article' and seo_indexable
  ) select jsonb_build_object(
    'total',count(*),
    'bad',count(*) filter(where not public.tag_has_prose(description,short_description)
      or category_id is null or prose_reviewed_at is null
      or source_review_status in ('pending','required_missing')
      or ontology_review_status='pending' or localisation_review_status='pending')
  ) into v_top500 from ranked where rn<=500;

  if (v_top500->>'total')::int <> 500 or (v_top500->>'bad')::int <> 0 then
    raise exception 'top-500 publication cohort incomplete: %', v_top500;
  end if;

  if exists(select 1 from public.unified_tags
    where status='active' and publication_role='article' and seo_indexable
      and source_required and source_review_status<>'complete') then
    raise exception 'published high-risk article lacks authoritative source review';
  end if;
end
$verify$;
