-- News classifier: stop an arbitrary priority order manufacturing confidence.
--
-- Reported symptom: the Queerty article "These gay fishermen are quite the
-- catch" was filed under Rights & Legal on the live front page.
--
-- It is not a bad keyword. Scoring that article gives a THREE-WAY TIE:
--
--     rights-legal  1   ("law"          — "it's practically a law up here")
--     culture-arts  1   ("film"         — "the recent film On the Sea")
--     technology    1   ("social media" — "on social media, gay anglers…")
--
-- All three are incidental mentions in the body; the headline carries no
-- category signal at all. 20260808120000 broke that tie with `prio asc`, and
-- rights-legal happens to sort first — so on a no-signal article the classifier
-- silently defaults to whatever sits at the top of the list.
--
-- Measured over the 18,876 rows this classifier had labelled: 2,073 (~11%) were
-- decided purely by that tie-break, and 1,062 of those were 1-1 ties with no
-- evidence on any side.
--
-- Two changes:
--
--   1. HEADLINE TIER. Title + tags are scored separately from body, and any
--      category matching the headline outranks every body-only match. A
--      headline states what a piece is about; a body mention is often an aside.
--      This is what fixes "A Dose of New Hollywood" (was sports, now
--      culture-arts), "Bangladesh students expelled and jailed over alleged
--      homosexuality" (was education, now rights-legal) and "Biohacking
--      Menstrual Cycles" (was technology, now health-wellness).
--
--   2. NO GUESSING ON A BODY-ONLY TIE. Priority still breaks ties inside the
--      headline tier — a headline match is real evidence, and picking among
--      several is defensible. But when the best we have is equal counts of
--      incidental body mentions, there is no signal, so return NULL and let the
--      caller record it as unclassified. That is the same principle as removing
--      the NewsCard tag fallback in 20260808120000: an honest gap beats an
--      invented value that looks authoritative.
--
-- Cost is deliberate: 1,370 rows (6.9% of what this classifier had labelled)
-- return to unclassified, taking coverage 83.3% -> ~77.5%. They were coin
-- flips — the 1-hit cohort measured 51% agreement against existing labels
-- versus 64% at 3+ hits.

create or replace function public.news_category_from_text(
  p_title   text,
  p_content text,
  p_tags    text[]
) returns text
language sql
immutable
set search_path to 'public'
as $fn$
  with
  head as (
    select lower(coalesce(p_title, '') || ' ' ||
                 array_to_string(coalesce(p_tags, '{}'::text[]), ' ')) as t
  ),
  body as (
    select lower(left(coalesce(p_content, ''), 1200)) as t
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
    ('international', 100, '(united nations|\yunhcr\y|european union|council of europe|\yilga\y|human rights watch|amnesty international|worldwide|\yglobally\y|around the world|across the world)')
  ),
  scored as (
    select p.cat, p.prio,
           (select count(*) from regexp_matches((select t from head), p.pat, 'g')) as hn,
           (select count(*) from regexp_matches((select t from body), p.pat, 'g')) as bn
      from pats p
  ),
  ranked as (
    -- tier 1 = matched the headline, tier 2 = body only. Count within the tier
    -- that actually decided the row; a headline hit is never diluted by body noise.
    select cat, prio,
           case when hn > 0 then 1 else 2 end as tier,
           case when hn > 0 then hn else bn end as n
      from scored
     where hn > 0 or bn > 0
  ),
  best as (select * from ranked order by tier asc, n desc, prio asc limit 1),
  tied as (select count(*) as c from ranked r, best b where r.tier = b.tier and r.n = b.n)
  select case
           when (select tier from best) = 1 then (select cat from best)  -- headline evidence: prio may break the tie
           when (select c from tied) = 1     then (select cat from best)  -- body evidence, but unambiguous
           else null                                                     -- body-only tie: no signal, refuse
         end;
$fn$;

comment on function public.news_category_from_text(text, text, text[]) is
  'Deterministic news topic classifier. Headline (title+tags) matches outrank body-only matches; within a tier the most keyword evidence wins, priority breaks ties. Returns NULL on a body-only tie rather than guessing. NULL means unclassified.';

-- ---------------------------------------------------------------------------
-- One-off revision pass for rows THIS classifier already labelled
-- ---------------------------------------------------------------------------
-- run_news_category_backfill only selects rows still on the 'general' sentinel,
-- so it can never revisit its own past output. This does, and it is scoped hard:
--
--   enrichment_status->'category'->>'via' = 'keyword'
--
-- which is exactly the set this classifier wrote. It therefore cannot touch the
-- ~14,090 pre-existing labels (whose provenance is unknown and which are NOT
-- ours to silently overwrite), nor anything stamped 'llm' or 'supplied'.
--
-- Deliberately a separate function rather than a p_revise argument on the
-- runner: adding a defaulted parameter creates an overload, and the pg_cron
-- entry then fails to resolve which one to call (42725).
create or replace function public.run_news_category_revise(
  p_after       uuid    default null,
  p_max_batches integer default 0
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_changed int := 0; v_cleared int := 0; v_examined int := 0;
  v_batch int := 0; v_batches int := 0;
  v_last uuid := coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
  v_ids uuid[]; v_n int; v_done boolean := false;
begin
  set local statement_timeout = 0;
  loop
    select array_agg(id order by id) into v_ids from (
      select id from public.news_articles
       where duplicate_of_id is null
         and id > v_last
         and enrichment_status->'category'->>'via' = 'keyword'
       order by id limit 500
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);
    if v_n = 0 then v_done := true; exit; end if;
    v_last := v_ids[v_n];

    update public.news_articles a
       set category_canonical = coalesce(m.cat, 'general'),
           classified_at = now(),
           enrichment_status = jsonb_set(
             coalesce(a.enrichment_status, '{}'::jsonb), array['category'],
             jsonb_build_object(
               'via', case when m.cat is null then 'unmatched' else 'keyword' end,
               'at', now(), 'prev', a.category_canonical, 'rule', 'headline_tier'), true)
      from (
        select id, public.news_category_from_text(title, content, tags) as cat
          from public.news_articles where id = any(v_ids)
      ) m
     where a.id = m.id
       and a.category_canonical is distinct from coalesce(m.cat, 'general');
    get diagnostics v_batch = row_count;

    select count(*) into v_cleared from public.news_articles
     where id = any(v_ids) and coalesce(category_canonical,'general') = 'general';

    v_changed := v_changed + v_batch;
    v_examined := v_examined + v_n;
    v_batches := v_batches + 1;

    if v_n < 500 then v_done := true; exit; end if;
    if p_max_batches > 0 and v_batches >= p_max_batches then exit; end if;
  end loop;

  return jsonb_build_object('revised', v_changed, 'examined', v_examined,
                            'done', v_done, 'last_id', v_last, 'batches', v_batches);
end;
$fn$;

revoke all on function public.run_news_category_revise(uuid, integer) from public;
grant execute on function public.run_news_category_revise(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Self-test
-- ---------------------------------------------------------------------------
do $do$
declare v text;
begin
  -- Headline signals still classify exactly as before.
  v := public.news_category_from_text('Supreme Court rules on same-sex marriage case', null, null);
  if v is distinct from 'rights-legal' then raise exception 'expected rights-legal, got %', v; end if;

  v := public.news_category_from_text('Senate election sees record queer candidates', null, null);
  if v is distinct from 'politics' then raise exception 'expected politics, got %', v; end if;

  v := public.news_category_from_text('New PrEP clinic opens downtown', null, null);
  if v is distinct from 'health-wellness' then raise exception 'expected health-wellness, got %', v; end if;

  v := public.news_category_from_text('Trans athlete wins Olympic tournament', null, null);
  if v is distinct from 'sports' then raise exception 'expected sports, got %', v; end if;

  v := public.news_category_from_text('Brighton Pride parade draws thousands', null, null);
  if v is distinct from 'community' then raise exception 'expected community, got %', v; end if;

  v := public.news_category_from_text('United Nations body issues guidance worldwide', null, null);
  if v is distinct from 'international' then raise exception 'expected international, got %', v; end if;

  v := public.news_category_from_text('Untitled', null, array['sports','athletes']);
  if v is distinct from 'sports' then raise exception 'expected sports from plural tags, got %', v; end if;

  v := public.news_category_from_text('Interview with Zoe Sivak', null, array['authors','books','podcast']);
  if v is distinct from 'culture-arts' then raise exception 'expected culture-arts from tags, got %', v; end if;

  v := public.news_category_from_text('School curriculum ban debated', null, null);
  if v is distinct from 'education' then raise exception 'expected education to outscore rights-legal, got %', v; end if;

  v := public.news_category_from_text('Queerty Crossword: Aug. 1, 2026', null, null);
  if v is not null then raise exception 'expected NULL for an unclassifiable title, got %', v; end if;

  -- THE REPORTED BUG: no headline signal, three single incidental body mentions.
  -- Must refuse rather than hand it to whichever category sorts first.
  v := public.news_category_from_text(
         'These gay fishermen are quite the catch',
         'It''s practically a law up here, one Reddit user wrote. On social media, gay anglers '
         'are showing off all the right angles, not just in the recent film On the Sea.',
         null);
  if v is not null then
    raise exception 'body-only tie must return NULL, got % (the fishing-article regression)', v;
  end if;

  -- A headline match must beat a stronger body match: the piece is about drag,
  -- not about the court case it happens to mention three times.
  v := public.news_category_from_text(
         'Drag brunch returns to the village', 'The court ruling and the court appeal and the court verdict.', null);
  if v is distinct from 'culture-arts' then
    raise exception 'headline must outrank body, got %', v;
  end if;

  -- An UNAMBIGUOUS body-only match is still usable — this is not a blanket
  -- "ignore the body" rule.
  v := public.news_category_from_text('Weekend notes', 'The olympic tournament continues.', null);
  if v is distinct from 'sports' then
    raise exception 'unambiguous body match must still classify, got %', v;
  end if;

  -- Regression guards from 20260808120000 stay live.
  if 'the community meets' !~ '\ycommunity\y' then
    raise exception 'PostgreSQL word boundary is \y — \b is a backspace and matches nothing';
  end if;
  if 'reading books today' !~ '\ybooks?\y' then
    raise exception 'keyword patterns must tolerate plurals';
  end if;
end $do$;
