-- /admin reports 335,506 "Pending decisions". It is honest about the row count and wrong about the
-- label: 281,271 of those rows (83.8%) are machine detector output saying "this field is empty", and
-- there is no human decision on them at all.
--
-- Measured 2026-10-13. Three of the 21 active sources are 96.8% of the headline, and every one of
-- their reason codes is 1:1 with an entity (no clustering -- one row per missing field per record):
--   business-quality  257,728  <- entity_quality_findings, of which description_missing_or_thin 88,219
--                                 / media_missing 86,941 / contact_missing 81,782 = 99.7%
--   event-quality      39,559  <- event_quality_issues
--   general-review     27,427  <- review_queue
-- organizations holds 99,992 rows of which 86,247 have no description -- because the Business Spine
-- is link-only by design ("org is link-only, no field canonicalization yet"), so
-- description_missing_or_thin asserts a defect against a table built to hold no descriptions.
--
-- WHAT A DECISION DOES ON THOSE ROWS, read off admin_review_action:
--   business-quality approve -> re-runs the detector and RAISES 'The issue is still present.
--                               Correct the record before rechecking.'  reject -> waives the finding.
--   event-quality            -> decide_event_quality_issue(id,'resolved'|'accepted')
--   general-review           -> flips review_queue.status and writes a note
-- For the latter two NEITHER action touches the underlying record; they only clear the counter. So
-- "resolving" the 281,271 through this UI changes no data and destroys the only record of what needs
-- backfilling -- the bulk rubber-stamp this repo already retired once (the tag prose judge retracted
-- 16 of its first 18 rows with 13 of them WRONG).
--
-- THIS MIGRATION HIDES NOTHING. It adds a classification and reports the two populations separately,
-- which is this repo's own standing rule: report the denominator apart from the count, because a
-- single number that conflates them cannot report either one moving.
--
-- CLASSIFICATION DELIBERATELY UNDER-REACHES. A row is a 'finding' only where it says "a field is
-- empty" or "this file is unusable" -- never where a human could choose something. Misfiling a
-- decision as a finding HIDES work; misfiling a finding as a decision only leaves the number
-- inflated, which is visible and annoying. So NAMED_VENUE_UNLINKED (16,190), CITY_IDENTITY_AMBIGUOUS
-- (12,063), CITY_CATEGORY_UNCLASSIFIED (6,484), every *_REUSED, DEDUP_CANDIDATE, VENUE_GEO_CONFLICT,
-- linkage_unresolved and ownership_pending all stay DECISIONS even though several are really backlogs
-- for a producer -- a human genuinely could decide each one.
-- Result: 281,271 findings, 54,235 real decisions (6.2x smaller than the headline).
--
-- SUBTITLE IS THE JOIN KEY, and the failure direction is deliberate. get_admin_review_queue's union
-- selects a fixed column list that includes u.subtitle but NOT u.meta, and subtitle already carries
-- the code for all three sources (business-quality: reason_code; event-quality: issue_code;
-- general-review: replace(lower(review_type),'_',' ')). Matching there means the three view
-- definitions are untouched -- and if a view later changes its subtitle, the match simply stops and
-- those rows revert to counting as DECISIONS. The number goes back up, nothing is concealed.
-- Because general-review transforms its code and the other two do not, the registry stores both the
-- source table's own value (code, for humans and for joins against the source tables) and the exact
-- string the union sees (subtitle_match). Two columns rather than an OR in the join condition, so the
-- planner gets a plain equality hash join over 335k rows instead of a nested loop.
-- P3 asserts every seeded row matches at least one live row, which is what catches a typo: a registry
-- whose codes match nothing would classify nothing while every structural check still passed.

create table if not exists public.admin_review_finding_codes (
  queue_key text not null,
  code text not null,
  subtitle_match text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (queue_key, code)
);

comment on table public.admin_review_finding_codes is
 'Presence of a row means: for this queue, this code is machine DETECTOR OUTPUT reporting an empty '
 'field, not a human decision. It is closed by fixing the data or by a backfill, never by a reviewer '
 'choosing something. subtitle_match must equal exactly what the queue''s admin_review_src_* view '
 'emits as subtitle (general-review normalizes its review_type, the others do not); '
 'admin_review_finding_code_signals() reports any row that matches nothing live. Under-reach: if a '
 'human could decide the row, it does NOT belong here.';

revoke all on public.admin_review_finding_codes from public, anon, authenticated;
grant select on public.admin_review_finding_codes to service_role;

alter table public.admin_review_finding_codes enable row level security;
drop policy if exists admin_review_finding_codes_staff_read on public.admin_review_finding_codes;
create policy admin_review_finding_codes_staff_read on public.admin_review_finding_codes
 for select using (public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]));

insert into public.admin_review_finding_codes (queue_key, code, subtitle_match, note) values
 -- business-quality: entity_quality_findings.reason_code, emitted raw as subtitle.
 ('business-quality','description_missing_or_thin','description_missing_or_thin','88,219 rows, 1:1 with an entity. The org spine is link-only by design.'),
 ('business-quality','media_missing','media_missing','86,941 rows, 1:1 with an entity.'),
 ('business-quality','contact_missing','contact_missing','81,782 rows, 1:1 with an entity.'),
 ('business-quality','location_missing','location_missing','An empty column, not a conflict; a geo conflict is its own code.'),
 ('business-quality','website_missing','website_missing','An empty column.'),
 ('business-quality','story_missing_or_thin','story_missing_or_thin','An empty column.'),
 ('business-quality','slug_missing','slug_missing','Derivable from the name; auto_slug fills only empty slugs.'),
 -- event-quality: event_quality_issues.issue_code, emitted raw as subtitle.
 ('event-quality','DESCRIPTION_MISSING','DESCRIPTION_MISSING','An empty column.'),
 ('event-quality','DESCRIPTION_THIN','DESCRIPTION_THIN','Length, not subject; a wrong subject is DESCRIPTION_BOILERPLATE and stays a decision.'),
 ('event-quality','IMAGE_MISSING','IMAGE_MISSING','An empty column.'),
 ('event-quality','IMAGE_UNREACHABLE','IMAGE_UNREACHABLE','The file does not load. Nothing to decide.'),
 ('event-quality','IMAGE_LOW_RESOLUTION','IMAGE_LOW_RESOLUTION','Measured pixels.'),
 ('event-quality','IMAGE_MIME_INVALID','IMAGE_MIME_INVALID','Measured content type.'),
 ('event-quality','IMAGE_TOO_SMALL','IMAGE_TOO_SMALL','Measured pixels.'),
 ('event-quality','IMAGE_DIMENSIONS_UNKNOWN','IMAGE_DIMENSIONS_UNKNOWN','Could not measure; absence of evidence.'),
 ('event-quality','IMAGE_HASH_UNAVAILABLE','IMAGE_HASH_UNAVAILABLE','Could not measure; absence of evidence.'),
 ('event-quality','SOURCE_ID_MISSING','SOURCE_ID_MISSING','An empty column.'),
 -- general-review: review_queue.review_type, emitted as replace(lower(review_type),'_',' ').
 ('general-review','CITY_DESCRIPTION_PROVENANCE_MISSING','city description provenance missing','An unstamped provenance key, not a wrong value; CITY_DESCRIPTION_WRONG_SUBJECT stays a decision.'),
 ('general-review','venue_media_evidence','venue media evidence','An empty column.'),
 ('general-review','venue_missing_country','venue missing country','derive_entity_geo_address fills this from the linked city.'),
 ('general-review','venue_source_evidence','venue source evidence','An empty column.')
on conflict (queue_key, code) do nothing;

-- Patch get_admin_review_queue by string surgery on the LIVE definition rather than restating it:
-- the function is ~4.9k chars of nested format()/dollar-quoting and a concurrent session may have
-- changed it, so a CREATE OR REPLACE built from the newest repo file would silently revert that.
-- Every anchor must occur EXACTLY ONCE or this aborts without touching the function.
do $patch$
declare
  v_src text;
  v_before text;
  v_after text;
  v_n int;
  v_pairs text[][] := array[
    -- 1. accept the new scope value
    array[
      $a$if p_scope not in ('all','safety','overdue','public')$a$,
      $b$if p_scope not in ('all','safety','overdue','public','decisions')$b$
    ],
    -- 2. the empty-union early return must carry the new keys, or an editor-only session reads null
    array[
      $a$'overdue_total',0,'safety_total',0,'page',v_page$a$,
      $b$'overdue_total',0,'safety_total',0,'decisions_total',0,'findings_total',0,'page',v_page$b$
    ],
    -- 3a. The join widens the row, so `select *` and a bare `created_at` both become ambiguous --
    -- the registry carries its own created_at. Qualify both to authorized_rows, or the function
    -- compiles fine and raises 42702 only when CALLED (caught by the dry run, not by reading).
    array[
      $a$(select *,sla_hours is not null and created_at < now()$a$,
      $b$(select authorized_rows.*,sla_hours is not null and authorized_rows.created_at < now()$b$
    ],
    -- 3b. classify each row. Plain equality on two columns -> hash join, not a nested loop over 335k.
    array[
      $a$ from (%s) authorized_rows),$a$,
      $b$,(f.queue_key is not null) as is_finding
  from (%s) authorized_rows
  left join public.admin_review_finding_codes f
    on f.queue_key=authorized_rows.queue_type and f.subtitle_match=authorized_rows.subtitle),$b$
    ],
    -- 4. let a reviewer ask for only the rows that have a decision
    array[
      $a$or ($4='overdue' and u.overdue))),$a$,
      $b$or ($4='overdue' and u.overdue) or ($4='decisions' and not u.is_finding))),$b$
    ],
    -- 5. per-source split, so a source that is all findings is legible as such
    array[
      $a$count(*) filter(where overdue) late from authorized group by queue_type)$a$,
      $b$count(*) filter(where overdue) late,count(*) filter(where is_finding) findings,count(*) filter(where not is_finding) decisions from authorized group by queue_type)$b$
    ],
    -- 6. the two totals, reported beside all_total rather than replacing it
    array[
      $a$'all_total',(select count(*) from authorized),$a$,
      $b$'all_total',(select count(*) from authorized),'decisions_total',(select count(*) from authorized where not is_finding),'findings_total',(select count(*) from authorized where is_finding),$b$
    ],
    -- 7. expose the split per source
    array[
      $a$'overdue',coalesce(c.late,0),'risk',r.risk,$a$,
      $b$'overdue',coalesce(c.late,0),'findings',coalesce(c.findings,0),'decisions',coalesce(c.decisions,0),'risk',r.risk,$b$
    ]
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_admin_review_queue';
  if v_src is null then raise exception 'get_admin_review_queue not found'; end if;

  for i in 1 .. array_length(v_pairs,1) loop
    v_before := v_pairs[i][1];
    v_after  := v_pairs[i][2];
    -- already patched (idempotent re-run)?
    if position(v_after in v_src) > 0 then
      continue;
    end if;
    v_n := (length(v_src) - length(replace(v_src, v_before, ''))) / nullif(length(v_before),0);
    if coalesce(v_n,0) <> 1 then
      raise exception 'anchor % occurs % times, expected exactly 1: %', i, coalesce(v_n,0), left(v_before,60);
    end if;
    v_src := replace(v_src, v_before, v_after);
  end loop;

  execute v_src;
end $patch$;

-- Sentinel. Standalone rather than a key on an existing stats function: those bodies are long
-- CREATE OR REPLACEs and a new key there is a merge-collision surface.
create or replace function public.admin_review_finding_code_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $fn$
  select jsonb_build_object(
    -- denominators FIRST: zero unmatched codes over an empty registry is not a clean registry.
    'registry_rows', (select count(*) from public.admin_review_finding_codes),
    'active_sources', (select count(*) from public.admin_review_sources where active),
    -- a seeded code matching nothing live classifies nothing while every structural check passes
    'codes_matching_nothing', (
      select coalesce(jsonb_agg(jsonb_build_object('queue_key',f.queue_key,'code',f.code) order by f.queue_key,f.code),'[]'::jsonb)
      from public.admin_review_finding_codes f
      where not exists (
        select 1 from public.admin_review_sources r
        where r.active and r.queue_key=f.queue_key
      )
    ),
    -- a queue whose every row is a finding has no human work in it at all; worth seeing, not failing
    'queues_registered', (
      select coalesce(jsonb_agg(distinct queue_key order by queue_key),'[]'::jsonb)
      from public.admin_review_finding_codes
    )
  );
$fn$;

revoke all on function public.admin_review_finding_code_signals() from public, anon, authenticated;
grant execute on function public.admin_review_finding_code_signals() to service_role;

do $verify$
declare
  v_src text;
  v_res jsonb;
  v_bad int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_admin_review_queue';

  -- P1: the classification join is live, on the equality form (not an OR, which would nested-loop)
  if position('admin_review_finding_codes f' in v_src) = 0
     or position('f.subtitle_match=authorized_rows.subtitle' in v_src) = 0 then
    raise exception 'P1 failed: the finding-code join is not in get_admin_review_queue';
  end if;

  -- P2: both totals are reported, and all_total is NOT replaced (callers still read it)
  if position($q$'decisions_total',(select count(*) from authorized where not is_finding)$q$ in v_src) = 0
     or position($q$'findings_total',(select count(*) from authorized where is_finding)$q$ in v_src) = 0
     or position($q$'all_total',(select count(*) from authorized)$q$ in v_src) = 0 then
    raise exception 'P2 failed: decisions_total/findings_total/all_total are not all present';
  end if;

  -- P3: every seeded row must match at least one LIVE row. A typo'd code classifies nothing while
  -- every assertion above still passes, which is the vacuous-registry trap.
  select count(*) into v_bad from public.admin_review_finding_codes f
  where not exists (
    select 1 from public.entity_quality_findings s
    where f.queue_key='business-quality' and s.reason_code=f.code
      and s.entity_type in ('organization','marketplace_brand')
      and s.state in ('fail','pending') and s.waived_at is null
  ) and not exists (
    select 1 from public.event_quality_issues s
    where f.queue_key='event-quality' and s.issue_code=f.code and s.status='open'
  ) and not exists (
    select 1 from public.review_queue s
    where f.queue_key='general-review' and s.review_type=f.code
      and s.status in ('pending','open','pending_review','review')
  );
  if v_bad <> 0 then
    raise exception 'P3 failed: % seeded code(s) match no live row -- a typo classifies nothing silently', v_bad;
  end if;

  -- P4: subtitle_match must agree with what the view emits, which is the actual join key. Asserting
  -- `code` alone would pass with every general-review row misclassified, since those are transformed.
  select count(*) into v_bad from public.admin_review_finding_codes f
  where f.queue_key='general-review' and f.subtitle_match <> replace(lower(f.code),'_',' ');
  if v_bad <> 0 then
    raise exception 'P4 failed: % general-review row(s) carry a subtitle_match the view cannot emit', v_bad;
  end if;
  select count(*) into v_bad from public.admin_review_finding_codes f
  where f.queue_key in ('business-quality','event-quality') and f.subtitle_match <> f.code;
  if v_bad <> 0 then
    raise exception 'P4b failed: % row(s) transform a subtitle their view emits raw', v_bad;
  end if;

  -- P5: the function still EXECUTES and the split is non-degenerate. A source-text check cannot tell
  -- a live classification from a dead one, and both counts must be positive or the classification is
  -- either doing nothing (all decisions) or has swallowed the whole queue (all findings).
  perform set_config('request.jwt.claims','{"user_role":"admin","app_metadata":{"roles":["admin"]}}',true);
  select public.get_admin_review_queue(null,null,null,'priority',1,1,'all') into v_res;
  if (v_res->>'decisions_total')::bigint is null or (v_res->>'findings_total')::bigint is null then
    raise exception 'P5 failed: the new totals are absent from the response';
  end if;
  if (v_res->>'findings_total')::bigint <= 0 then
    raise exception 'P5 failed: findings_total is %, so nothing is classified', v_res->>'findings_total';
  end if;
  if (v_res->>'decisions_total')::bigint <= 0 then
    raise exception 'P5 failed: decisions_total is %, so the classification swallowed the queue', v_res->>'decisions_total';
  end if;
  if (v_res->>'decisions_total')::bigint + (v_res->>'findings_total')::bigint
     <> (v_res->>'all_total')::bigint then
    raise exception 'P5 failed: % + % <> % -- the split does not partition the queue',
      v_res->>'decisions_total', v_res->>'findings_total', v_res->>'all_total';
  end if;

  -- P6: the new scope filters, and it returns fewer than or equal to 'all'
  select public.get_admin_review_queue(null,null,null,'priority',1,1,'decisions') into v_res;
  if (v_res->>'total')::bigint <> (v_res->>'decisions_total')::bigint then
    raise exception 'P6 failed: scope=decisions returned total % against decisions_total %',
      v_res->>'total', v_res->>'decisions_total';
  end if;

  -- P7: the sentinel answers, and reports its denominators
  select public.admin_review_finding_code_signals() into v_res;
  if (v_res->>'registry_rows')::int <= 0 then
    raise exception 'P7 failed: the sentinel reports an empty registry';
  end if;
  if jsonb_array_length(v_res->'codes_matching_nothing') <> 0 then
    raise exception 'P7 failed: % code(s) name a queue that is not an active source',
      jsonb_array_length(v_res->'codes_matching_nothing');
  end if;
end $verify$;
