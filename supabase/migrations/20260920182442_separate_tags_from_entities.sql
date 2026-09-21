-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260920182442 with no repo file — the signature of
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
-- Keep filter vocabulary usable without publishing people, places, venues,
-- organisations or events as glossary articles.

select set_config('app.actor', 'editorial:tag-entity-separation', true);

alter table public.unified_tags
  add column if not exists canonical_entity_type text,
  add column if not exists canonical_entity_id uuid,
  add column if not exists canonical_entity_path text,
  add column if not exists canonical_entity_reviewed_at timestamptz;

alter table public.unified_tags
  drop constraint if exists unified_tags_canonical_entity_type_check,
  add constraint unified_tags_canonical_entity_type_check check (
    canonical_entity_type is null or canonical_entity_type in (
      'personality', 'city', 'country', 'village', 'venue',
      'organization', 'event', 'hotel', 'community_group'
    )
  ),
  drop constraint if exists unified_tags_canonical_entity_path_check,
  add constraint unified_tags_canonical_entity_path_check check (
    canonical_entity_path is null or (
      canonical_entity_path like '/%'
      and canonical_entity_path not like '/tags/%'
      and canonical_entity_path !~ '[?#]'
    )
  );

comment on column public.unified_tags.canonical_entity_type is
  'Canonical content type for an entity_redirect tag; never inferred from a name collision alone.';
comment on column public.unified_tags.canonical_entity_id is
  'ID of the canonical typed entity. Polymorphic by canonical_entity_type and validated by trigger.';
comment on column public.unified_tags.canonical_entity_path is
  'Reviewed non-glossary route for an entity_redirect tag.';

-- One imported name has no verifiable person behind it and must not create a
-- synthetic biography. Melitta Sundström does have an authoritative Wikidata
-- identity; repair that source metadata before moving the row.
update public.unified_tags
set status='deprecated', deprecated_at=now(), publication_role='utility',
    deprecation_reason='unverified personality import; no canonical person found',
    entity_kind='descriptor', seo_indexable=false,
    seo_deindex_reason='unverified_entity_import'
where status='active' and slug='christiane-brandauer';

update public.unified_tags
set description='Melitta Sundström was a German writer, singer, drag performer, and LGBTQ rights activist (1963–1993).',
    wikipedia_url='https://de.wikipedia.org/wiki/Melitta_Sundstr%C3%B6m',
    wikidata_id='Q1642436', human_reviewed=true,
    verification_status='reviewed', prose_reviewed_at=now(), last_verified_at=now()
where status='active' and slug='melitta-sundstrom';

-- The remaining six rows were biographies stored only as tags. Create conservative,
-- non-public personality shells from their existing data so the prose has the
-- correct content owner. They remain available to editors without adding six
-- synthetic "needs attention" incidents to the admin cockpit.
insert into public.personalities (
  name, slug, description, bio, wikipedia_url, wikidata_qid,
  visibility, seo_indexable, needs_attention, review_status, verification_status,
  field_provenance, roles
)
select t.name, t.slug, t.description, coalesce(t.long_description, t.description),
  t.wikipedia_url, t.wikidata_id, 'draft', false, false, 'pending', 'pending',
  jsonb_build_object(
    'migration', '99991789917000',
    'source', 'unified_tags',
    'source_tag_id', t.id,
    'requires_editorial_review', true
  ), '{}'::text[]
from public.unified_tags t
where t.status = 'active' and t.entity_kind = 'person'
  and not exists (
    select 1 from public.personalities p
    where p.duplicate_of_id is null and p.slug = t.slug
  )
on conflict (slug) do nothing;

-- The checked-in redirect registry is the reviewed decision ledger. Keeping
-- the paths here as data prevents a display-name homonym (Male, Reading,
-- Angel, Party, etc.) from silently becoming an entity conversion.
with reviewed(tag_slug, target_path) as (values
  ('algeria', '/country/algeria'),
  ('argentina', '/country/argentina'),
  ('auckland', '/city/auckland'),
  ('australia', '/country/australia'),
  ('austria', '/country/austria'),
  ('badung', '/city/badung'),
  ('bangkok', '/city/bangkok'),
  ('barcelona', '/city/barcelona'),
  ('beijing', '/city/beijing'),
  ('berkeley', '/city/berkeley-us-0wh5n'),
  ('berlin', '/city/berlin'),
  ('bielefeld', '/city/bielefeld-de-jqije'),
  ('birmingham', '/city/birmingham'),
  ('braunschweig', '/city/braunschweig-de-lzwc9'),
  ('brazil', '/country/brazil'),
  ('bremen', '/city/bremen-de-srecc'),
  ('brighton', '/city/brighton'),
  ('brisbane', '/city/brisbane'),
  ('buenos-aires', '/city/buenos-aires'),
  ('canada', '/country/canada'),
  ('cape-town', '/city/cape-town'),
  ('casablanca', '/city/casablanca'),
  ('castro-district', '/villages/castro-district'),
  ('chiang-mai', '/city/chiang-mai-th-i65oi'),
  ('chicago', '/city/chicago'),
  ('chihuahua', '/city/chihuahua-mx-t01r7'),
  ('colombia', '/country/colombia'),
  ('copenhagen', '/city/copenhagen'),
  ('costa-rica', '/country/costa-rica'),
  ('croatia', '/country/croatia'),
  ('cuernavaca', '/city/cuernavaca-mx-i5l4z'),
  ('dallas', '/city/dallas'),
  ('denver', '/city/denver'),
  ('dortmund', '/city/dortmund-de-zfu3i'),
  ('durban', '/city/durban'),
  ('eastbourne', '/city/eastbourne-gb-1nfsz'),
  ('espana', '/country/spain'),
  ('estonia', '/country/estonia'),
  ('exeter', '/city/exeter-gb-h5y0o'),
  ('fort-lauderdale', '/city/fort-lauderdale'),
  ('fortitude-valley', '/villages/fortitude-valley'),
  ('france', '/country/france'),
  ('friedrichshain', '/villages/friedrichshain'),
  ('friedrichstadt-palast', '/venues/friedrichstadt-palast'),
  ('georgia', '/country/georgia'),
  ('germany', '/country/germany'),
  ('gothenburg', '/city/gothenburg'),
  ('gran-canaria', '/city/gran-canaria'),
  ('greece', '/country/greece'),
  ('guatemala-city', '/city/guatemala-city'),
  ('harrisburg', '/city/harrisburg-us-l5til'),
  ('iceland', '/country/iceland'),
  ('india', '/country/india'),
  ('indianapolis', '/city/indianapolis'),
  ('indonesia', '/country/indonesia'),
  ('israel', '/country/israel'),
  ('istanbul', '/city/istanbul'),
  ('italy', '/country/italy'),
  ('japan', '/country/japan'),
  ('johannesburg', '/city/johannesburg'),
  ('kazan', '/city/kazan'),
  ('key-west', '/city/key-west'),
  ('kolkata', '/city/kolkata'),
  ('kreuzberg', '/villages/kreuzberg'),
  ('la-spezia', '/city/la-spezia-it-jd5n6'),
  ('lake-tahoe', '/city/lake-tahoe'),
  ('las-vegas', '/city/las-vegas-united-states'),
  ('launceston', '/city/launceston'),
  ('lima', '/city/lima'),
  ('los-angeles', '/city/los-angeles'),
  ('luxembourg', '/country/luxembourg'),
  ('madrid', '/city/madrid'),
  ('malta', '/country/malta'),
  ('merignac', '/city/m-rignac-france'),
  ('mexico', '/country/mexico'),
  ('mexico-city', '/city/mexico-city'),
  ('milan', '/city/milan'),
  ('mill-valley', '/city/mill-valley-us-57nze'),
  ('mitte', '/villages/mitte'),
  ('monterey', '/city/monterey'),
  ('montreal', '/city/montreal'),
  ('morelia', '/city/morelia-mx-kxzkr'),
  ('morocco', '/country/morocco'),
  ('munich', '/city/munich'),
  ('murphys', '/city/murphys'),
  ('netherlands', '/country/netherlands'),
  ('neukolln', '/villages/neukoelln'),
  ('new-orleans', '/city/new-orleans'),
  ('new-zealand', '/country/new-zealand'),
  ('newcastle-upon-tyne', '/city/newcastle-upon-tyne-gb-l7wnj'),
  ('nigeria', '/country/nigeria'),
  ('norway', '/country/norway'),
  ('oakland', '/city/oakland'),
  ('oldenburg', '/city/oldenburg-de-cvzak'),
  ('olympia', '/city/olympia'),
  ('osaka', '/city/osaka'),
  ('paignton', '/city/paignton-gb-zvny2'),
  ('palo-alto', '/city/palo-alto-us-4k5vb'),
  ('paris', '/city/paris'),
  ('pembroke', '/city/pembroke-gb-ccw0o'),
  ('peru', '/country/peru'),
  ('philadelphia', '/city/philadelphia'),
  ('pittsburgh', '/city/pittsburgh'),
  ('poland', '/country/poland'),
  ('port-louis', '/city/port-louis'),
  ('prague', '/city/prague'),
  ('prenzlauer', '/villages/prenzlauer-berg'),
  ('puerto-rico', '/country/puerto-rico'),
  ('pune', '/city/pune-in-u6fuy'),
  ('raleigh', '/city/raleigh-us-nygbl'),
  ('reykjavik', '/city/reykjavik'),
  ('rijeka', '/city/rijeka-hr-w60rh'),
  ('rio-de-janeiro', '/city/rio-de-janeiro'),
  ('rosario', '/city/rosario'),
  ('rotterdam', '/city/rotterdam'),
  ('russia', '/country/russia'),
  ('sacramento', '/city/sacramento'),
  ('salt-lake-city', '/city/salt-lake-city-united-states'),
  ('salvador', '/city/salvador'),
  ('san-antonio', '/city/san-antonio'),
  ('san-diego', '/city/san-diego'),
  ('san-francisco', '/city/san-francisco'),
  ('san-juan', '/city/san-juan-1'),
  ('santa-clarita', '/city/santa-clarita'),
  ('santiago', '/city/santiago'),
  ('sao-paulo', '/city/s-o-paulo'),
  ('schoneberg', '/villages/schoeneberg'),
  ('seattle', '/city/seattle'),
  ('seminyak', '/city/seminyak'),
  ('sint-maarten', '/country/sint-maarten'),
  ('skopje', '/city/skopje'),
  ('south-africa', '/country/south-africa'),
  ('south-bend', '/city/south-bend'),
  ('split', '/city/split-hr-z2ivf'),
  ('stuttgart', '/city/stuttgart-germany'),
  ('sweden', '/country/sweden'),
  ('switzerland', '/country/switzerland'),
  ('taipei', '/city/taipei'),
  ('tbilisi', '/city/tbilisi'),
  ('tel-aviv', '/city/tel-aviv'),
  ('thailand', '/country/thailand'),
  ('toronto', '/city/toronto'),
  ('torremolinos', '/city/torremolinos'),
  ('turkey', '/country/turkey'),
  ('turkiye', '/country/turkey'),
  ('uk', '/country/united-kingdom'),
  ('united-kingdom', '/country/united-kingdom'),
  ('united-states', '/country/united-states'),
  ('usti-nad-labem', '/city/usti-nad-labem-cz-6zkxh'),
  ('venezia', '/city/venice-italy'),
  ('vienna', '/city/vienna'),
  ('washington-d-c', '/city/washington-d-c'),
  ('washington-dc', '/city/washington-d-c'),
  ('wellington', '/city/wellington'),
  ('west-hollywood', '/city/west-hollywood'),
  ('wustrow', '/city/wustrow-lower-saxony'),
  ('zurich', '/city/zuerich'),
  ('act-up', '/organizations/act-up'),
  ('daughters-of-bilitis', '/organizations/daughters-of-bilitis'),
  ('folsom-europe', '/events/folsom-europe'),
  ('london-pride', '/events/london-pride'),
  ('stockholm-pride', '/events/stockholm-pride')
), typed as (
  select tag_slug, target_path,
    case split_part(target_path, '/', 2)
      when 'personalities' then 'personality'
      when 'city' then 'city'
      when 'country' then 'country'
      when 'villages' then 'village'
      when 'venues' then 'venue'
      when 'organizations' then 'organization'
      when 'events' then 'event'
      when 'hotels' then 'hotel'
    end as target_type,
    split_part(target_path, '/', 3) as target_slug
  from reviewed
), resolved as (
  select x.*,
    case x.target_type
      when 'city' then (select c.id from public.cities c where c.slug=x.target_slug and c.duplicate_of_id is null limit 1)
      when 'country' then (select c.id from public.countries c where c.slug=x.target_slug and c.duplicate_of_id is null limit 1)
      when 'village' then (select v.id from public.queer_villages v where v.slug=x.target_slug and v.duplicate_of_id is null limit 1)
      when 'venue' then (select v.id from public.venues v where v.slug=x.target_slug and v.duplicate_of_id is null limit 1)
      when 'organization' then (select o.id from public.organizations o where o.slug=x.target_slug and o.duplicate_of_id is null limit 1)
      when 'event' then (select e.id from public.events e where e.slug=x.target_slug and e.duplicate_of_id is null limit 1)
    end as target_id
  from typed x
)
update public.unified_tags t
set publication_role='entity_redirect',
    entity_kind=case when r.target_type in ('city','country','village','venue')
      then 'place'::public.tag_entity_kind else t.entity_kind end,
    canonical_entity_type=r.target_type,
    canonical_entity_id=r.target_id,
    canonical_entity_path=r.target_path,
    canonical_entity_reviewed_at=now(),
    publication_role_reviewed_at=now(),
    publication_role_review_note='reviewed canonical entity conversion',
    seo_indexable=false,
    seo_deindex_reason='publication_role:entity_redirect'
from resolved r
where t.status='active' and t.slug=r.tag_slug;

-- Every biography-only tag now has a typed personality destination.
update public.unified_tags t
set publication_role='entity_redirect', canonical_entity_type='personality',
    canonical_entity_id=canonical.id,
    canonical_entity_path='/personalities/' || canonical.slug,
    canonical_entity_reviewed_at=now(), publication_role_reviewed_at=now(),
    publication_role_review_note='migrated biography tag to personality',
    seo_indexable=false, seo_deindex_reason='publication_role:entity_redirect'
from public.personalities alias
join public.personalities canonical
  on canonical.id=coalesce(alias.duplicate_of_id,alias.id)
 and canonical.duplicate_of_id is null
where t.status='active' and t.entity_kind='person'
  and alias.slug=t.slug;

-- A place-ish filter with no reviewed canonical destination is vocabulary, not
-- an entity and not an article. Preserve assignments but correct its kind.
update public.unified_tags
set entity_kind='descriptor', publication_role='utility',
    publication_role_reviewed_at=now(),
    publication_role_review_note='place-like facet; no reviewed canonical entity target',
    seo_indexable=false, seo_deindex_reason='publication_role:utility'
where status='active' and entity_kind='place' and canonical_entity_path is null;

-- Person imports can also remain unresolved when their slug already belongs to
-- an archived/duplicate personality. A redirect without a live reviewed target
-- is never valid: retain it as usable vocabulary and make it non-public.
update public.unified_tags
set entity_kind='descriptor', publication_role='utility',
    canonical_entity_type=null, canonical_entity_id=null,
    canonical_entity_path=null, canonical_entity_reviewed_at=null,
    publication_role_reviewed_at=now(),
    publication_role_review_note='entity-like vocabulary; no reviewed canonical target',
    seo_indexable=false, seo_deindex_reason='publication_role:utility'
where status='active' and publication_role='entity_redirect'
  and (canonical_entity_type is null or canonical_entity_id is null
    or canonical_entity_path is null or canonical_entity_reviewed_at is null);

alter table public.unified_tags
  drop constraint if exists unified_tags_entity_redirect_target_check,
  add constraint unified_tags_entity_redirect_target_check check (
    status <> 'active' or publication_role <> 'entity_redirect' or (
      canonical_entity_type is not null and canonical_entity_id is not null
      and canonical_entity_path is not null and canonical_entity_reviewed_at is not null
    )
  );

create or replace function public.validate_tag_entity_target()
returns trigger language plpgsql set search_path=public as $$
declare v_expected_path text;
begin
  if new.publication_role <> 'entity_redirect' then
    new.canonical_entity_type := null;
    new.canonical_entity_id := null;
    new.canonical_entity_path := null;
    new.canonical_entity_reviewed_at := null;
    return new;
  end if;
  if new.canonical_entity_type is null or new.canonical_entity_id is null
     or new.canonical_entity_path is null then
    raise exception 'An entity redirect requires a reviewed type, ID, and path' using errcode='23514';
  end if;
  v_expected_path := case new.canonical_entity_type
    when 'personality' then (select '/personalities/'||x.slug from public.personalities x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'city' then (select '/city/'||x.slug from public.cities x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'country' then (select '/country/'||x.slug from public.countries x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'village' then (select '/villages/'||x.slug from public.queer_villages x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'venue' then (select '/venues/'||x.slug from public.venues x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'organization' then (select '/organizations/'||x.slug from public.organizations x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'event' then (select '/events/'||x.slug from public.events x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'hotel' then (select '/hotels/'||x.slug from public.hotels x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'community_group' then (select '/groups/'||x.id::text from public.community_groups x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
  end;
  if v_expected_path is null then
    raise exception 'Canonical entity target does not exist or is a duplicate' using errcode='23503';
  end if;
  if new.canonical_entity_path <> v_expected_path then
    raise exception 'Canonical entity path % does not match target %', new.canonical_entity_path, v_expected_path using errcode='23514';
  end if;
  new.canonical_entity_reviewed_at := coalesce(new.canonical_entity_reviewed_at, now());
  return new;
end $$;

drop trigger if exists zy_validate_tag_entity_target on public.unified_tags;
create trigger zy_validate_tag_entity_target before insert or update
on public.unified_tags for each row execute function public.validate_tag_entity_target();

-- Preserve the original role/category/localisation scorecard and patch its
-- redirect dimension with the now-verifiable canonical target contract.
alter function public.tag_quality_scorecard_v2() rename to tag_quality_scorecard_role_base;
create or replace function public.tag_quality_scorecard_v2()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb; v_total bigint; v_valid bigint; v_noncompeting bigint; v_place_facets bigint;
begin
  v := public.tag_quality_scorecard_role_base();
  select count(*),
    count(*) filter (where canonical_entity_type is not null and canonical_entity_id is not null
      and canonical_entity_path is not null and canonical_entity_reviewed_at is not null),
    count(*) filter (where seo_indexable is not true)
  into v_total,v_valid,v_noncompeting
  from public.unified_tags where status='active' and publication_role='entity_redirect';
  select count(*) into v_place_facets from public.unified_tags
  where status='active' and publication_role='utility'
    and publication_role_review_note='place-like facet; no reviewed canonical entity target';
  v := jsonb_set(v,'{redirect}',jsonb_build_object(
    'total',v_total,'valid_target',v_valid,'non_competing',v_noncompeting
  ));
  v := jsonb_set(v,'{issues,redirect_missing_target}',to_jsonb(v_total-v_valid),true);
  v := jsonb_set(v,'{issues,place_like_facets_without_target}',to_jsonb(v_place_facets),true);
  return v;
end $$;

revoke all on function public.tag_quality_scorecard_v2() from public;
grant execute on function public.tag_quality_scorecard_v2() to authenticated,service_role;

create or replace function public.tag_publication_signals()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb;
begin
  perform public.assert_admin_or_internal();
  select jsonb_build_object(
    'active_without_role',count(*) filter (where publication_role is null),
    'utility_indexable',count(*) filter (where publication_role='utility' and seo_indexable),
    'redirect_indexable',count(*) filter (where publication_role='entity_redirect' and seo_indexable),
    'redirect_missing_canonical_target',count(*) filter (where publication_role='entity_redirect' and
      (canonical_entity_type is null or canonical_entity_id is null or canonical_entity_path is null
       or canonical_entity_reviewed_at is null)),
    'entity_kind_published_as_article',count(*) filter (where publication_role='article' and entity_kind in ('person','place')),
    'article_indexable_without_canonical_description',count(*) filter (where publication_role='article' and seo_indexable and not public.tag_has_prose(description,short_description)),
    'article_without_primary_category',count(*) filter (where publication_role='article' and
      (select count(*) from public.tag_category_assignments a where a.tag_id=unified_tags.id and a.is_primary)<>1)
  ) into v from public.unified_tags where status='active';
  return v;
end $$;

revoke all on function public.tag_publication_signals() from public;
grant execute on function public.tag_publication_signals() to service_role;

create table if not exists public.tag_entity_candidate_reviews (
  tag_id uuid not null references public.unified_tags(id) on delete cascade,
  candidate_type text not null,
  candidate_id uuid not null,
  decision text not null check (decision in ('same_entity','homonym')),
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid default auth.uid(),
  primary key(tag_id,candidate_type,candidate_id)
);
alter table public.tag_entity_candidate_reviews enable row level security;

create or replace function public.review_tag_entity_candidate(
  p_tag_id uuid, p_candidate_type text, p_candidate_id uuid, p_is_same_entity boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_path text;
begin
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if p_candidate_type not in ('personality','city','country','village','venue','organization','event','hotel','community_group') then
    raise exception 'unsupported canonical entity type' using errcode='22023';
  end if;
  v_path := case p_candidate_type
    when 'personality' then (select '/personalities/'||slug from public.personalities where id=p_candidate_id and duplicate_of_id is null)
    when 'city' then (select '/city/'||slug from public.cities where id=p_candidate_id and duplicate_of_id is null)
    when 'country' then (select '/country/'||slug from public.countries where id=p_candidate_id and duplicate_of_id is null)
    when 'village' then (select '/villages/'||slug from public.queer_villages where id=p_candidate_id and duplicate_of_id is null)
    when 'venue' then (select '/venues/'||slug from public.venues where id=p_candidate_id and duplicate_of_id is null)
    when 'organization' then (select '/organizations/'||slug from public.organizations where id=p_candidate_id and duplicate_of_id is null)
    when 'event' then (select '/events/'||slug from public.events where id=p_candidate_id and duplicate_of_id is null)
    when 'hotel' then (select '/hotels/'||slug from public.hotels where id=p_candidate_id and duplicate_of_id is null)
    when 'community_group' then (select '/groups/'||id::text from public.community_groups where id=p_candidate_id and duplicate_of_id is null)
  end;
  if v_path is null then raise exception 'canonical entity not found' using errcode='P0002'; end if;

  insert into public.tag_entity_candidate_reviews(tag_id,candidate_type,candidate_id,decision)
  values(p_tag_id,p_candidate_type,p_candidate_id,case when p_is_same_entity then 'same_entity' else 'homonym' end)
  on conflict(tag_id,candidate_type,candidate_id) do update
    set decision=excluded.decision,reviewed_at=now(),reviewed_by=auth.uid();

  if p_is_same_entity then
    update public.unified_tags set publication_role='entity_redirect',
      entity_kind=case when p_candidate_type='personality' then 'person'::public.tag_entity_kind
        when p_candidate_type in ('city','country','village','venue') then 'place'::public.tag_entity_kind
        else entity_kind end,
      canonical_entity_type=p_candidate_type, canonical_entity_id=p_candidate_id,
      canonical_entity_path=v_path, canonical_entity_reviewed_at=now(),
      publication_role_reviewed_at=now(),
      publication_role_review_note='reviewed entity candidate conversion',
      seo_indexable=false,seo_deindex_reason='publication_role:entity_redirect'
    where id=p_tag_id and status='active';
    if not found then raise exception 'active tag not found' using errcode='P0002'; end if;
  end if;
end $$;

revoke all on function public.review_tag_entity_candidate(uuid,text,uuid,boolean) from public;
grant execute on function public.review_tag_entity_candidate(uuid,text,uuid,boolean) to authenticated,service_role;

-- Queryable review queue for suspicious cross-type collisions. It deliberately
-- proposes rather than converts: exact slugs such as `male`, `angel`, `party`
-- and `reading` are not sufficient evidence of identity.
create or replace function public.tag_entity_audit_queue(p_limit integer default 100)
returns table(tag_id uuid, tag_slug text, tag_name text, entity_kind public.tag_entity_kind,
  usage integer, candidate_type text, candidate_id uuid, candidate_slug text,
  evidence jsonb, priority bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  return query
  with candidates as (
    select 'personality'::text typ,id,slug,name from public.personalities where duplicate_of_id is null
    union all select 'city',id,slug,name from public.cities where duplicate_of_id is null
    union all select 'country',id,slug,name from public.countries where duplicate_of_id is null
    union all select 'village',id,slug,name from public.queer_villages where duplicate_of_id is null
    union all select 'venue',id,slug,name from public.venues where duplicate_of_id is null
    union all select 'organization',id,slug,name from public.organizations where duplicate_of_id is null
    union all select 'event',id,slug,title from public.events where duplicate_of_id is null
    union all select 'hotel',id,slug,name from public.hotels where duplicate_of_id is null
  )
  select t.id,t.slug,t.name,t.entity_kind,coalesce(t.usage_count,0),c.typ,c.id,c.slug,
    jsonb_build_object('match',case when c.slug=t.slug then 'exact_slug' else 'normalised_name' end,'candidate_name',c.name,
      'warning','A slug collision is a candidate, not proof of identity'),
    1000000::bigint + coalesce(t.usage_count,0)
  from public.unified_tags t join candidates c on (
    c.slug=t.slug or (
      t.publication_role='utility'
      and t.publication_role_review_note='place-like facet; no reviewed canonical entity target'
      and lower(regexp_replace(t.name,'[^[:alnum:]]','','g')) =
          lower(regexp_replace(c.name,'[^[:alnum:]]','','g'))
    )
  )
  where t.status='active' and t.publication_role in ('article','utility')
    and not exists(select 1 from public.tag_entity_candidate_reviews r
      where r.tag_id=t.id and r.candidate_type=c.typ and r.candidate_id=c.id)
  order by coalesce(t.usage_count,0) desc,t.slug,c.typ
  limit greatest(1,least(p_limit,500));
end $$;

revoke all on function public.tag_entity_audit_queue(integer) from public;
grant execute on function public.tag_entity_audit_queue(integer) to authenticated,service_role;

do $verify$
begin
  if exists(select 1 from public.unified_tags where status='active' and publication_role='entity_redirect'
    and (canonical_entity_type is null or canonical_entity_id is null or canonical_entity_path is null)) then
    raise exception 'active entity redirect without a canonical target';
  end if;
  if exists(select 1 from public.unified_tags where status='active' and entity_kind in ('person','place')
    and publication_role='article') then
    raise exception 'person or place remains published as a glossary article';
  end if;
end $verify$;
;
