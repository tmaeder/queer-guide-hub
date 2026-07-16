-- Beruf vs. Tätigkeit/Rolle trennen.
-- profession = Beruf (Erwerb, Freitext); NEU roles text[] = Tätigkeit(en) (Slugs).
-- Geteilte Vokabel (professions), KEIN kind-Lock: derselbe Begriff kann für
-- Person A Beruf, für Person B nur Tätigkeit sein — der Eimer entsteht pro
-- Person über das Feld. Freitext-Suche trifft beide (Indexer unten).
-- Konzept: tools/person-db/docs/roles-field-concept.md

begin;

-- 1) Geteilte Begriffsliste um typische Tätigkeiten ergänzen (kein kind) -----
insert into public.professions (slug, name, category, aliases, is_active)
values
  ('community-organizer', 'Community organizer', 'Activism',
     array['organizer', 'community leader', 'grassroots organizer', 'campaign organizer'], true),
  ('advocate', 'Advocate', 'Activism',
     array['rights advocate', 'campaigner', 'public advocate'], true),
  ('civil-rights-activist', 'Civil rights activist', 'Activism',
     array['civil rights activist', 'human rights activist', 'human rights defender'], true)
on conflict (slug) do nothing;

-- 2) Tätigkeits-Feld auf personalities -------------------------------------
alter table public.personalities
  add column if not exists roles text[] not null default '{}';

create index if not exists idx_personalities_roles
  on public.personalities using gin (roles);

comment on column public.personalities.roles is
  'Tätigkeit(en) (Slugs aus professions), getrennt vom Beruf in profession. Geteilte Vokabel — jeder Slug erlaubt.';

-- 3) Suchindexer: roles in tsvector (Gewicht B, wie Beruf) + facets ---------
-- ZUERST ersetzen, DANN backfillen: der personalities-AFTER-UPDATE-Trigger
-- (trg_search_documents_personality) reindexiert die berührten Zeilen dann
-- bereits mit der neuen Funktion. Kein Voll-Resync nötig (roles sonst leer).
create or replace function public.search_documents_index_personalities(p_id uuid default null::uuid)
 returns void
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'personality:'||p.id, 'personality', p.id, p.name, coalesce(p.description, p.bio),
       setweight(to_tsvector('simple', unaccent(coalesce(p.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.profession,''))),'B')
    || setweight(to_tsvector('simple', unaccent(array_to_string(coalesce(p.roles,'{}'::text[]),' '))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.nationality,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.lgbti_connection,''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(p.description, p.bio, ''))),'D')
    || public.i18n_to_tsv(p.name_i18n,'A') || public.i18n_to_tsv(p.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'profession', p.profession, 'roles', to_jsonb(p.roles), 'nationality', p.nationality,
      'is_living', p.is_living, 'is_featured', p.is_featured,
      'tags', to_jsonb(p.tags))),
    null::geography,
    null::smallint, 'live', coalesce(p.is_featured,false), p.quality_score, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    p.slug, p.image_url, null::text, p.nationality, null::text, now()
  from public.personalities p
  left join public.content_embeddings ce on ce.content_type='personality' and ce.content_id=p.id
  where p.duplicate_of_id is null
    and p.visibility = 'public'
    and (p_id is null or p.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, slug=excluded.slug, image_url=excluded.image_url,
    country=excluded.country, updated_at=now();
$function$;

-- 4) Konservativer Backfill: nur sicheres 'activist' -----------------------
-- profession-TEXT bleibt unangetastet (kann einzige Info sein). Bereinigung
-- von "LGBTQ+ rights activist" aus profession = separater, reversibler Pass.
-- Der UPDATE feuert trg_search_documents_personality → reindexiert diese
-- Zeilen mit der neuen Funktion (roles landet im tsvector).
update public.personalities p
set roles = array['activist']
where 'activist' <> all (p.roles)
  and (
    p.lgbti_connection = 'activist'
    or p.profession ~* '(activist|aktivist)'
    or exists (select 1 from unnest(coalesce(p.tags, '{}')) t where t ~* '(activist|aktivist)')
  );

commit;
