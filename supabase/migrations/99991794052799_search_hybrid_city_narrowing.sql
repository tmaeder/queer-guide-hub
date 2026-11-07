-- search_hybrid: narrow the keyword arm to the detected city, with ranking that
-- keeps today's order.
--
-- When a query names a city ("bar sydney"), search_hybrid strips the city out
-- and runs the keyword arm on the rest ("bar"), i.e. over every match in the
-- corpus: 13,096 documents for "bar", 9,373 for "pride". Each is read from the
-- heap, joined back by primary key and ranked, and only then are the city's
-- own documents boosted. Measured on prod 2026-11-07: "bar sydney" 5.2 s,
-- "pride amsterdam" 3.6 s, "club london" 1.5 s.
--
-- Narrowing alone is fast and WRONG. Matching "bar" AND "sydney" returns ~120
-- rows (every in-city document already carries its city name in search_tsv:
-- measured on six city/word pairs, in-city matches with and without the city
-- term were identical), but the keyword rank inside RRF is 1/(60 + rank), and
-- the rank among 120 rows is far smaller than the same document's rank among
-- 13,000. That inflates the text term relative to lgbtq_score, liveness and
-- the other signals, and well-known Sydney gay bars (The Midnight Shift,
-- Colombian Hotel, The Beresford) fell out of the top 10, replaced by
-- restaurants and a brewery.
--
-- So when the arm is narrowed, each keyword rank is scaled by
--   (worldwide matches for the stripped query) / (in-city matches)
-- which puts a city document back at roughly the rank it held among all
-- matches. The worldwide count cannot be taken at query time (a count over the
-- GIN index still visits the heap: 1.7 s for "pride"), so it is read from
-- search_term_df, a lexeme -> document-frequency table built nightly with
-- ts_stat. Measured against an exact count before building the table:
-- bar sydney keeps 7 of today's 10 (the three it drops are generic bars; it
-- adds both Beresford rows) where narrowing alone kept 5; club london 10/10;
-- hotel new york and pride amsterdam 8/10 and 7/10, the drops being events
-- elsewhere (Rio Pride, a hotel in Mexico).
--
-- Narrowing only fires when the scale can be trusted: a city was detected,
-- the stripped query is a SINGLE lexeme, that lexeme is in search_term_df
-- (so its worldwide count is exact as of the last refresh), and the count is
-- >= 500. Everything else runs exactly as before (scale 1, no city term).
--
-- Two-word queries are deliberately left alone, and the dry run is why. No
-- cheap estimate of an AND count held up: the smallest word frequency
-- over-counted "lesbian bar" ~24x (4,817 vs 198) and kept 4 of 10 results,
-- and the independence product under-counted "gay bar" ~2.5x (~1,000 vs
-- 2,526) and kept 2 of 10. Two-word queries are also not the slow case: both
-- words must match, so the old path already returns small sets (gay bar paris
-- 126-431 ms, lesbian bar new york 21-56 ms). The slow ones are a single
-- common word plus a city: bar sydney 5.6-10.4 s, pride amsterdam 3.0-6.5 s,
-- club london 1.4-1.6 s, hotel new york 1.2-1.3 s.
--
-- The table keeps only lexemes in >= 200 documents, so a rare word is simply
-- absent and the query takes the old path.

create table if not exists public.search_term_df (
  lexeme       text primary key,
  ndoc         integer not null,
  refreshed_at timestamptz not null default now()
);
alter table public.search_term_df enable row level security;
revoke all on public.search_term_df from public, anon, authenticated;
comment on table public.search_term_df is
  'Document frequency per search_tsv lexeme (ndoc >= 200), rebuilt nightly by run_search_term_df_refresh(). Read by api_private.search_hybrid to scale keyword ranks when the keyword arm is narrowed to a detected city.';

create or replace function public.run_search_term_df_refresh()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_rows int;
begin
  delete from public.search_term_df;
  insert into public.search_term_df (lexeme, ndoc, refreshed_at)
  select word, ndoc, now()
  from ts_stat('select search_tsv from public.search_documents')
  where ndoc >= 200;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('lexemes', v_rows);
end
$fn$;
revoke all on function public.run_search_term_df_refresh() from public, anon, authenticated;

select public.run_search_term_df_refresh();

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'search_term_df_refresh',
  'search_term_df_refresh',
  'Nightly: rebuilds search_term_df (document frequency per search_tsv lexeme, ndoc >= 200) from ts_stat. search_hybrid reads it to scale keyword ranks when a query names a city and the keyword arm is narrowed to that city. A stale table only skews that scale; it never drops results.',
  'system',
  true,
  jsonb_build_object('type', 'schedule'),
  '43 2 * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'search_term_df_refresh',
    'command', 'select public.run_search_term_df_refresh();'
  )
)
on conflict (slug) do nothing;

select cron.schedule(
  'search_term_df_refresh',
  '43 2 * * *',
  public.admin_automation_effective_command(
    'search_term_df_refresh',
    (select action ->> 'command' from public.admin_automations where slug = 'search_term_df_refresh')))
where not exists (select 1 from cron.job where jobname = 'search_term_df_refresh');

-- Patch the live search_hybrid from pg_get_functiondef rather than restating
-- it; every anchor must occur exactly once.
do $mig$
declare
  v_oid oid := 'api_private.search_hybrid(text,extensions.vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_from text[] := array[
    'ftsonly as materialized (',
    'where p.eff_q is not null and sd.search_tsv @@ websearch_to_tsquery(''simple'',unaccent(p.eff_q))),',
    '< 20 and sd.title % p.eff_q)',
    'kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where kw_hit=1)'
  ];
  v_to text[] := array[
    'kwdf as materialized (select coalesce(p.dcity is not null and d.n_lex = 1 and d.n_found = 1 and d.df >= 500, false) narrow, coalesce(d.df, 0) df from p2 p left join lateral (select cardinality(l.arr) n_lex, count(t.lexeme) n_found, min(t.ndoc) df from (select tsvector_to_array(to_tsvector(''simple'', unaccent(coalesce(p.eff_q, '''')))) arr) l left join public.search_term_df t on t.lexeme = any(l.arr) group by l.arr) d on true),
ftsonly as materialized (',
    'where p.eff_q is not null and sd.search_tsv @@ websearch_to_tsquery(''simple'',unaccent(case when (select narrow from kwdf) then p.eff_q||chr(32)||p.dcity else p.eff_q end))),',
    '< 20 and sd.title % p.eff_q and (not (select narrow from kwdf) or lower(sd.city)=lower(p.dcity)))',
    'kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) * (select case when narrow then greatest(1.0, df::numeric / greatest((select count(*) from ftsonly), 1)) else 1.0 end from kwdf) rk from cand where kw_hit=1)'
  ];
  v_n int;
  i int;
begin
  if position('kwdf as materialized' in v_def) > 0 then
    raise notice 'search_hybrid city narrowing already applied; nothing to do';
    return;
  end if;
  for i in 1 .. array_length(v_from, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_from[i], ''))) / length(v_from[i]);
    if v_n <> 1 then raise exception 'anchor % found % times, expected 1', i, v_n; end if;
  end loop;
  for i in 1 .. array_length(v_from, 1) loop
    v_def := replace(v_def, v_from[i], v_to[i]);
  end loop;
  execute v_def;
end
$mig$;

do $verify$
declare
  v_src text;
  v_cfg text[];
  v_n   int;
begin
  select prosrc, proconfig into v_src, v_cfg from pg_proc
   where oid = 'api_private.search_hybrid(text,extensions.vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure;
  if position('kwdf as materialized' in v_src) = 0 then raise exception 'P1 failed: kwdf CTE missing'; end if;
  if position('when (select narrow from kwdf) then p.eff_q||chr(32)||p.dcity' in v_src) = 0 then raise exception 'P2 failed: city term not added to the narrowed FTS'; end if;
  if position('(not (select narrow from kwdf) or lower(sd.city)=lower(p.dcity))' in v_src) = 0 then raise exception 'P3 failed: trigram arm not narrowed'; end if;
  if position('df::numeric / greatest((select count(*) from ftsonly), 1)' in v_src) = 0 then raise exception 'P4 failed: keyword rank not scaled'; end if;
  if position('d.n_lex = 1 and d.n_found = 1 and d.df >= 500' in v_src) = 0 then raise exception 'P5 failed: single-lexeme narrowing gate missing'; end if;
  if not ('plan_cache_mode=force_custom_plan' = any(v_cfg)) then raise exception 'P6 failed: function SET clause lost'; end if;
  -- Corpus-size independent on purpose: CI builds a small local database where
  -- only ~65 lexemes reach 200 documents (prod: 4,556), and a fixed floor sized
  -- against prod failed there. The claim is that the refresh ran and wrote.
  select count(*) into v_n from public.search_term_df;
  if v_n = 0 and exists (select 1 from public.search_documents) then
    raise exception 'P7 failed: search_term_df is empty although search_documents has rows';
  end if;
  if not exists (select 1 from cron.job where jobname = 'search_term_df_refresh') then raise exception 'P8 failed: refresh cron missing'; end if;
  if has_table_privilege('anon', 'public.search_term_df', 'select') then raise exception 'P9 failed: anon can read search_term_df'; end if;
end
$verify$;
