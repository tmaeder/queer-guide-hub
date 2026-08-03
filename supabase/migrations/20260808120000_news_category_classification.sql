-- News category classification — stop every article landing in 'general'.
--
-- 93% of 37,749 live articles sit in the catch-all, and 100% of everything
-- published in the last 30 days, because NO pipeline step has ever assigned a
-- category: source-rss-news emits none, pipeline-normalize excludes
-- entityType='news_article', and both commit RPCs fall through to
--   coalesce(nullif(v_norm->>'category',''), 'general')
-- which can only ever be 'general' since v_norm never carries the key.
--
-- `news_categories` (10 rows) is the vocabulary the public tabs already read,
-- and `news_articles.category_canonical` already speaks it. This migration makes
-- that column authoritative and self-maintaining:
--
--   1. closes the schema drift (category_canonical / classified_at /
--      is_aggregator exist in prod but in NO repo migration — a fresh
--      `supabase db reset` produces a DB where every news query fails)
--   2. seeds the vocabulary (also absent from the repo) + a `general` sentinel
--      row that is is_active=false, so the column can be non-null and
--      FK-valid while staying invisible in the tabs
--   3. news_category_from_text() — the deterministic keyword classifier,
--      extracted from the never-invoked reclassify_news_categories()
--   4. a BEFORE INSERT trigger, so EVERY writer is covered (both commit RPCs,
--      the admin CMS, and anything added later) without rewriting two
--      10k-character plpgsql functions
--   5. run_news_category_backfill() for the ~23.7k row backlog, keyset-batched
--      because trg_search_documents_news reindexes every touched row
--   6. a registered cron + two release gates, so a silent death is detectable —
--      the previous classifier ran for four months, stopped on 2026-06-06, and
--      nobody noticed because it had neither.
--
-- Deliberately NOT here: any bulk UPDATE (CI `db push` has no
-- statement_timeout=0 and a 23.7k-row statement would roll the whole migration
-- back), the FK, and SET NOT NULL. Those follow once the backfill converges.

-- ---------------------------------------------------------------------------
-- 1. Schema drift
-- ---------------------------------------------------------------------------
-- `ADD COLUMN IF NOT EXISTS` short-circuits the ENTIRE clause when the column
-- already exists, so a DEFAULT written inline here would silently never be
-- applied on prod. It must be its own statement.
alter table public.news_articles add column if not exists category_canonical text;
alter table public.news_articles alter column category_canonical set default 'general';

-- Referenced by already-merged migrations (20260619130000, 20260621182659) but
-- declared in none of them; they break `db reset` independently of this work.
alter table public.news_articles add column if not exists classified_at timestamptz;
alter table public.news_sources  add column if not exists is_aggregator boolean not null default false;

comment on column public.news_articles.category_canonical is
  'Authoritative topic category. Values are news_categories.slug; ''general'' means unclassified.';
comment on column public.news_articles.category is
  'LEGACY, frozen. Free-text, 13 uncontrolled values, last written 2026-02. Read category_canonical instead.';
comment on column public.news_sources.category is
  'Source TYPE label (news/podcast/lifestyle/...), NOT an article topic. Articles do not inherit it.';

-- Plain, not CONCURRENTLY: migrations run inside a transaction.
create index if not exists idx_news_articles_category_canonical
  on public.news_articles (category_canonical)
  where duplicate_of_id is null;

-- ---------------------------------------------------------------------------
-- 2. Vocabulary — 10 active topics + the `general` sentinel
-- ---------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING so prod's existing UUIDs are never churned; content
-- pages and any editorial links keep pointing at the same rows.
insert into public.news_categories (name, slug, description, sort_order, is_active) values
  ('Rights & Legal',     'rights-legal',     'Law, courts, and the moving line of what queer people can do where.', 10, true),
  ('Politics',           'politics',         'Elections, policy, and the people writing the rules.',                 20, true),
  ('Community',          'community',        'How queer people build, organize, and care for each other.',           30, true),
  ('Health & Wellness',  'health-wellness',  'Bodies, minds, and the systems meant to care for them.',               40, true),
  ('Culture & Arts',     'culture-arts',     'Books, film, music, and how queer stories get told.',                  50, true),
  ('Sports',             'sports',           'Athletes, teams, and the fight to compete as yourself.',               60, true),
  ('Education',          'education',        'Schools, campuses, and what is allowed to be taught.',                 70, true),
  ('Technology',         'technology',       'Platforms, privacy, and digital rights.',                              80, true),
  ('Business & Economy', 'business-economy', 'Workplaces, brands, and economic power.',                              90, true),
  ('International',      'international',    'Global bodies and cross-border developments.',                        100, true),
  -- Sentinel: unclassified. is_active=false keeps it out of the public tabs
  -- (useNews filters is_active) while still satisfying the FK added later.
  ('General',            'general',          'Unclassified.',                                                       999, false)
on conflict (slug) do nothing;

-- Every prod row currently has sort_order = 0, so the tabs render in arbitrary
-- order; this sets the editorial order. Descriptions are only filled where
-- EMPTY — prod's are admin-editable and must not be clobbered. They become the
-- section deks, replacing the hardcoded SECTION_DEK map in src/pages/News.tsx,
-- which was keyed on slugs matching none of these and so always fell through.
update public.news_categories c set
  sort_order  = v.sort_order,
  description = coalesce(nullif(c.description, ''), v.description),
  is_active   = v.is_active
from (values
  ('rights-legal',     10,  'Law, courts, and the moving line of what queer people can do where.', true),
  ('politics',         20,  'Elections, policy, and the people writing the rules.',                true),
  ('community',        30,  'How queer people build, organize, and care for each other.',          true),
  ('health-wellness',  40,  'Bodies, minds, and the systems meant to care for them.',              true),
  ('culture-arts',     50,  'Books, film, music, and how queer stories get told.',                 true),
  ('sports',           60,  'Athletes, teams, and the fight to compete as yourself.',              true),
  ('education',        70,  'Schools, campuses, and what is allowed to be taught.',                true),
  ('technology',       80,  'Platforms, privacy, and digital rights.',                             true),
  ('business-economy', 90,  'Workplaces, brands, and economic power.',                             true),
  ('international',    100, 'Global bodies and cross-border developments.',                        true),
  ('general',          999, 'Unclassified.',                                                       false)
) as v(slug, sort_order, description, is_active)
where c.slug = v.slug;

-- ---------------------------------------------------------------------------
-- 3. Deterministic keyword classifier
-- ---------------------------------------------------------------------------
-- Derived from reclassify_news_categories() (20260619150001), which was
-- written, migrated, and then never invoked by anything — no cron, no script,
-- no button. Two defects in that original were measured and fixed here:
--
--   * `\b` IS NOT A WORD BOUNDARY IN POSTGRES — it is the backspace character
--     (Postgres ARE spells word boundary `\y`; `\m`/`\M` are the start/end
--     anchors). All 18 `\b`-wrapped keywords were therefore dead, including
--     the entire backbone of the community branch — community, parade,
--     volunteer, vigil and local ALL matched nothing, leaving that category
--     reachable only via `pride`/`nonprofit`/`fundrais`.
--   * `\m…\M` anchors the whole word, so every keyword was singular-only:
--     `\mbook\M` never matched "books", `\mathlete\M` never matched "athletes".
--     Tags are overwhelmingly plural, so the highest-signal field was being
--     ignored.
--
-- Fixing those two took keyword coverage of the unclassified corpus from 60.6%
-- to 83.3%.
--
-- The other change is structural: this scores EVIDENCE VOLUME (how many keyword
-- occurrences each category gets) instead of first-hit-wins. A single-hit
-- ladder simply returns whichever category sits highest in an arbitrary
-- priority order, which buried community/education/technology under
-- rights-legal and politics — measured against the rows that already carry a
-- label, agreement went 24%→58% for community, 25%→60% for education and
-- 66%→83% for sports. Priority survives only as the tie-break.
--
-- Title and tags are counted twice: they are the highest-signal fields, and
-- without the weighting a passing mention deep in the body outvotes the
-- headline.
--
-- Returns NULL rather than guessing when nothing matches; the caller decides
-- what unmatched means.
create or replace function public.news_category_from_text(
  p_title   text,
  p_content text,
  p_tags    text[]
) returns text
language sql
immutable
set search_path to 'public'
as $fn$
  with s as (
    select lower(
      coalesce(p_title, '') || ' ' || coalesce(p_title, '') || ' ' ||
      array_to_string(coalesce(p_tags, '{}'::text[]), ' ') || ' ' ||
      array_to_string(coalesce(p_tags, '{}'::text[]), ' ') || ' ' ||
      left(coalesce(p_content, ''), 1200)
    ) as txt
  ),
  pats(cat, prio, pat) as (values
    ('rights-legal', 10, '(decriminali|criminali|marriage equal|same-sex marriage|\ycourts?\y|\yrulings?\y|lawsuit|legislation|\ylegal\y|\ybans?\y|\ylaws?\y|equality act|asylum|constitutional|verdict|\yappeals?\y|discriminat|civil rights|lgbtqia-rights|human-rights|censorship|\ysued?\y|attorney general)'),
    ('politics', 20, '(\yelections?\y|\yvot(e|es|er|ers|ing)\y|senate|congress|parliament|\ypresident\y|governor|\ypolic(y|ies)\y|\yminister\y|republican|democrat|\ybills?\y|\ycampaigns?\y|government|legislat|referendum|white house|\ymayors?\y)'),
    ('health-wellness', 30, '(\yhiv\y|\yaids\y|\yprep\y|\ympox\y|mental health|mental-health|\ytherap(y|ies|ist|ists)\y|wellness|\yclinics?\y|\yvaccines?\y|healthcare|health care|gender-affirming|\yhormones?\y|transition care|\ysuicide\y|\ydoctors?\y|\ypatients?\y)'),
    ('sports', 40, '(olympic|world cup|\yleagues?\y|\yathletes?\y|tournament|\yfootball\y|\ysoccer\y|basketball|\yrugby\y|\ytennis\y|championship|\ysports?\y|\ycoach(es)?\y|\ynba\y|\ynfl\y|\ymlb\y|\ywnba\y|\yteams?\y|swimming)'),
    ('culture-arts', 50, '(\yfilms?\y|\ymovies?\y|\ymusic(al|als)?\y|\yalbums?\y|\ysongs?\y|\ybooks?\y|\ydrag\y|\yfestivals?\y|\yactors?\y|\yactress\y|\ysingers?\y|netflix|\ytv\y|theatre|theater|fashion|\yawards?\y|\ycelebrit|\ypodcasts?\y|\ypoet(ry|s)?\y|documentar|\ynovels?\y|\yauthors?\y|\ymusicians?\y|\yconcerts?\y|\yexhibitions?\y|\yartists?\y|\ycomedian|\ydancer)'),
    ('education', 60, '(\yschools?\y|universit|\ystudents?\y|\ycolleges?\y|\ycampus|\yteachers?\y|curriculum|\yeducation|\yclassrooms?\y|\ylibrar(y|ies|ian|ians)\y)'),
    ('technology', 70, '(\ytechs?\y|technolog|\yapps?\y|google|\yapple\y|\yai\y|software|\yonline\y|\yplatforms?\y|social media|startup|cyber|facebook|instagram|tiktok|\ywebsites?\y)'),
    ('business-economy', 80, '(\ycompan(y|ies)\y|\ybusinesse?s?\y|\ymarkets?\y|\yeconom|\ybrands?\y|\yceo\y|corporate|\ystocks?\y|workplace|employ(er|ers|ment)|\yboycott)'),
    ('community', 90, '(\ypride\y|\ycommunit(y|ies)\y|\yparades?\y|\yvolunteers?\y|nonprofit|fundrais|\yvigils?\y|\yshelters?\y|\ymarch(es)?\y)'),
    -- Deliberately narrow, and last on the tie-break. `international` is a
    -- geography axis rather than a topic, so it overlaps with everything above;
    -- only multilateral bodies and explicitly global framing reach it. Most
    -- cross-border rights coverage lands in rights-legal, which is the more
    -- useful shelf.
    ('international', 100, '(united nations|\yunhcr\y|european union|council of europe|\yilga\y|human rights watch|amnesty international|worldwide|\yglobally\y|around the world|across the world)')
  ),
  hits as (
    select p.cat, p.prio, (select count(*) from regexp_matches(s.txt, p.pat, 'g')) as n
      from pats p, s
  )
  select cat from hits where n > 0 order by n desc, prio asc limit 1;
$fn$;

comment on function public.news_category_from_text(text, text, text[]) is
  'Deterministic news topic classifier over title+tags (double-weighted) + content. Returns the news_categories.slug with the most keyword evidence, or NULL when nothing matches. Priority is only the tie-break.';

grant execute on function public.news_category_from_text(text, text, text[])
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Assign at write time — every path, not just the pipeline
-- ---------------------------------------------------------------------------
-- A trigger rather than an edit to news_commit_staging_batch +
-- commit_news_staging_item: those are ~10k and ~12k characters of plpgsql each,
-- and this covers them both plus the admin CMS and any future writer, with no
-- transcription risk.
--
-- Three tiers, best signal first:
--   1. an explicit value on the row (the admin CMS writes the column directly)
--   2. the LLM's choice, read off the linked ingestion_staging row
--   3. the deterministic keyword classifier
--   ... else the 'general' sentinel.
--
-- Tiers 1 and 2 are both re-validated against news_categories, because a model
-- will invent a slug despite the enum and a stale admin form can post a retired
-- one. An out-of-vocabulary value is discarded and reclassified rather than
-- persisted for the FK to reject later.
--
-- Tier 2 reads ingestion_staging rather than taking the value as a column,
-- because neither commit RPC copies it into the INSERT and both are ~10k
-- characters of plpgsql that would have to be transcribed wholesale (from live
-- prosrc, which has drifted from the repo before) to add one field. Both RPCs
-- already set ingestion_staging_id, so the join is free and every current and
-- future staging-based writer is covered.
--
-- The keyword tier is what makes this regression-proof: pipeline-enrich-news is
-- circuit-broken, so on any breaker trip `ai` is null, mergedNormalized is null,
-- and tier 2 silently vanishes. That is exactly how a 90-day 100%-general
-- streak happens.
create or replace function public.news_derive_category()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_slug     text;
  v_via      text;
  v_rejected boolean := false;
begin
  -- Tier 1 — explicit value on the row. Never overwrite a real choice.
  if new.category_canonical is not null and new.category_canonical <> 'general' then
    if exists (select 1 from public.news_categories
                where slug = new.category_canonical and is_active) then
      new.enrichment_status := jsonb_set(
        coalesce(new.enrichment_status, '{}'::jsonb), array['category'],
        jsonb_build_object('via', 'supplied', 'at', now()), true);
      return new;
    end if;
    v_rejected := true;
  end if;

  -- Tier 2 — the LLM's choice, via the staging row the commit RPCs link.
  if new.ingestion_staging_id is not null then
    select c.slug into v_slug
      from public.ingestion_staging s
      join public.news_categories c
        on c.slug = nullif(s.normalized_data->>'category_canonical', '')
       and c.is_active
     where s.id = new.ingestion_staging_id;
    if v_slug is not null then
      new.category_canonical := v_slug;
      new.enrichment_status := jsonb_set(
        coalesce(new.enrichment_status, '{}'::jsonb), array['category'],
        jsonb_build_object('via', 'llm', 'at', now(), 'rejected_input', v_rejected), true);
      return new;
    end if;
  end if;

  -- Tier 3 — deterministic keywords.
  v_slug := public.news_category_from_text(new.title, new.content, new.tags);

  if v_slug is null then
    new.category_canonical := 'general';
    v_via := 'unmatched';
  else
    new.category_canonical := v_slug;
    v_via := 'keyword';
  end if;

  new.enrichment_status := jsonb_set(
    coalesce(new.enrichment_status, '{}'::jsonb), array['category'],
    jsonb_build_object('via', v_via, 'at', now(), 'rejected_input', v_rejected), true);
  return new;
end;
$fn$;

comment on function public.news_derive_category() is
  'BEFORE INSERT on news_articles: fills category_canonical from a validated caller value, else the LLM choice on the linked ingestion_staging row, else news_category_from_text, else the general sentinel. Never overwrites an existing non-general value.';

-- Name matters. BEFORE triggers fire in NAME order, and trg_normalize_news_tags
-- must run first so the classifier reads normalized tags — hence the `z_`
-- prefix, which is the same ordering device used by trg_*_geo_derive vs
-- trg_*_safety_gated on venues/events.
drop trigger if exists trg_z_news_derive_category on public.news_articles;
create trigger trg_z_news_derive_category
  before insert on public.news_articles
  for each row execute function public.news_derive_category();

-- ---------------------------------------------------------------------------
-- 5. Backfill runner
-- ---------------------------------------------------------------------------
-- Batched because every news_articles UPDATE fires trg_search_documents_news →
-- search_documents_index_news → an upsert against 3 GIN + 1 GIST index. The
-- sibling marketplace trigger was measured at ~55 ms/row and 99.5% of runtime
-- (20260806100000), so ~23.7k rows is 20-30 minutes of pure trigger time. A
-- single statement dies at the timeout and rolls back everything.
--
-- Selector keys on the authoritative column ALONE. The original reclassifier
-- used `coalesce(category_canonical, category, 'general') in ('general','news')`,
-- which returns the LEGACY value when canonical is null and so excluded those
-- rows forever.
create or replace function public.run_news_category_backfill(
  p_after       uuid    default null,
  p_max_batches integer default 0
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now();
  v_changed int := 0; v_examined int := 0; v_batch_changed int := 0;
  v_batches int := 0; v_book boolean := (p_max_batches = 0);
  v_last uuid := coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
  v_ids uuid[]; v_n int; v_done boolean := false;
begin
  -- Defence in depth; the cron command also sets it, because SET LOCAL cannot
  -- re-arm a top-level statement that is already running (see 20260619140002).
  set local statement_timeout = 0;

  if v_book then
    select id, enabled into v_automation_id, v_enabled
      from public.admin_automations where slug = 'news_category_backfill';
    insert into public.admin_automation_runs
      (automation_id, automation_slug, started_at, status, items_examined, items_changed)
    values (v_automation_id, 'news_category_backfill', v_started_at, 'success', 0, 0)
    returning id into v_run_id;
    if v_enabled is distinct from true then
      update public.admin_automation_runs
         set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
       where id = v_run_id;
      update public.admin_automations
         set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
      return jsonb_build_object('skipped', true, 'reason', 'paused');
    end if;
  end if;

  loop
    select array_agg(id order by id) into v_ids from (
      select id from public.news_articles
       where duplicate_of_id is null
         and id > v_last
         and coalesce(category_canonical, 'general') = 'general'
       order by id limit 500
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);   -- max(uuid) does not exist; keyset off the sorted array
    if v_n = 0 then v_done := true; exit; end if;
    v_last := v_ids[v_n];

    update public.news_articles a
       set category_canonical = m.cat,
           classified_at = now(),
           enrichment_status = jsonb_set(
             coalesce(a.enrichment_status, '{}'::jsonb), array['category'],
             jsonb_build_object('via', 'keyword', 'at', now(),
                                'prev', a.category_canonical), true)
      from (
        select id, public.news_category_from_text(title, content, tags) as cat
          from public.news_articles where id = any(v_ids)
      ) m
     where a.id = m.id
       and m.cat is not null
       and a.category_canonical is distinct from m.cat;
    get diagnostics v_batch_changed = row_count;

    v_changed  := v_changed + v_batch_changed;
    v_examined := v_examined + v_n;
    v_batches  := v_batches + 1;

    if v_n < 500 then v_done := true; exit; end if;
    if p_max_batches > 0 and v_batches >= p_max_batches then exit; end if;
  end loop;

  if v_book then
    update public.admin_automation_runs
       set finished_at = now(), items_examined = v_examined, items_changed = v_changed,
           summary = jsonb_build_object('classified', v_changed, 'examined', v_examined)
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;
  end if;

  return jsonb_build_object('classified', v_changed, 'examined', v_examined,
                            'done', v_done, 'last_id', v_last, 'batches', v_batches);
exception when others then
  -- Record and RETURN rather than re-RAISE: re-raising rolls back the very row
  -- that records the failure, which is half of why the last classifier's death
  -- was invisible (20260806100000).
  if v_book and v_run_id is not null then
    update public.admin_automation_runs
       set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'error' where id = v_automation_id;
  end if;
  return jsonb_build_object('error', sqlerrm, 'classified', v_changed,
                            'examined', v_examined, 'last_id', v_last);
end;
$fn$;

revoke all on function public.run_news_category_backfill(uuid, integer) from public;
grant execute on function public.run_news_category_backfill(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Registration — the part whose absence caused the four-month silent death
-- ---------------------------------------------------------------------------
insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'news_category_backfill',
  'News category classification',
  'Assigns news_articles.category_canonical from news_category_from_text for any row still on the general sentinel.',
  'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('type', 'rpc', 'fn', 'run_news_category_backfill', 'jobname', 'news_category_backfill'),
  '40 4 * * *'
)
on conflict (slug) do update
  set schedule = excluded.schedule, action = excluded.action, enabled = excluded.enabled;

select cron.schedule('news_category_backfill', '40 4 * * *',
  $cron$ set statement_timeout = 0; select public.run_news_category_backfill(); $cron$);

-- ---------------------------------------------------------------------------
-- 7. Release gates
-- ---------------------------------------------------------------------------
-- Severity 'high', not 'critical': check-data-quality-gates.mjs exits non-zero
-- only on critical, and a data backlog must not block unrelated deploys.
create or replace function public.release_gate_checks()
returns table(gate text, severity text, failures bigint, detail jsonb)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select 'hotline_unverified'::text, 'critical'::text,
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and coalesce((h->>'needs_review')::boolean, false) = false
    and (
      nullif(h->>'verified_at', '') is null
      or (h->>'verified_at')::date < (now() - interval '90 days')::date
    )
  union all
  select 'person_outing_guard', 'critical',
    count(*)::bigint, '{}'::jsonb
  from public.personalities p
  where p.duplicate_of_id is null
    and p.is_living
    and (p.visibility = 'public' or p.seo_indexable)
    and p.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
    and not (coalesce(p.wikidata_qid, '') ~ '^Q[0-9]+$')
    and not exists (
      select 1 from public.personality_sources s
      where s.personality_id = p.id and coalesce(s.source_entity_id, '') !~ '^SKIP_'
    )
  union all
  select 'person_nonperson_public', 'critical',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(p.id), '[]'::jsonb))
  from public.personalities p
  where p.visibility = 'public'
    and p.duplicate_of_id is null
    and p.enrichment_status->'personhood'->>'verdict' = 'non_person'
  union all
  select 'crim_consistency', 'critical',
    count(*)::bigint,
    jsonb_build_object('country_ids', coalesce(jsonb_agg(c.id), '[]'::jsonb))
  from public.countries c
  where (c.lgbti_criminalization->>'legal') = 'false'
    and c.equality_score >= 50
  union all
  select 'dup_integrity', 'critical',
    sum(cnt)::bigint, jsonb_object_agg(tbl, cnt)
  from (
    select 'venues' tbl, count(*) cnt from public.venues t
      left join public.venues d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'events', count(*) from public.events t
      left join public.events d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'personalities', count(*) from public.personalities t
      left join public.personalities d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
    union all
    select 'news_articles', count(*) from public.news_articles t
      left join public.news_articles d on d.id = t.duplicate_of_id
      where t.duplicate_of_id is not null and (d.id is null or d.duplicate_of_id is not null)
  ) dups
  union all
  select 'hotline_reachable', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and coalesce(h->>'kind', 'hotline') <> 'directory'
    and nullif(h->>'phone', '') is null
    and coalesce(jsonb_array_length(h->'channels'), 0) = 0
  union all
  select 'hotline_url_live', 'high',
    count(*)::bigint,
    jsonb_build_object('ids', coalesce(jsonb_agg(h->>'id'), '[]'::jsonb))
  from public.cms_pages cp
  cross join lateral jsonb_array_elements(cp.body_json->'hotlines') h
  where cp.slug = 'help'
    and (h->>'link_status') = 'broken'
  union all
  select 'venue_closed_seo', 'high',
    count(*)::bigint, '{}'::jsonb
  from public.venues v
  where v.closed_at is not null and v.seo_indexable is true
  union all
  select 'venue_url_freshness', 'high',
    count(*)::bigint,
    jsonb_build_object('with_website',
      (select count(*) from public.venues where duplicate_of_id is null and nullif(website, '') is not null))
  from public.venues v
  where v.duplicate_of_id is null
    and nullif(v.website, '') is not null
    and (v.url_checked_at is null or v.url_checked_at < now() - interval '90 days')
  union all
  -- Recently-published articles still on the 'general' sentinel. This is the
  -- gate that would have fired in 2026-06 when the previous classifier stopped.
  select 'news_category_coverage', 'high',
    count(*)::bigint,
    jsonb_build_object('window', '30 days')
  from public.news_articles n
  where n.duplicate_of_id is null
    and n.published_at > now() - interval '30 days'
    and coalesce(n.category_canonical, 'general') = 'general'
  union all
  -- The classifier itself stopped running. Catches the failure mode directly
  -- rather than waiting for the backlog above to become visible.
  select 'news_category_classifier_stale', 'high',
    count(*)::bigint,
    jsonb_build_object('last_run_at', max(a.last_run_at))
  from public.admin_automations a
  where a.slug = 'news_category_backfill'
    and (a.last_run_at is null or a.last_run_at < now() - interval '3 days');
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Self-test — the classifier can never regress silently through a migration
-- ---------------------------------------------------------------------------
do $do$
declare
  v text;
begin
  v := public.news_category_from_text('Supreme Court rules on same-sex marriage case', null, null);
  if v is distinct from 'rights-legal' then raise exception 'expected rights-legal, got %', v; end if;

  v := public.news_category_from_text('Senate election sees record queer candidates', null, null);
  if v is distinct from 'politics' then raise exception 'expected politics, got %', v; end if;

  v := public.news_category_from_text('New PrEP clinic opens downtown', null, null);
  if v is distinct from 'health-wellness' then raise exception 'expected health-wellness, got %', v; end if;

  v := public.news_category_from_text('Trans athlete wins Olympic tournament', null, null);
  if v is distinct from 'sports' then raise exception 'expected sports, got %', v; end if;

  v := public.news_category_from_text('Gregg Araki on sex, film and queer resistance', null, null);
  if v is distinct from 'culture-arts' then raise exception 'expected culture-arts, got %', v; end if;

  v := public.news_category_from_text('Brighton Pride parade draws thousands', null, null);
  if v is distinct from 'community' then raise exception 'expected community, got %', v; end if;

  v := public.news_category_from_text('United Nations body issues guidance worldwide', null, null);
  if v is distinct from 'international' then raise exception 'expected international, got %', v; end if;

  -- Tags alone must classify: they are plural in the corpus, which the
  -- inherited \m...\M anchors could never match.
  v := public.news_category_from_text('Untitled', null, array['sports','athletes']);
  if v is distinct from 'sports' then raise exception 'expected sports from plural tags, got %', v; end if;

  v := public.news_category_from_text('Interview with Zoe Sivak', null, array['authors','books','podcast']);
  if v is distinct from 'culture-arts' then raise exception 'expected culture-arts from plural tags, got %', v; end if;

  -- No signal must yield NULL, never a guess.
  v := public.news_category_from_text('Queerty Crossword: Aug. 1, 2026', null, null);
  if v is not null then raise exception 'expected NULL for an unclassifiable title, got %', v; end if;

  -- Regression guards for the two inherited defects. If someone "tidies" \y
  -- back to \b, or drops the optional plurals, these fail loudly.
  if 'the community meets' !~ '\ycommunity\y' then
    raise exception 'PostgreSQL word boundary is \y — \b is a backspace and matches nothing';
  end if;
  if 'reading books today' !~ '\ybooks?\y' then
    raise exception 'keyword patterns must tolerate plurals';
  end if;

  -- Evidence volume must beat priority order: a story with two education
  -- signals is education even though rights-legal sorts higher.
  v := public.news_category_from_text('School curriculum ban debated', null, null);
  if v is distinct from 'education' then raise exception 'expected education to outscore rights-legal, got %', v; end if;

  -- Every branch must name a real, active category.
  if exists (
    select 1 from unnest(array['rights-legal','politics','health-wellness','sports','culture-arts',
                               'education','technology','business-economy','community','international']) s(slug)
     where not exists (select 1 from public.news_categories c where c.slug = s.slug and c.is_active)
  ) then
    raise exception 'news_category_from_text can emit a slug that is not an active news_categories row';
  end if;

  -- The sentinel must exist and must stay out of the public tabs.
  if not exists (select 1 from public.news_categories where slug = 'general' and not is_active) then
    raise exception 'the general sentinel must exist with is_active=false';
  end if;
end $do$;
