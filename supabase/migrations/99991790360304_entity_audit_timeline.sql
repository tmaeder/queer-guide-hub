-- entity_audit_timeline() — one normalized shape over every record of what the
-- machine did to one entity.
--
-- WHAT IT UNIONS. content_revisions (field-level diffs), entity_review_queue
-- (proposals and decisions, two events per row), field_provenance /
-- venue_field_provenance (where a value came from), enrichment_status (per-step
-- state), the seven *_quality_signals ledgers, the three merge audits,
-- ingestion_staging + ingestion_events (the ingest path), and the two
-- consensus audits. Plus `gap` rows — see the bottom of this header.
--
-- ORDERING, AND WHY THERE IS NO GLOBAL SEQUENCE. Only content_revisions has a
-- monotonic `seq`. Everything else is timestamped with now(), which is
-- TRANSACTION time, so a single pipeline pass writes a staging row, a
-- provenance entry and a revision at byte-identical timestamps. Synthesizing a
-- cross-source sequence would look authoritative and would be a fabricated
-- causal claim — consumers would build "what happened next" on it and be
-- wrong. So: `source_seq` carries a real sequence where one exists and NULL
-- where it does not, `row_no` is the ordinal of this response and nothing more,
-- and `occurred_at_is_tx` tells the renderer when a same-second cluster is not
-- an ordering. `source_rank` breaks ties in the order a pipeline pass actually
-- runs, and is documented on the function as PRESENTATION, not evidence.
--
-- UNDATED PROVENANCE IS NOT DATED. field_provenance has no enforced shape and
-- usually no timestamp. Those entries come back with occurred_at NULL in
-- sort_bucket 2 (current state), never dated from the row's updated_at. That
-- substitution is available, cheap, and would invent a history indistinguishable
-- from a recorded one.
--
-- SECURITY DEFINER, DELIBERATELY, AND THE REASON IS THE RLS PATCHWORK.
-- The sources are governed four different ways: content_revisions admits
-- admin/moderator/EDITOR; entity_review_queue, the signal ledgers and
-- venue_field_provenance admit admin/moderator; ingestion_staging,
-- ingestion_events and entity_merge_audit are ADMIN ONLY. Under SECURITY
-- INVOKER a moderator would get revisions, reviews, signals and provenance and
-- ZERO rows from ingestion and merge — with no error and no empty-state. A
-- timeline whose completeness silently varies by role is precisely this repo's
-- signature failure, and an audit tool that does it is worse than none.
--
-- 20290601120731 does not argue against this. That function was DEFINER with
-- NO role check in its body AND an explicit anon grant, and it returned
-- safety-gated content to signed-out visitors. Both defects are orthogonal to
-- the security mode; INVOKER was merely the cheapest fix there because its only
-- real caller was already a definer sweep. Here the caller is the admin console
-- holding a user JWT, and reading across tables the caller cannot read
-- individually is the entire point. So: DEFINER, a role gate as the first
-- statement, no anon grant, and a verification block that fails the deploy if a
-- later CREATE OR REPLACE drops the gate — which is the regression that has
-- already happened once in this schema.
--
-- NO `editor` GRANT, even though content_revisions RLS admits editors. The
-- union includes ingestion_staging.raw_data and pipeline internals no editor
-- can read today; granting here would be a silent privilege widening. Editors
-- keep their existing direct SELECT on content_revisions.
--
-- GAPS ARE ROWS. Every source this function cannot read for a given type emits
-- kind='gap' in sort_bucket 0, pinned above the timeline, carrying a registered
-- explanation. An empty section and a section we cannot populate must never
-- render identically — that equivalence is how "the engine is fine" and "the
-- engine has been dead for six weeks" have repeatedly looked the same here.

create or replace function public.entity_audit_timeline(
  p_entity_type text,
  p_entity_id   uuid,
  p_limit       int default 200
)
returns table (
  row_no               int,
  sort_bucket          smallint,
  occurred_at          timestamptz,
  occurred_at_is_tx    boolean,
  source_seq           bigint,
  kind                 text,
  actor_kind           text,
  actor_label          text,
  field                text,
  before_value         jsonb,
  after_value          jsonb,
  confidence           numeric,
  source               text,
  explanation_key      text,
  explanation_status   text,
  explanation_title    text,
  explanation_body     text,
  explanation_what_now text,
  explanation_severity text,
  source_ref           jsonb,
  raw                  jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
-- Fail with our own diagnosable error at 5s rather than being shot by the
-- PostgREST gateway at 8s with no plan and no message.
set statement_timeout to '5000ms'
as $fn$
-- RETURNS TABLE turns every output column into a plpgsql variable, and this
-- function's outputs are named after the things it selects — `source`, `field`,
-- `kind`, `confidence`, `raw`. Without this directive every one of those is
-- ambiguous against the column of the same name and the function fails at RUN
-- time with 42702, not at CREATE time: `CREATE OR REPLACE FUNCTION` only parses
-- a plpgsql body, it does not plan the queries inside it. So this cannot be
-- caught by the migration applying cleanly, only by calling the function —
-- which is why the verification below executes it rather than inspecting it.
#variable_conflict use_column
declare
  r public.audit_entity_registry;
begin
  if not public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- An unbounded limit is a timeout vector; 500 is where a DELETE revision's
  -- full ~4.6 KB row payload starts to dominate the response rather than the
  -- query.
  p_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  select * into r
    from public.audit_entity_registry
   where entity_key = p_entity_type and active;

  -- LOUD, not empty. An empty timeline for a mistyped type reads as "nothing
  -- ever happened to this record", which is the most misleading answer
  -- available.
  if not found then
    raise exception 'entity type % is not registered for audit (see audit_entity_registry)', p_entity_type
      using errcode = '22023';
  end if;

  return query
  with
  -- 1. REVISIONS. content_revisions_entity_idx (source_table, source_id,
  --    seq DESC) is the designed access path. One event per changed FIELD, not
  --    per revision: an editor reads fields, not commits.
  rev as (
    select 1::smallint                          as bucket,
           cr.created_at                        as occurred_at,
           true                                 as is_tx,
           cr.seq                               as source_seq,
           'revision'::text                     as kind,
           cr.actor_kind,
           coalesce(cr.actor, cr.actor_id::text) as actor_label,
           f.field,
           cr.before -> f.field                 as before_value,
           cr.after  -> f.field                 as after_value,
           null::numeric                        as confidence,
           null::text                           as source,
           null::text                           as ekey,
           4                                    as source_rank,
           jsonb_build_object('table', 'content_revisions', 'pk', cr.id) as source_ref,
           jsonb_build_object('op', cr.op, 'changed_fields', cr.changed_fields) as raw
      from public.content_revisions cr
      cross join lateral unnest(cr.changed_fields) as f(field)
     where cr.source_table = r.table_name
       and cr.source_id    = p_entity_id
     order by cr.seq desc
     limit p_limit
  ),

  -- 2/3. REVIEW. One queue row is up to TWO events: it was proposed, and it
  --      was (or was not yet) decided.
  erq as (
    select q.*
      from public.entity_review_queue q
     where r.review_key is not null
       and q.entity_type = r.review_key
       and q.entity_id   = p_entity_id
     order by q.created_at desc
     limit p_limit
  ),
  erq_proposed as (
    select 1::smallint, q.created_at, true, null::bigint,
           'review_proposal'::text,
           -- Always system: this queue is machine-fed. A null model means the
           -- producer did not record which one, not that a human proposed it.
           'system'::text,
           coalesce(q.model, 'unrecorded model'),
           q.field,
           null::jsonb,
           q.proposed_value,
           q.confidence,
           q.model,
           null::text,
           6,
           jsonb_build_object('table', 'entity_review_queue', 'pk', q.id),
           jsonb_build_object('status', q.status, 'citations', q.citations)
      from erq q
  ),
  erq_decided as (
    select 1::smallint, q.reviewed_at, true, null::bigint,
           'review_decision'::text,
           case when q.reviewer_id is not null then 'human' else 'system' end,
           coalesce(q.reviewer_id::text, 'automated'),
           q.field,
           null::jsonb,
           q.proposed_value,
           q.confidence,
           null::text,
           null::text,
           7,
           jsonb_build_object('table', 'entity_review_queue', 'pk', q.id),
           jsonb_build_object('status', q.status, 'note', q.reviewer_note)
      from erq q
     where q.reviewed_at is not null
  ),

  -- 4. PROVENANCE, the asymmetry. Two implementations, both explicit, chosen
  --    by the registry rather than by probing for a column.
  prov_jsonb as (
    select 2::smallint,
           -- Only take a timestamp if one is genuinely present. There is no
           -- enforced shape here; three different writers use three key sets.
           nullif(coalesce(k.value ->> 'approved_at',
                           k.value ->> 'observed_at',
                           k.value ->> 'at'), '')::timestamptz,
           false, null::bigint,
           'provenance'::text,
           case when k.value ->> 'source' like '%human%' then 'human' else 'system' end,
           k.value ->> 'source',
           k.key,
           null::jsonb,
           coalesce(k.value -> 'value', k.value),
           nullif(k.value ->> 'confidence', '')::numeric,
           k.value ->> 'source',
           null::text,
           3,
           jsonb_build_object('table', r.table_name || '.field_provenance', 'pk', k.key),
           k.value
      from jsonb_each(
             case when r.provenance_mode = 'jsonb_column'
                  then public.field_provenance_of(r.table_name, p_entity_id)
                  else '{}'::jsonb end) as k
     limit p_limit
  ),
  prov_side as (
    select 2::smallint, vfp.observed_at, false, null::bigint,
           'provenance'::text,
           case when vfp.source = 'admin' then 'human' else 'system' end,
           vfp.source, vfp.field,
           null::jsonb, vfp.value, vfp.confidence, vfp.source,
           null::text, 3,
           jsonb_build_object('table', 'venue_field_provenance', 'pk', vfp.id),
           jsonb_build_object('is_winning', vfp.is_winning)
      from public.venue_field_provenance vfp
     where r.provenance_mode = 'side_table'
       and vfp.venue_id = p_entity_id
     order by vfp.observed_at desc
     limit p_limit
  ),

  -- 5. ENRICHMENT STEPS. A bag of per-step keys, each step writing its own
  --    object. Steps that recorded no `at` are current state, bucket 2.
  enr as (
    select case when nullif(k.value ->> 'at', '') is null then 2 else 1 end::smallint,
           nullif(k.value ->> 'at', '')::timestamptz,
           false, null::bigint,
           'enrichment_step'::text,
           'system'::text,
           k.key,
           null::text,
           null::jsonb,
           k.value,
           nullif(k.value ->> 'confidence', '')::numeric,
           k.value ->> 'source',
           null::text,
           2,
           jsonb_build_object('table', r.table_name || '.enrichment_status', 'pk', k.key),
           k.value
      from jsonb_each(
             case when r.enrichment_mode = 'jsonb_column'
                  then public.enrichment_status_of(r.table_name, p_entity_id)
                  else '{}'::jsonb end) as k
     where jsonb_typeof(k.value) = 'object'
     limit p_limit
  ),

  -- 6. QUALITY SIGNALS. Seven tables, seven static branches gated on the
  --    registry, no dynamic SQL. Only one branch can be non-empty for a given
  --    entity, so the single LIMIT bounds the whole CTE.
  sig as (
    select created_at, signal_type, value, weight, source, details, id
      from public.venue_quality_signals
     where r.signals_table = 'venue_quality_signals' and venue_id = p_entity_id
    union all
    select created_at, signal_type, value, weight, source, details, id
      from public.city_quality_signals
     where r.signals_table = 'city_quality_signals' and city_id = p_entity_id
    union all
    select created_at, signal_type, value, weight, source, details, id
      from public.event_quality_signals
     where r.signals_table = 'event_quality_signals' and event_id = p_entity_id
    union all
    select created_at, signal_type, value, weight, source, details, id
      from public.village_quality_signals
     where r.signals_table = 'village_quality_signals' and village_id = p_entity_id
    union all
    select created_at, signal_type, value, weight, source, details, id
      from public.news_quality_signals
     where r.signals_table = 'news_quality_signals' and article_id = p_entity_id
    union all
    select created_at, signal_type, value, weight, source, details, id
      from public.personality_quality_signals
     where r.signals_table = 'personality_quality_signals' and personality_id = p_entity_id
    union all
    select created_at, signal_type, value, weight, source, details, id
      from public.milestone_quality_signals
     where r.signals_table = 'milestone_quality_signals' and milestone_id = p_entity_id
    order by created_at desc
    limit p_limit
  ),
  sig_ev as (
    select 1::smallint, s.created_at, true, null::bigint,
           'quality_signal'::text,
           case when s.source like 'admin%' then 'human' else 'system' end,
           s.source, s.signal_type,
           null::jsonb,
           jsonb_build_object('value', s.value, 'weight', s.weight),
           s.value::numeric, s.source,
           'signal:' || s.signal_type,
           5,
           jsonb_build_object('table', r.signals_table, 'pk', s.id),
           s.details
      from sig s
  ),

  -- 7. MERGES, both directions. "Merged away" and "absorbed a duplicate" are
  --    different facts and must not collapse into one. `details.schema` is the
  --    flag, not a non-empty `moved` — "predates the fix" has to stay
  --    distinguishable from "moved nothing".
  mrg as (
    select m.id, m.created_at, m.keep_id, m.drop_id, m.actor, m.details, m.undone_at,
           'entity_merge_audit'::text as tbl
      from public.entity_merge_audit m
     where r.merge_table = 'entity_merge_audit'
       and m.entity_type = r.merge_key
       and (m.keep_id = p_entity_id or m.drop_id = p_entity_id)
    union all
    select m.id, m.created_at, m.keep_id, m.drop_id, m.actor, m.details, m.undone_at, 'venue_merge_audit'
      from public.venue_merge_audit m
     where r.merge_table = 'venue_merge_audit'
       and (m.keep_id = p_entity_id or m.drop_id = p_entity_id)
    union all
    select m.id, m.created_at, m.keep_id, m.drop_id, m.actor, m.details, m.undone_at, 'city_merge_audit'
      from public.city_merge_audit m
     where r.merge_table = 'city_merge_audit'
       and (m.keep_id = p_entity_id or m.drop_id = p_entity_id)
    order by created_at desc
    limit p_limit
  ),
  mrg_ev as (
    select 1::smallint, m.created_at, true, null::bigint,
           'merge'::text,
           case when m.actor is not null then 'human' else 'system' end,
           coalesce(m.actor::text, 'automated sweep'),
           null::text,
           null::jsonb,
           jsonb_build_object('keep_id', m.keep_id, 'drop_id', m.drop_id,
                              'undone_at', m.undone_at),
           null::numeric, null::text,
           -- A merge that predates reparenting records cannot be undone, and
           -- that is a different thing to tell an editor than "merged".
           case when coalesce(m.details ->> 'schema', '') = '' then 'merge:unrecorded_pre_details'
                when m.drop_id = p_entity_id then 'merge:merged_away'
                else 'merge:absorbed' end,
           8,
           jsonb_build_object('table', m.tbl, 'pk', m.id),
           m.details
      from mrg m
  ),

  -- 8. INGEST. Two hops: staging rows that committed to this entity, then the
  --    stage log for those rows. The staging lookup is the one that needed an
  --    index — measured 79,153 blocks before, 3 after.
  stg as (
    select s.id, s.created_at, s.source_type, s.ai_validation_status,
           s.review_status, s.disposition, s.dedup_match_score
      from public.ingestion_staging s
     where s.target_record_id = p_entity_id
       and s.target_table = r.table_name
     order by s.created_at desc
     limit p_limit
  ),
  ievt as (
    select ie.id, ie.created_at, ie.stage, ie.actor, ie.new_status, ie.payload
      from public.ingestion_events ie
      join stg on stg.id = ie.staging_id
     order by ie.id desc
     limit p_limit
  ),
  -- One event per CODE, not per stage row: the codes are what an editor reads.
  -- A stage row carrying neither errors nor warnings still emits one event, or
  -- the successful steps vanish and the timeline reads as nothing but problems.
  ievt_codes as (
    select ie.created_at, ie.id, ie.stage, ie.actor, ie.new_status, ie.payload, c.code
      from ievt ie
      cross join lateral (
        select jsonb_array_elements_text(coalesce(ie.payload -> 'errors', '[]'::jsonb)) as code
        union all
        select jsonb_array_elements_text(coalesce(ie.payload -> 'warnings', '[]'::jsonb))
        union all
        select null::text
         where coalesce(jsonb_array_length(ie.payload -> 'errors'), 0)
             + coalesce(jsonb_array_length(ie.payload -> 'warnings'), 0) = 0
      ) c
  ),
  stg_ev as (
    select 1::smallint, x.created_at, true, x.id::bigint,
           'staging_stage'::text,
           -- ingestion_events.actor defaults to 'system' and is occasionally a
           -- real admin; trust the column rather than assuming the pipeline.
           case when x.actor = 'system' or x.actor is null then 'system' else 'human' end,
           x.actor,
           null::text,
           null::jsonb,
           jsonb_build_object('status', x.new_status, 'code', x.code),
           null::numeric, x.stage,
           case when x.code is not null then 'pipeline-validate:' || x.code end,
           1,
           jsonb_build_object('table', 'ingestion_events', 'pk', x.id),
           x.payload
      from ievt_codes x
  ),

  -- 9. CONSENSUS. Venues and cities only, and even there the ledger records
  --    disagreements — so "no consensus events" is the normal case.
  cons as (
    select 1::smallint, a.created_at, true, null::bigint,
           'consensus'::text, 'system'::text, a.winning_source, a.field,
           null::jsonb, a.winning_value, a.confidence, a.winning_source,
           'consensus:' || a.action, 2,
           jsonb_build_object('table', 'venue_consensus_audit', 'pk', a.id),
           jsonb_build_object('agreeing', a.agreeing_sources, 'conflicting', a.conflicting_sources)
      from public.venue_consensus_audit a
     where r.consensus_table = 'venue_consensus_audit' and a.venue_id = p_entity_id
    union all
    select 1::smallint, a.created_at, true, null::bigint,
           'consensus'::text, 'system'::text, a.winning_source, a.field,
           null::jsonb, a.winning_value, a.confidence, a.winning_source,
           'consensus:' || a.action, 2,
           jsonb_build_object('table', 'city_consensus_audit', 'pk', a.id),
           jsonb_build_object('agreeing', a.agreeing_sources, 'conflicting', a.conflicting_sources)
      from public.city_consensus_audit a
     where r.consensus_table = 'city_consensus_audit' and a.city_id = p_entity_id
     limit p_limit
  ),

  -- 10. GAPS. What this function cannot show, stated rather than omitted.
  --     Driven off the registry so a new entity type cannot forget them.
  gaps as (
    select 0::smallint, null::timestamptz, false, null::bigint,
           'gap'::text, 'system'::text, null::text, null::text,
           null::jsonb, null::jsonb, null::numeric, null::text,
           g.key, 0,
           jsonb_build_object('table', 'audit_entity_registry', 'pk', r.entity_key),
           jsonb_build_object('entity_type', p_entity_type)
      from (
        -- Always true, for every type and every record.
        select 'audit:llm_calls_unlinked' as key
        union all select 'audit:revisions_begin_at_enablement'
        union all select 'audit:automation_unlinked'
        union all select 'audit:no_node_timing'
        -- Conditional on this type's declared shape.
        union all select 'audit:no_provenance_surface' where r.provenance_mode = 'none'
        union all select 'audit:provenance_undated'    where r.provenance_mode = 'jsonb_column'
        union all select 'audit:no_consensus_table'    where r.consensus_table is null
        union all select 'audit:ingestion_events_no_entity_link'
                   where r.table_name not in ('venues', 'cities', 'countries')
      ) g
  ),

  all_ev as (
    select * from rev
    union all select * from erq_proposed
    union all select * from erq_decided
    union all select * from prov_jsonb
    union all select * from prov_side
    union all select * from enr
    union all select * from sig_ev
    union all select * from mrg_ev
    union all select * from stg_ev
    union all select * from cons
    union all select * from gaps
  )
  select
    row_number() over (
      order by a.bucket,
               a.occurred_at desc nulls last,
               a.source_rank,
               a.source_seq desc nulls last,
               a.source_ref ->> 'pk'
    )::int,
    a.bucket,
    a.occurred_at,
    a.is_tx,
    a.source_seq,
    a.kind,
    a.actor_kind,
    a.actor_label,
    a.field,
    a.before_value,
    a.after_value,
    a.confidence,
    a.source,
    a.ekey,
    -- THREE-VALUED, and that is the whole contract. Two-valued conflates "this
    -- kind explains itself" with "we have a key and nobody has written prose
    -- for it" — and the second must be visible.
    case when a.ekey is null then 'not_applicable'
         when pe.key is null then 'unregistered'
         else 'registered' end,
    pe.title,      -- NULL when unregistered. The function NEVER derives prose
    pe.body,       -- from the key; a prettified key is the defect this
    pe.what_now,   -- whole system exists to remove.
    pe.severity,
    a.source_ref,
    a.raw
  from all_ev a
  left join public.pipeline_explanations pe
         on pe.key = a.ekey and pe.active
  order by a.bucket,
           a.occurred_at desc nulls last,
           a.source_rank,
           a.source_seq desc nulls last,
           a.source_ref ->> 'pk'
  -- Gaps must never be truncated away by p_limit: the statement that a source
  -- is unreadable is the most important row in the response.
  limit p_limit + 8;
end $fn$;

comment on function public.entity_audit_timeline(text, uuid, int) is
  'Normalized audit timeline for one entity. sort_bucket: 0 coverage gap, 1 dated event, 2 undated current state. source_seq is a real sequence only for content_revisions and ingestion_events; there is deliberately NO global sequence, because now() is transaction time and a synthesized one would be a fabricated causal claim. The internal source_rank tiebreak (staging 1, consensus/enrichment 2, provenance 3, revision 4, signal 5, proposal 6, decision 7, merge 8) is PRESENTATION ORDER within a single transaction timestamp, not evidence of causation.';

revoke all on function public.entity_audit_timeline(text, uuid, int) from public, anon;
grant execute on function public.entity_audit_timeline(text, uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src     text;
  v_secdef  boolean;
  v_anon    boolean;
begin
  select p.prosrc, p.prosecdef,
         has_function_privilege('anon', p.oid, 'EXECUTE')
    into v_src, v_secdef, v_anon
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'entity_audit_timeline';

  if v_src is null then
    raise exception 'entity_audit_timeline was not created';
  end if;

  if v_anon then
    raise exception 'entity_audit_timeline is executable by anon';
  end if;

  -- THE GATE scripts/check-anon-function-grants.mjs CANNOT SEE. That script is
  -- scoped to VOLATILE + DEFINER functions, which is correct for what it
  -- guards and exactly why it is structurally blind to a STABLE definer — this
  -- one. A future CREATE OR REPLACE that drops the role check would ship
  -- silently. Four lines, and it is the regression that already happened here.
  if v_secdef and v_src not like '%has_any_role_jwt%' then
    raise exception 'entity_audit_timeline is SECURITY DEFINER with no role gate in its body';
  end if;

  -- The three-valued explanation status is the contract the renderer depends
  -- on; collapsing it to two is the silent-fallback failure one layer up.
  if v_src not like '%not_applicable%' or v_src not like '%unregistered%' then
    raise exception 'entity_audit_timeline no longer emits a three-valued explanation_status';
  end if;

  -- Gap rows are the honest half. If the gap CTE is gone, an unreadable source
  -- and an empty one render identically again.
  if v_src not like '%audit:llm_calls_unlinked%' then
    raise exception 'entity_audit_timeline no longer emits coverage-gap rows';
  end if;

  raise notice 'entity_audit_timeline: created, definer-gated, anon-revoked';
end $verify$;
