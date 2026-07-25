-- Dedup Truth Engine — P1: review queue + decision RPCs (2026-07-25)
--
-- Duplicate clusters become first-class Truth-Engine work: the nightly sweep
-- (P2, 20260725201000) queues confidence-scored merge suggestions here, and
-- admins decide them through the same EntityReviewQueue shell the other five
-- gates use. Approval executes the existing reversible merge cores
-- (merge_venues / merge_cities / merge_entities → entity_merge_audit), so every
-- decision stays undoable via unmerge_*. Rejected pairs are remembered and
-- never re-suggested.

-- ── 1. Queue table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dedup_review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN
    ('venue','city','event','marketplace','personality','organization',
     'milestone','hotel','news','queer_village','country','group')),
  -- polymorphic — no FK; members are validated by the merge cores on approve
  keep_id        uuid NOT NULL,
  drop_id        uuid NOT NULL CHECK (drop_id <> keep_id),
  cluster        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {keep:{title,slug,city,quality_score}, drop:{...}, distance_m, match_type}
  confidence     numeric(3,2) NOT NULL DEFAULT 0.50,
  reason         text NOT NULL DEFAULT 'sweep',       -- e.g. despace_no_geo, core_token_no_geo, despace_namesake, fuzzy
  source         text NOT NULL DEFAULT 'sweep',
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','superseded')),
  merge_audit_id uuid REFERENCES public.entity_merge_audit(id) ON DELETE SET NULL,
  reviewer_id    uuid,
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

-- One open suggestion per unordered pair — makes sweep re-runs idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS dedup_review_queue_open_pair
  ON public.dedup_review_queue (entity_type, least(keep_id, drop_id), greatest(keep_id, drop_id))
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS dedup_review_queue_open_idx
  ON public.dedup_review_queue (entity_type, created_at) WHERE status = 'open';
-- Rejection memory lookups by pair (any status).
CREATE INDEX IF NOT EXISTS dedup_review_queue_pair_idx
  ON public.dedup_review_queue (entity_type, least(keep_id, drop_id), greatest(keep_id, drop_id));

ALTER TABLE public.dedup_review_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dedup_review_queue' AND policyname='drq_read') THEN
    CREATE POLICY "drq_read" ON public.dedup_review_queue
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
END $$;
REVOKE ALL ON public.dedup_review_queue FROM anon, authenticated;
GRANT SELECT ON public.dedup_review_queue TO authenticated;

-- ── 2. Village ledger learns 'corroboration' (the only ledger missing it) ────

ALTER TABLE public.village_quality_signals
  DROP CONSTRAINT IF EXISTS village_quality_signals_signal_type_check;
ALTER TABLE public.village_quality_signals
  ADD CONSTRAINT village_quality_signals_signal_type_check CHECK (signal_type IN
    ('completeness','linkage','freshness','relevance','admin_feedback','enrichment','corroboration'));

-- ── 3. Corroboration-signal writer (shared by approve RPC + P2 sweep) ────────
-- A confirmed merge means two independent records described one entity — that
-- is corroboration for the kept row. Only ledger-backed types write; others no-op.

CREATE OR REPLACE FUNCTION public._dedup_write_corroboration_signal(
  p_type text, p_keep_id uuid, p_drop_id uuid, p_audit_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_details jsonb := jsonb_build_object('drop_id', p_drop_id, 'audit_id', p_audit_id, 'reason', p_reason);
begin
  if p_type = 'event' then
    insert into public.event_quality_signals (event_id, signal_type, value, weight, source, details)
    values (p_keep_id, 'corroboration', 0.8, 0.5, 'dedup_merge', v_details);
  elsif p_type = 'city' then
    insert into public.city_quality_signals (city_id, signal_type, value, weight, source, details)
    values (p_keep_id, 'corroboration', 0.8, 0.5, 'dedup_merge', v_details);
  elsif p_type = 'venue' then
    insert into public.venue_quality_signals (venue_id, signal_type, value, weight, source, details)
    values (p_keep_id, 'corroboration', 0.8, 0.5, 'dedup_merge', v_details);
  elsif p_type = 'personality' then
    insert into public.personality_quality_signals (personality_id, signal_type, value, weight, source, details)
    values (p_keep_id, 'corroboration', 0.8, 0.5, 'dedup_merge', v_details);
  elsif p_type = 'news' then
    insert into public.news_quality_signals (article_id, signal_type, value, weight, source, details)
    values (p_keep_id, 'corroboration', 0.8, 0.5, 'dedup_merge', v_details);
  elsif p_type = 'queer_village' then
    insert into public.village_quality_signals (village_id, signal_type, value, weight, source, details)
    values (p_keep_id, 'corroboration', 0.8, 0.5, 'dedup_merge', v_details);
  end if;
exception when others then
  -- signals are best-effort telemetry; never fail a merge over them
  null;
end; $function$;
REVOKE ALL ON FUNCTION public._dedup_write_corroboration_signal(text,uuid,uuid,uuid,text) FROM PUBLIC;

-- ── 4. needs_attention helpers (only 7 tables carry the column) ──────────────

CREATE OR REPLACE FUNCTION public._dedup_set_needs_attention(p_type text, p_id uuid, p_value boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_tbl text;
begin
  v_tbl := case p_type when 'venue' then 'venues' when 'event' then 'events'
                       when 'city' then 'cities' when 'personality' then 'personalities'
                       when 'news' then 'news_articles' when 'queer_village' then 'queer_villages'
                       when 'organization' then 'organizations'
                       else null end;
  if v_tbl is null then return; end if;
  execute format('update public.%I set needs_attention = $1 where id = $2 and needs_attention is distinct from $1', v_tbl)
    using p_value, p_id;
end; $function$;
REVOKE ALL ON FUNCTION public._dedup_set_needs_attention(text,uuid,boolean) FROM PUBLIC;

-- ── 5. Decision RPCs ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_dedup_review(p_id uuid, p_keep_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  q record; v_keep uuid; v_drop uuid; v_result jsonb; v_audit uuid;
begin
  perform public.assert_admin_or_internal();

  select * into q from public.dedup_review_queue where id = p_id and status = 'open' for update;
  if not found then raise exception 'dedup review % not found or not open', p_id; end if;

  v_keep := q.keep_id; v_drop := q.drop_id;
  if p_keep_id is not null then
    if p_keep_id = q.drop_id then v_keep := q.drop_id; v_drop := q.keep_id;
    elsif p_keep_id <> q.keep_id then raise exception 'p_keep_id must be one of the pair';
    end if;
  end if;

  if q.entity_type = 'venue' then v_result := public.merge_venues(v_keep, v_drop);
  elsif q.entity_type = 'city' then v_result := public.merge_cities(v_keep, v_drop);
  else v_result := public.merge_entities(q.entity_type, v_keep, v_drop);
  end if;
  v_audit := (v_result->>'audit_id')::uuid;

  update public.dedup_review_queue
     set status = 'approved', merge_audit_id = v_audit, keep_id = v_keep, drop_id = v_drop,
         reviewer_id = auth.uid(), reviewed_at = now()
   where id = p_id;

  -- The dropped row can no longer be part of any other open suggestion.
  update public.dedup_review_queue
     set status = 'superseded', reviewed_at = now()
   where status = 'open' and entity_type = q.entity_type
     and (keep_id = v_drop or drop_id = v_drop);

  perform public._dedup_set_needs_attention(q.entity_type, v_keep, false);
  perform public._dedup_write_corroboration_signal(q.entity_type, v_keep, v_drop, v_audit, q.reason);

  return jsonb_build_object('approved', true, 'audit_id', v_audit,
                            'entity_type', q.entity_type, 'keep_id', v_keep, 'drop_id', v_drop);
end; $function$;

CREATE OR REPLACE FUNCTION public.reject_dedup_review(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare q record;
begin
  perform public.assert_admin_or_internal();
  select * into q from public.dedup_review_queue where id = p_id and status = 'open' for update;
  if not found then raise exception 'dedup review % not found or not open', p_id; end if;

  update public.dedup_review_queue
     set status = 'rejected', reviewer_id = auth.uid(), reviewer_note = p_note, reviewed_at = now()
   where id = p_id;

  perform public._dedup_set_needs_attention(q.entity_type, q.keep_id, false);
  perform public._dedup_set_needs_attention(q.entity_type, q.drop_id, false);

  return jsonb_build_object('rejected', true, 'id', p_id);
end; $function$;

-- Bulk-approve provably-safe rows: high confidence, never personalities
-- (namesake risk keeps person merges individually confirmed).
CREATE OR REPLACE FUNCTION public.approve_dedup_review_batch(
  p_min_confidence numeric DEFAULT 0.95, p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare r record; v_approved int := 0; v_skipped int := 0;
begin
  perform public.assert_admin_or_internal();
  for r in
    select id from public.dedup_review_queue
    where status = 'open' and confidence >= p_min_confidence
      and entity_type <> 'personality'
    order by confidence desc, created_at
    limit greatest(p_limit, 0)
  loop
    begin
      perform public.approve_dedup_review(r.id);
      v_approved := v_approved + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return jsonb_build_object('approved', v_approved, 'skipped', v_skipped);
end; $function$;

REVOKE ALL ON FUNCTION public.approve_dedup_review(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_dedup_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_dedup_review_batch(numeric, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_dedup_review(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_dedup_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_dedup_review_batch(numeric, int) TO authenticated, service_role;
