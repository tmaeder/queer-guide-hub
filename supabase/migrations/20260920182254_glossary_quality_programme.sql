-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260920182254 with no repo file — the signature of
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
-- Systematic glossary quality programme.
--
-- Publication intent is independent from semantic entity_kind.  Description is
-- the only publishable summary; short_description remains candidate/legacy data.

select set_config('app.actor', 'editorial:glossary-quality-programme', true);

alter table public.unified_tags
  add column if not exists publication_role text,
  add column if not exists publication_role_reviewed_at timestamptz,
  add column if not exists publication_role_review_note text,
  add column if not exists ontology_review_status text not null default 'pending',
  add column if not exists ontology_reviewed_at timestamptz;

alter table public.unified_tags
  drop constraint if exists unified_tags_publication_role_check,
  add constraint unified_tags_publication_role_check
    check (publication_role in ('article', 'utility', 'entity_redirect')),
  drop constraint if exists unified_tags_ontology_review_status_check,
  add constraint unified_tags_ontology_review_status_check
    check (ontology_review_status in ('pending', 'reviewed', 'none_applicable'));

comment on column public.unified_tags.publication_role is
  'Publishing contract independent of entity_kind: article, utility, or entity_redirect.';
comment on column public.unified_tags.short_description is
  'Legacy/candidate summary. It is not publishable prose; reviewed copy is promoted to description.';
comment on column public.unified_tags.ontology_review_status is
  'Editorial decision for broader/related links. none_applicable is a valid reviewed outcome.';

create or replace function public.default_tag_publication_role(
  p_entity_kind public.tag_entity_kind,
  p_seo_indexable boolean
) returns text
language sql immutable
set search_path = public
as $$
  select case
    when p_entity_kind = 'attribute'::public.tag_entity_kind then 'utility'
    when p_entity_kind in ('person'::public.tag_entity_kind, 'place'::public.tag_entity_kind)
      then 'entity_redirect'
    when p_entity_kind in ('concept'::public.tag_entity_kind, 'audience'::public.tag_entity_kind)
      then 'article'
    when p_entity_kind = 'descriptor'::public.tag_entity_kind
      then case when coalesce(p_seo_indexable, false) then 'article' else 'utility' end
    else 'article'
  end;
$$;

update public.unified_tags
set publication_role = public.default_tag_publication_role(entity_kind, seo_indexable)
where publication_role is null;

alter table public.unified_tags alter column publication_role set not null;

create or replace function public.enforce_tag_publication_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.publication_role is null then
    new.publication_role := public.default_tag_publication_role(new.entity_kind, new.seo_indexable);
  end if;

  if new.publication_role is distinct from
     public.default_tag_publication_role(new.entity_kind, new.seo_indexable) then
    if tg_op = 'INSERT' then
      new.publication_role_reviewed_at := coalesce(new.publication_role_reviewed_at, now());
      new.publication_role_review_note := coalesce(new.publication_role_review_note, 'reviewed publication-role exception');
    elsif new.publication_role is distinct from old.publication_role then
      new.publication_role_reviewed_at := now();
      new.publication_role_review_note := coalesce(new.publication_role_review_note, 'reviewed publication-role exception');
    end if;
  end if;

  -- Utility vocabulary and redirect labels may remain usable in tagging/search,
  -- but may never be emitted as thin glossary articles.
  if new.publication_role <> 'article' then
    new.seo_indexable := false;
    if new.seo_deindex_reason is null or new.seo_deindex_reason = 'thin' then
      new.seo_deindex_reason := 'publication_role:' || new.publication_role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_tag_publication_role on public.unified_tags;
drop trigger if exists zz_enforce_tag_publication_role on public.unified_tags;
-- `zz_` is intentional: PostgreSQL fires same-kind triggers by name, so this
-- final publication guard runs after legacy thin-page/sensitivity triggers.
create trigger zz_enforce_tag_publication_role
before insert or update
on public.unified_tags for each row execute function public.enforce_tag_publication_role();

update public.unified_tags
set seo_indexable = false,
    seo_deindex_reason = 'publication_role:' || publication_role
where status = 'active'
  and publication_role <> 'article'
  and (seo_indexable is true or seo_deindex_reason is distinct from 'publication_role:' || publication_role);

-- Canonical publication seam: short_description can help an editor, but cannot
-- make a page indexable and cannot satisfy a prose completeness check.
create or replace function public.tag_has_prose(p_description text, p_short_description text)
returns boolean
language sql immutable parallel safe
as $$
  select nullif(btrim(p_description), '') is not null;
$$;

comment on function public.tag_has_prose(text, text) is
  'True only when canonical description exists. short_description is deliberately ignored as legacy candidate data.';

update public.unified_tags
set seo_indexable = false,
    seo_deindex_reason = 'thin'
where status = 'active'
  and publication_role = 'article'
  and seo_indexable is true
  and not public.tag_has_prose(description, short_description);

-- Correct measured wrong-sense imports and the known taxonomy outlier.
update public.unified_tags
set description = 'Men-only describes a venue, event, group, or service whose admission is restricted to men. The term states an access policy; it does not describe a magazine.',
    short_description = 'Admission or participation restricted to men.',
    human_reviewed = true, verification_status = 'reviewed',
    prose_reviewed_at = now(), last_verified_at = now()
where slug = 'men-only' and status = 'active';

update public.unified_tags
set description = 'A stage is a raised or designated area where performers present theatre, music, drag, talks, or other live work to an audience.',
    short_description = 'An area used for live performance.',
    human_reviewed = true, verification_status = 'reviewed',
    prose_reviewed_at = now(), last_verified_at = now()
where slug = 'stage' and status = 'active';

update public.unified_tags
set description = 'Hindu refers to a person who follows Hinduism, or to something connected with Hindu traditions, communities, or culture. It is not the name of a country.',
    short_description = 'A follower of Hinduism, or something related to Hindu traditions.',
    human_reviewed = true, verification_status = 'reviewed',
    prose_reviewed_at = now(), last_verified_at = now()
where slug = 'hindu' and status = 'active';

update public.unified_tags
set description = 'Mullerian describes anatomy or development associated with the embryonic Mullerian ducts, which can form structures including the fallopian tubes, uterus, cervix, and upper vagina. The term describes anatomy, not a person''s gender or a synonym for “biological female”.',
    short_description = 'Relating to anatomy that develops from the embryonic Mullerian ducts.',
    category_id = (select id from public.tag_categories where slug = 'physical-reproductive'),
    category = (select name from public.tag_categories where slug = 'physical-reproductive'),
    human_reviewed = true, verification_status = 'reviewed',
    prose_reviewed_at = now(), last_verified_at = now()
where slug = 'mullerian' and status = 'active';

-- Resolve the measured article-role category gaps. Existing category mirror
-- triggers maintain the primary tag_category_assignments row.
with filing(slug, category_slug) as (values
  ('testosterone', 'trans-health'), ('packers', 'trans-health'),
  ('spandex', 'fetishes-interests'), ('denim', 'fetishes-interests'),
  ('lace', 'fetishes-interests'), ('military', 'fetishes-interests'),
  ('casting', 'fetishes-interests'), ('hookup', 'dating-connection'),
  ('artist', 'figures-icons'), ('porn-star', 'figures-icons'),
  ('adult-performer', 'figures-icons'), ('electronics', 'gear-aesthetics')
)
update public.unified_tags t
set category_id = c.id, category = c.name
from filing f join public.tag_categories c on c.slug = f.category_slug
where t.slug = f.slug and t.status = 'active' and t.category_id is null;

-- A role-aware scorecard. Usage affects queue order only and is intentionally
-- absent from intrinsic quality dimensions.
create or replace function public.tag_quality_scorecard_v2()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  with active as (
    select t.*,
      exists(select 1 from public.tag_sources s where s.tag_id=t.id and coalesce(s.is_public,false)) as has_source,
      exists(select 1 from public.tag_relations r where r.source_tag_id=t.id and r.review_status='approved') as has_approved_relation,
      (select count(*) from jsonb_each_text(coalesce(t.description_i18n, '{}'::jsonb)) x where nullif(btrim(x.value),'') is not null) as locale_count
    from public.unified_tags t where t.status='active'
  )
  select jsonb_build_object(
    'active_total', count(*),
    'roles', jsonb_build_object(
      'article', count(*) filter (where publication_role='article'),
      'utility', count(*) filter (where publication_role='utility'),
      'entity_redirect', count(*) filter (where publication_role='entity_redirect')
    ),
    'article', jsonb_build_object(
      'total', count(*) filter (where publication_role='article'),
      'definition_complete', count(*) filter (where publication_role='article' and public.tag_has_prose(description, short_description)),
      'category_complete', count(*) filter (where publication_role='article' and category_id is not null),
      'review_complete', count(*) filter (where publication_role='article' and prose_reviewed_at is not null),
      'source_complete', count(*) filter (where publication_role='article' and has_source),
      'ontology_complete', count(*) filter (where publication_role='article' and (ontology_review_status in ('reviewed','none_applicable') or has_approved_relation)),
      'localisation_started', count(*) filter (where publication_role='article' and locale_count > 0)
    ),
    'utility', jsonb_build_object(
      'total', count(*) filter (where publication_role='utility'),
      'named', count(*) filter (where publication_role='utility' and nullif(btrim(name),'') is not null and nullif(btrim(slug),'') is not null),
      'namespace_owned', count(*) filter (where publication_role='utility' and entity_kind is not null),
      'valid_usage', count(*) filter (where publication_role='utility' and coalesce(usage_count,0) > 0),
      'non_public', count(*) filter (where publication_role='utility' and seo_indexable is not true)
    ),
    'redirect', jsonb_build_object(
      'total', count(*) filter (where publication_role='entity_redirect'),
      'valid_target_kind', count(*) filter (where publication_role='entity_redirect' and entity_kind in ('person','place')),
      'non_competing', count(*) filter (where publication_role='entity_redirect' and seo_indexable is not true)
    ),
    'localisation', jsonb_build_object(
      'en_reviewed', count(*) filter (where publication_role='article' and prose_reviewed_at is not null),
      'de', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'de'),'') is not null),
      'fr', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'fr'),'') is not null),
      'es', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'es'),'') is not null),
      'it', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'it'),'') is not null),
      'pt', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'pt'),'') is not null),
      'nl', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'nl'),'') is not null),
      'pl', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'pl'),'') is not null),
      'ru', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'ru'),'') is not null),
      'tr', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'tr'),'') is not null),
      'uk', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'uk'),'') is not null),
      'sv', count(*) filter (where publication_role='article' and nullif(btrim(description_i18n->>'sv'),'') is not null)
    ),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
        'category', g.category, 'articles', g.articles, 'missing_description', g.missing_description,
        'weak_definition', g.weak_definition, 'sensitive_unreviewed', g.sensitive_unreviewed
      ) order by (g.missing_description + g.weak_definition + g.sensitive_unreviewed) desc, g.category), '[]'::jsonb)
      from (
        select coalesce(category, 'Uncategorised') as category,
          count(*) as articles,
          count(*) filter (where not public.tag_has_prose(description,short_description)) as missing_description,
          count(*) filter (where description is not null and length(btrim(description)) < 80) as weak_definition,
          count(*) filter (where (is_sensitive or is_adult) and prose_reviewed_at is null) as sensitive_unreviewed
        from active where publication_role='article'
        group by coalesce(category, 'Uncategorised')
      ) g),
    'issues', jsonb_build_object(
      'article_missing_description', count(*) filter (where publication_role='article' and not public.tag_has_prose(description, short_description)),
      'article_missing_category', count(*) filter (where publication_role='article' and category_id is null),
      'article_unreviewed', count(*) filter (where publication_role='article' and description is not null and prose_reviewed_at is null),
      'high_risk_missing_source', count(*) filter (where publication_role='article' and (is_sensitive or is_adult) and not has_source),
      'ontology_pending', count(*) filter (where publication_role='article' and ontology_review_status='pending' and not has_approved_relation),
      'utility_indexable', count(*) filter (where publication_role='utility' and seo_indexable),
      'redirect_indexable', count(*) filter (where publication_role='entity_redirect' and seo_indexable)
    ),
    'oldest_unresolved_at', min(created_at) filter (where publication_role='article' and (
      not public.tag_has_prose(description,short_description) or category_id is null
      or (description is not null and prose_reviewed_at is null)
      or ((is_sensitive or is_adult) and not has_source)
      or (ontology_review_status='pending' and not has_approved_relation)
    )),
    'sensitive_unreviewed', count(*) filter (where publication_role='article' and (is_sensitive or is_adult) and prose_reviewed_at is null)
  ) into v_result from active;
  return v_result;
end;
$$;

revoke all on function public.tag_quality_scorecard_v2() from public;
grant execute on function public.tag_quality_scorecard_v2() to authenticated, service_role;

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
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return query
  with base as (
    select t.*,
      exists(select 1 from public.tag_sources s where s.tag_id=t.id and coalesce(s.is_public,false)) as has_source,
      exists(select 1 from public.tag_relations r where r.source_tag_id=t.id and r.review_status='approved') as has_relation
    from public.unified_tags t where t.status='active'
  ), issues as (
    select b.*, v.issue_code, v.evidence,
      case when b.is_sensitive or b.is_adult then 'high' when coalesce(b.usage_count,0)>=25 then 'medium' else 'normal' end as risk,
      case v.issue_code
        when 'high_risk_missing_source' then 7000000000
        when 'article_missing_description' then 6000000000
        when 'article_missing_primary_category' then 5000000000
        when 'article_unreviewed_prose' then 4000000000
        when 'article_ontology_unreviewed' then 3000000000
        else 2000000000 end + coalesce(b.usage_count,0) as priority
    from base b
    cross join lateral (values
      ('article_missing_description', jsonb_build_object('short_candidate', b.short_description), b.publication_role='article' and not public.tag_has_prose(b.description,b.short_description)),
      ('article_missing_primary_category', jsonb_build_object('category_id', b.category_id), b.publication_role='article' and b.category_id is null),
      ('article_unreviewed_prose', jsonb_build_object('prose_reviewed_at', b.prose_reviewed_at), b.publication_role='article' and b.description is not null and b.prose_reviewed_at is null),
      ('high_risk_missing_source', jsonb_build_object('sensitive', b.is_sensitive, 'adult', b.is_adult), b.publication_role='article' and (b.is_sensitive or b.is_adult) and not b.has_source),
      ('article_ontology_unreviewed', jsonb_build_object('ontology_review_status', b.ontology_review_status), b.publication_role='article' and b.ontology_review_status='pending' and not b.has_relation),
      ('utility_indexable', jsonb_build_object('seo_indexable', b.seo_indexable), b.publication_role='utility' and b.seo_indexable),
      ('redirect_indexable', jsonb_build_object('seo_indexable', b.seo_indexable), b.publication_role='entity_redirect' and b.seo_indexable)
    ) v(issue_code,evidence,applies)
    where v.applies and (p_issue_code is null or v.issue_code=p_issue_code)
  ), paged as (
    select i.*, count(*) over() as total_count
    from issues i order by i.priority desc, i.slug
    limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0)
  )
  select p.total_count, p.id, p.slug, p.name, p.publication_role, p.entity_kind,
    p.category, p.description, p.short_description, p.long_description,
    coalesce(p.usage_count,0), p.risk, p.issue_code, p.evidence, p.priority
  from paged p order by p.priority desc, p.slug;
end;
$$;

revoke all on function public.tag_editorial_queue(integer,integer,text) from public;
grant execute on function public.tag_editorial_queue(integer,integer,text) to authenticated, service_role;

create or replace function public.review_tag_description(p_tag_id uuid, p_description text)
returns public.unified_tags
language plpgsql security definer
set search_path = public
as $$
declare v_tag public.unified_tags;
begin
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if nullif(btrim(p_description),'') is null or length(btrim(p_description)) < 30 then
    raise exception 'A reviewed description must contain at least 30 characters' using errcode='22023';
  end if;
  select * into v_tag from public.unified_tags where id=p_tag_id and status='active' for update;
  if not found then raise exception 'Active tag not found' using errcode='P0002'; end if;
  if v_tag.publication_role <> 'article' then
    raise exception 'Only article-role tags have publishable descriptions' using errcode='22023';
  end if;
  if lower(regexp_replace(btrim(p_description),'[[:punct:]]','','g')) =
     lower(regexp_replace(v_tag.name || ' related to ' || coalesce(v_tag.category,''),'[[:punct:]]','','g')) then
    raise exception 'Generic “X related to Y” boilerplate is not publishable' using errcode='22023';
  end if;
  if p_description ~* '(as an ai|cannot provide|i am unable|language model)' then
    raise exception 'Refusal or model boilerplate is not publishable' using errcode='22023';
  end if;
  if exists(
    select 1 from public.unified_tags t
    where t.id <> p_tag_id and t.status='active'
      and lower(btrim(t.description)) = lower(btrim(p_description))
  ) then
    raise exception 'This description duplicates another active glossary entry' using errcode='22023';
  end if;
  perform set_config('app.actor','editorial:glossary-review',true);
  update public.unified_tags
  set description=btrim(p_description), human_reviewed=true,
      verification_status='reviewed', prose_reviewed_at=now(), last_verified_at=now()
  where id=p_tag_id returning * into v_tag;
  return v_tag;
end;
$$;

revoke all on function public.review_tag_description(uuid,text) from public;
grant execute on function public.review_tag_description(uuid,text) to authenticated, service_role;

create or replace function public.review_tag_ontology(p_tag_id uuid, p_decision text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_decision not in ('reviewed','none_applicable') then
    raise exception 'Ontology decision must be reviewed or none_applicable' using errcode='22023';
  end if;
  if p_decision='reviewed' and not exists(
    select 1 from public.tag_relations r
    where r.source_tag_id=p_tag_id and r.review_status='approved'
  ) then
    raise exception 'A reviewed ontology decision requires at least one approved relation' using errcode='22023';
  end if;
  perform set_config('app.actor','editorial:glossary-ontology-review',true);
  update public.unified_tags
  set ontology_review_status=p_decision, ontology_reviewed_at=now()
  where id=p_tag_id and status='active' and publication_role='article';
  if not found then raise exception 'Active article tag not found' using errcode='P0002'; end if;
end;
$$;

revoke all on function public.review_tag_ontology(uuid,text) from public;
grant execute on function public.review_tag_ontology(uuid,text) to authenticated, service_role;

-- Stable hard counters for deployment/CI ratchets.
create or replace function public.tag_publication_signals()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform public.assert_admin_or_internal();
  select jsonb_build_object(
    'active_without_role', count(*) filter (where publication_role is null),
    'utility_indexable', count(*) filter (where publication_role='utility' and seo_indexable),
    'redirect_indexable', count(*) filter (where publication_role='entity_redirect' and seo_indexable),
    'article_indexable_without_canonical_description', count(*) filter (where publication_role='article' and seo_indexable and not public.tag_has_prose(description,short_description)),
    'article_without_primary_category', count(*) filter (
      where publication_role='article'
        and (select count(*) from public.tag_category_assignments a
             where a.tag_id=unified_tags.id and a.is_primary) <> 1
    )
  ) into v from public.unified_tags where status='active';
  return v;
end;
$$;

revoke all on function public.tag_publication_signals() from public;
grant execute on function public.tag_publication_signals() to service_role;

do $verify$
begin
  if exists(select 1 from public.unified_tags where status='active' and publication_role is null) then
    raise exception 'active tag without publication_role';
  end if;
  if exists(select 1 from public.unified_tags where status='active' and publication_role <> 'article' and seo_indexable) then
    raise exception 'non-article tag remains indexable';
  end if;
  if exists(select 1 from public.unified_tags where status='active' and publication_role='article' and seo_indexable and not public.tag_has_prose(description,short_description)) then
    raise exception 'indexable article lacks canonical description';
  end if;
  if exists(
    select 1 from public.unified_tags t
    where t.status='active' and t.publication_role='article'
      and (select count(*) from public.tag_category_assignments a
           where a.tag_id=t.id and a.is_primary) <> 1
  ) then
    raise exception 'article role tag lacks exactly one primary category';
  end if;
  if exists(select 1 from public.unified_tags where slug in ('men-only','stage','hindu') and description is null) then
    raise exception 'known wrong-sense correction missing';
  end if;
  if exists(select 1 from public.unified_tags t left join public.tag_categories c on c.id=t.category_id where t.slug='mullerian' and c.slug is distinct from 'physical-reproductive') then
    raise exception 'mullerian category correction missing';
  end if;
end $verify$;
;
