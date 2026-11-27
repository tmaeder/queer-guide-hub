-- A published milestone must always survive a merge with a non-published one.
--
-- Two producers could keep a draft over a published row, and a published URL then 301s
-- to a draft that 404s (the World AIDS Day case, repaired in 99991795353249):
--
--   1. run_dedup_truth_sweep's milestone arm fed the shared canonical pick with
--      q = null and f = false, so every milestone pair fell through to "oldest wins".
--      The German curated drafts were created hours before the English import, so the
--      draft won. q now carries status: published = 1, anything else = 0, which the
--      pick ("quality desc -> featured -> oldest") ranks first.
--   2. _milestone_merge_core accepted any keep the caller passed (sweep, approve_dedup_review
--      with a reviewer-chosen keep, merge_entities). It now refuses to keep a non-published
--      row when the drop is published, so no caller can produce the defect.
--
-- Both are patched from pg_get_functiondef with an exactly-once anchor rather than restated
-- (the sweep body is ~40 KB and other sessions patch it the same way).

do $patch$
declare
  v_src  text;
  v_from text;
  v_to   text;
  v_n    int;
begin
  -- 1. sweep milestone arm
  v_src  := pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure);
  v_from := $a$null::numeric q, false::boolean f, created_at::timestamptz c
      from public.milestones$a$;
  v_to   := $a$(status = 'published')::int::numeric q, false::boolean f, created_at::timestamptz c
      from public.milestones$a$;
  if position(v_to in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from);
    if v_n <> 1 then
      raise exception 'sweep milestone arm anchor found % times, expected 1', v_n;
    end if;
    execute replace(v_src, v_from, v_to);
  end if;

  -- 2. merge core guard
  v_src  := pg_get_functiondef('public._milestone_merge_core(uuid,uuid,uuid)'::regprocedure);
  v_from := $a$if v_drop_dup is not null then raise exception 'drop milestone already merged'; end if;$a$;
  v_to   := v_from || $a$
  if exists (select 1 from public.milestones k, public.milestones d
             where k.id = p_keep_id and d.id = p_drop_id
               and d.status = 'published' and k.status is distinct from 'published') then
    raise exception 'keep milestone % is not published but drop % is: the published row must survive', p_keep_id, p_drop_id;
  end if;$a$;
  if position('the published row must survive' in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from);
    if v_n <> 1 then
      raise exception 'merge core anchor found % times, expected 1', v_n;
    end if;
    execute replace(v_src, v_from, v_to);
  end if;
end $patch$;

do $verify$
begin
  if position($a$(status = 'published')::int::numeric q$a$ in
       regexp_replace(pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'P1 failed: sweep milestone arm does not rank published first';
  end if;
  if position('the published row must survive' in
       regexp_replace(pg_get_functiondef('public._milestone_merge_core(uuid,uuid,uuid)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'P2 failed: merge core does not refuse a non-published keeper';
  end if;
end $verify$;
