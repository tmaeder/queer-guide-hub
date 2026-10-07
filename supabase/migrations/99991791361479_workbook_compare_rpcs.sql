-- Interactive workbooks on glossary terms — layer 3, the TWO-PARTY REVEAL.
--
-- A negotiation workbook is worthless alone. The point is that two people each
-- answer privately and then compare — which is a consent problem, not a feature
-- problem, and this schema already solved it once for the kink checklist. This
-- migration reuses that solution rather than approximating it.
--
-- WHAT IS REUSED AND WHY IT IS A NEW `kind`, NOT A REUSE OF 'compare'
--
-- `kink_grants` already carries everything a reveal handshake needs: the unique
-- key (grantor_id, grantee_id, kind), soft revocation via revoked_at, a
-- grantee-receipt select policy so the other party can see what they were
-- given, realtime publication so a revoke reaches an open tab, and a single
-- grant/revoke RPC with a boolean so the client has one call site.
--
-- So this adds `'workbook'` to the kind vocabulary. It deliberately does NOT
-- reuse `'compare'`: granting someone your workbook answers must not silently
-- grant them a compare pass over your whole kink list. Two different reveals,
-- two differently-named grants, each revocable on its own.
--
-- THE FIVE PROPERTIES COPIED FROM kink_compare, NONE OF THEM OPTIONAL
--
--   1. Consent is TWO ROWS, derived on every call, never stored. There is no
--      state machine and no cached flag, which is exactly why a revoke is
--      effective immediately — the next call re-evaluates `revoked_at is null`
--      in both directions and the answer changes.
--   2. Both sides must be is_intimate_eligible and neither may have blocked the
--      other, checked before anything else. One moderation flag on either
--      profile collapses eligibility and therefore every reveal path at once.
--   3. No consent returns an EMPTY SET (`return;`), never an exception. The
--      client must not be able to distinguish "they have not reciprocated" from
--      "we have no shared answers" — an error code there would leak the other
--      party's decision.
--   4. Only rows where BOTH sides set `shared = true`. The per-answer flag and
--      the grant are independent opt-ins; neither alone reveals anything.
--   5. kind='menu' steps DELEGATE. A menu step's content is kink ratings, so
--      revealing it IS a kink-list compare and is gated by the 'compare' grant,
--      not this one. Such a step comes back with null bodies and its
--      kink_category_slug set, and the client renders the existing
--      kink_compare surface for it — with its own, separately-granted gate.
--      Folding menu overlap into this function on the strength of a 'workbook'
--      grant would be the silent widening the separate kind exists to prevent.

-- ---------------------------------------------------------------------------
-- 1. Extend the grant vocabulary. Both the CHECK and the RPC guard — the CHECK
-- alone leaves kink_grant_set raising 22023 on a kind the table now accepts,
-- which reads as the feature being broken rather than ungranted.
-- ---------------------------------------------------------------------------

alter table public.kink_grants
  drop constraint if exists kink_grants_kind_check;

alter table public.kink_grants
  add constraint kink_grants_kind_check
  check (kind in ('view','compare','workbook'));

-- Patched, not restated: kink_grant_set is the only writer of kink_grants and
-- re-typing its body to change one list is a transcription risk on a function
-- that gates every cross-user reveal in the product. One substitution, asserted
-- below.
do $patch$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'kink_grant_set'
    and pg_get_function_identity_arguments(p.oid) = 'p_other uuid, p_kind text, p_active boolean, p_conversation_id uuid';

  if v_src is null then
    raise exception 'kink_grant_set(uuid,text,boolean,uuid) not found — cannot patch the kind guard';
  end if;

  if position('''workbook''' in v_src) > 0 then
    raise notice 'kink_grant_set already accepts workbook — nothing to patch';
    return;
  end if;

  if position('p_kind not in (''view'',''compare'')' in v_src) = 0 then
    raise exception 'kink_grant_set guard not in the expected shape — refusing to patch blind';
  end if;

  v_new := replace(
    v_src,
    'p_kind not in (''view'',''compare'')',
    'p_kind not in (''view'',''compare'',''workbook'')'
  );

  execute v_new;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 2. The handshake. Four derived states, same shape as kink_compare_status.
-- ---------------------------------------------------------------------------

create or replace function public.workbook_compare_status(p_other uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_mine boolean;
  v_theirs boolean;
begin
  if v_uid is null or p_other is null or p_other = v_uid then
    return 'none';
  end if;
  if public.intimate_is_blocked(v_uid, p_other)
     or not public.is_intimate_eligible(v_uid)
     or not public.is_intimate_eligible(p_other) then
    return 'none';
  end if;

  select
    exists (select 1 from public.kink_grants
            where grantor_id = v_uid and grantee_id = p_other
              and kind = 'workbook' and revoked_at is null),
    exists (select 1 from public.kink_grants
            where grantor_id = p_other and grantee_id = v_uid
              and kind = 'workbook' and revoked_at is null)
  into v_mine, v_theirs;

  if v_mine and v_theirs then return 'active'; end if;
  if v_mine then return 'requested_by_me'; end if;
  if v_theirs then return 'requested_by_other'; end if;
  return 'none';
end;
$$;

revoke all on function public.workbook_compare_status(uuid) from public, anon;
grant execute on function public.workbook_compare_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The reveal.
--
-- Returns one row per step that BOTH sides have shared, plus every menu step
-- (with null bodies) so the client knows to delegate. Steps neither side
-- shared, or only one side shared, are absent — and absent is also what a
-- missing handshake looks like, deliberately.
-- ---------------------------------------------------------------------------

create or replace function public.workbook_compare(p_workbook_id uuid, p_other uuid)
returns table(
  step_key           text,
  step_kind          text,
  step_position      int,
  heading            text,
  prompt_md          text,
  kink_category_slug text,
  my_body            text,
  their_body         text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.workbook_compare_status(p_other) <> 'active' then
    return;
  end if;

  -- A workbook that is not published reveals nothing, even between two
  -- consenting parties — same gate the read RPCs use, restated here because a
  -- definer bypasses the RLS that would otherwise apply it.
  if not exists (
    select 1
    from public.tag_workbooks w
    join public.unified_tags t on t.id = w.tag_id
    where w.id = p_workbook_id and w.is_public and t.status = 'active'
  ) then
    return;
  end if;

  return query
  with
  steps as (
    select s.id, s.key, s.kind, s.position, s.heading, s.prompt_md, s.kink_category_slug
    from public.tag_workbook_steps s
    where s.workbook_id = p_workbook_id
      and s.kind <> 'prose'
  ),
  mine as (
    select a.step_id, a.body
    from public.tag_workbook_answers a
    where a.user_id = v_uid and a.shared
  ),
  theirs as (
    select a.step_id, a.body
    from public.tag_workbook_answers a
    where a.user_id = p_other and a.shared
  )
  select
    st.key,
    st.kind,
    st.position,
    st.heading,
    st.prompt_md,
    st.kink_category_slug,
    m.body,
    t.body
  from steps st
  left join mine   m on m.step_id = st.id
  left join theirs t on t.step_id = st.id
  where
    -- A menu step always appears: it carries no body of its own and the client
    -- delegates it to the kink compare surface.
    st.kind = 'menu'
    -- Everything else appears only when both halves are present and shared.
    or (m.body is not null and t.body is not null)
  order by st.position, st.key;
end;
$$;

revoke all on function public.workbook_compare(uuid, uuid) from public, anon;
grant execute on function public.workbook_compare(uuid, uuid) to authenticated;

comment on function public.workbook_compare(uuid, uuid) is
  'Two-party workbook reveal. Empty set on no consent (never an exception, so the client cannot tell refusal from no overlap). Only steps both sides flagged shared. Menu steps return null bodies and a kink_category_slug — their overlap is a kink-list compare, gated separately by a kind=''compare'' grant.';

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
  v_def text;
begin
  -- P1: the grant vocabulary accepts workbook, and the table says so.
  select count(*) into v_bad
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'kink_grants'
    and c.conname = 'kink_grants_kind_check'
    and pg_get_constraintdef(c.oid) like '%workbook%';
  if v_bad <> 1 then
    raise exception 'P1 failed: kink_grants_kind_check does not accept workbook';
  end if;

  -- P2: the RPC guard agrees with the CHECK. If these disagree the table
  -- accepts a kind no caller can ever write.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'kink_grant_set'
    and pg_get_function_identity_arguments(p.oid) = 'p_other uuid, p_kind text, p_active boolean, p_conversation_id uuid';
  if v_def is null or position('''workbook''' in v_def) = 0 then
    raise exception 'P2 failed: kink_grant_set does not accept kind=workbook';
  end if;

  -- P3: and the patch changed ONLY the guard — the insert/update halves must be
  -- byte-intact, or a one-line substitution silently rewrote the writer.
  if position('on conflict (grantor_id, grantee_id, kind) do update set' in v_def) = 0
     or position('set revoked_at = now(), updated_at = now()' in v_def) = 0
     or position('intimate_is_blocked' in v_def) = 0 then
    raise exception 'P3 failed: kink_grant_set lost its upsert, its revoke or its block check during the patch';
  end if;

  -- P4: both reveal RPCs exist, are definers, and are NOT reachable by anon.
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('workbook_compare_status','workbook_compare')
    and p.prosecdef
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_bad <> 2 then
    raise exception 'P4 failed: expected 2 authenticated-only definer reveal RPCs, found %', v_bad;
  end if;

  -- P5: the no-consent path RETURNS rather than raising. Called with no JWT,
  -- workbook_compare_status is 'none', so workbook_compare must yield 0 rows
  -- and not an exception — the property that keeps a refusal indistinguishable
  -- from an empty overlap.
  if public.workbook_compare_status('00000000-0000-0000-0000-000000000000'::uuid) <> 'none' then
    raise exception 'P5 failed: status must be none for an unauthenticated caller';
  end if;
  select count(*) into v_bad
  from public.workbook_compare(
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid);
  if v_bad <> 0 then
    raise exception 'P5b failed: workbook_compare returned % rows with no consent', v_bad;
  end if;

  -- P6: the reveal reads `shared`. Without it the function would return every
  -- answer the moment a handshake completed, which is the defect the per-answer
  -- flag exists to prevent — and no row-count test can see that on empty data.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'workbook_compare';
  if position('a.shared' in v_def) = 0 then
    raise exception 'P6 failed: workbook_compare does not filter on shared';
  end if;
  if position('is_intimate_eligible' in pg_get_functiondef(
       (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='workbook_compare_status'))) = 0 then
    raise exception 'P6b failed: workbook_compare_status does not check eligibility';
  end if;

  raise notice 'workbook_compare_rpcs: P1-P6 pass';
end
$verify$;
