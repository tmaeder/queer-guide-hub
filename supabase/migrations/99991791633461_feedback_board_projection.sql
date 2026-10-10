-- Public feedback board: a projecting view, and anon loses every privilege it
-- cannot use.
--
-- ============================================================================
-- THIS FILE DOES NOT CLOSE A LEAK. IT OPENS THE BOARD. Measured on prod before
-- writing it, because the premise it was opened on was wrong in both directions
-- and the next reader will otherwise re-derive it:
--
--   public.community_submissions ACL was `anon=awd/postgres` — INSERT, UPDATE,
--   DELETE, and NO `r`. So `community_submissions_anon_read_feedback`
--   (SELECT to anon USING content_type='feedback', unqualified, present since
--   the baseline) had NO PRIVILEGE BEHIND IT and was INERT for the whole life of
--   the table: every anon read returned `42501 permission denied for table
--   community_submissions`, for `data`, for `ip_address`, for `submitted_by`,
--   for every column. Verified by executing as the role, not inferred.
--   baseline.sql:33100 grants anon
--   INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE — SELECT
--   conspicuously omitted, in the shape of a deliberate everything-but-SELECT
--   grant — and there is no REVOKE on this table in any of the 1,611 migrations.
--   So anon has never read a byte of it.
--
--   Nor was there anything to leak in the fields that were named. Across all 156
--   content_type='feedback' rows: `data->>'contact_email'` non-null on ZERO, and
--   the `ip_address` and `user_agent` COLUMNS non-null on ZERO. The
--   `contact_email (155)` in submissionRegistry.ts counts KEY PRESENCE — the key
--   is there on 155 rows and holds JSON `null` on all 155, because
--   FeedbackButton.tsx writes `form.email.trim() || null` unconditionally.
--
-- What the three reader identities actually saw: anon 42501; authenticated
-- non-admin 1 of 156 (own rows, per `Community submissions read`); admin 156.
-- The board has been empty for anonymous visitors since it shipped.
--
-- ============================================================================
-- THE REDACTION IS AN ALLOWLIST, AND THAT IS THE LOAD-BEARING DECISION.
-- A denylist dropping `contact_email` and `context` — the obvious shape, and the
-- one this change was requested as — publishes three keys nobody had
-- enumerated. Measured key inventory of `data` over the 156 feedback rows,
-- second column = rows where THAT key holds an email-shaped string:
--
--     category        156    0
--     description     156    0
--     title           156    0
--     contact_email   155    0     (JSON null on all 155)
--     context         154    4     (all 4 inside context.network_failures)
--     screenshot_url  154    0
--     handoffs          5    5     <-- EVERY row. Internal admin handoff trail.
--     replies           1    0     <-- internal
--     _last_source      1    0
--     review_notes      1    0     <-- internal
--
-- `handoffs` / `replies` / `review_notes` are staff correspondence written by the
-- admin surface (useFeedbackHandoff.ts, FeedbackDetailDrawer.tsx), and all five
-- `handoffs` rows carry an email address. `data - 'contact_email' - 'context'`
-- publishes all of them; `jsonb_build_object` over three named keys cannot
-- publish a key added next month. Same rule as the profiles scrub: KEEP-list,
-- never a deny-list.
--
-- ============================================================================
-- THE VIEW IS DELIBERATELY NOT `security_invoker`, AND THAT IS NOT THE REPO
-- CONVENTION. The five views over `profiles` are `security_invoker = true` plus
-- column grants. That mechanism cannot be used here for two independent reasons:
-- anon has no SELECT on community_submissions at all, so an invoker view returns
-- 42501 and publishes nothing; and the fields to redact live INSIDE a single
-- `data` jsonb column, which a column grant cannot split.
--
-- So this view runs as its owner (postgres, rolbypassrls = true, verified) and
-- bypasses RLS — which makes ITS OWN WHERE THE ONLY GUARD. content_type, is_spam
-- and duplicate_of are therefore re-asserted here and must stay. Same reason
-- fetchRows' service-role reads have to repeat `is_public=eq.true`: nothing
-- upstream is filtering on your behalf. A later `CREATE OR REPLACE VIEW` that
-- silently resets reloptions to security_invoker fails closed (anon gets 42501,
-- board goes empty) rather than open; the postcondition below catches it.
--
-- Expect the Supabase advisor to file a `security_definer_view` WARN for this.
-- It is correct that the view is definer; that is the design.
--
-- ============================================================================
-- VOTE COUNTS ARE AGGREGATED INTO THE VIEW rather than granting anon SELECT on
-- feedback_votes. That table's SELECT policy is `using (true)` to `public`, so
-- public reading was the intent, but it is `anon=awd` with no `r` either — so
-- useFeedbackVoteCounts 42501s for anon and every card would read 0 votes.
-- Granting the privilege would expose `feedback_votes.user_id`, i.e. who voted
-- for what. A count discloses no identity; the user_id never leaves the table.
--
-- ============================================================================
-- THE REVOKES ARE THE ONLY PART THAT REDUCES ANYTHING. anon held UPDATE and
-- DELETE on all three tables with no anon UPDATE or DELETE policy, and
-- relforcerowsecurity is false. Those are unusable in practice — a WHERE clause
-- needs SELECT on the columns it reads, which anon lacks — but a bare
-- `DELETE FROM community_submissions` reads no column, so RLS is the only thing
-- standing there. Safe to revoke: all 16 functions that UPDATE/DELETE these
-- tables (upsert_api_error, triage_action, run_community_submission_reconcile, …)
-- are SECURITY DEFINER owned by postgres and run as the owner, so none consults
-- anon's table privileges. anon keeps INSERT on community_submissions ONLY —
-- that is the feedback form (policy community_submissions_anon_insert_feedback),
-- the single anon write this system actually performs.

-- ---------------------------------------------------------------------------
-- 1. The projection.
-- ---------------------------------------------------------------------------
create or replace view public.feedback_board_v as
select
  cs.id,
  cs.submitted_at,
  cs.feedback_status,
  -- ALLOWLIST. Three named keys. Adding a key here is a publishing decision.
  jsonb_build_object(
    'title',       cs.data->>'title',
    'description', cs.data->>'description',
    'category',    cs.data->>'category'
  ) as data,
  (select count(*) from public.feedback_votes fv where fv.submission_id = cs.id)::int
    as vote_count
from public.community_submissions cs
where cs.content_type = 'feedback'
  -- Re-asserted, not inherited: this view bypasses RLS (see header).
  and coalesce(cs.is_spam, false) = false
  and cs.duplicate_of is null;

comment on view public.feedback_board_v is
  'Public /feedback board. Allowlist projection over community_submissions: '
  'publishes only data->title/description/category plus id, submitted_at, '
  'feedback_status and an aggregated vote_count. Deliberately NOT '
  'security_invoker — anon has no SELECT on the base table and jsonb cannot be '
  'redacted by a column grant — so this view''s own WHERE is the only guard. '
  'Never widen the jsonb_build_object key list without deciding to publish '
  'those keys: handoffs, replies and review_notes are staff correspondence.';

grant select on public.feedback_board_v to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop the inert policy.
-- ---------------------------------------------------------------------------
-- It gates nothing today (no SELECT privilege behind it) and it is a latent
-- hazard: the day anyone runs `GRANT SELECT ON community_submissions TO anon` —
-- a GRANT ALL sweep, a baseline regeneration, a Supabase default-privileges
-- change — this unqualified policy turns into exactly the full-row anon leak,
-- `contact_email` / `context` / `handoffs` / `ip_address` and all, that this
-- change was mistakenly opened to fix. Reading is the view's job now.
drop policy if exists community_submissions_anon_read_feedback
  on public.community_submissions;

-- ---------------------------------------------------------------------------
-- 3. Narrow anon to the one write it performs.
-- ---------------------------------------------------------------------------
revoke update, delete, truncate, trigger, references, maintain
  on public.community_submissions from anon;

-- Nothing anon does touches either of these: the audit INSERT policy is
-- {authenticated} and both vote policies require auth.uid() = user_id, which is
-- null for anon. anon held awd on both regardless.
revoke all on public.community_submissions_audit from anon;
revoke all on public.feedback_votes            from anon;

-- ---------------------------------------------------------------------------
-- 4. Postconditions — END STATE, so a re-apply by `db push` is a no-op.
-- ---------------------------------------------------------------------------
-- Deliberately NOT asserted: that the view holds no email-shaped string. It
-- holds none today (title/description/category: 0/0/0), but a user typing their
-- own address into a public feedback description is the board working as
-- designed, and failing this migration over it would abort `db push` for the
-- whole repo. The invariant asserted here is STRUCTURAL — the key allowlist —
-- which no amount of user data can breach. The email check lives in the guard
-- test, where a hit is a finding rather than a repo-wide outage.
do $verify$
declare
  v_privs text;
  v_n     int;
  v_cols  text;
begin
  -- 4a. anon on community_submissions: exactly INSERT.
  select coalesce(max(split_part(split_part(e::text, '=', 2), '/', 1)), '')
    into v_privs
  from pg_class c, unnest(c.relacl) e
  where c.oid = 'public.community_submissions'::regclass
    and e::text like 'anon=%';

  if v_privs <> 'a' then
    raise exception
      'community_submissions: anon privileges are "%", expected exactly "a" (INSERT only). r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN',
      v_privs;
  end if;

  -- 4b. anon holds nothing at all on the other two.
  select count(*) into v_n
  from pg_class c, unnest(c.relacl) e
  where c.oid in ('public.community_submissions_audit'::regclass,
                  'public.feedback_votes'::regclass)
    and e::text like 'anon=%';

  if v_n <> 0 then
    raise exception
      'anon still holds privileges on community_submissions_audit or feedback_votes (% acl entries)', v_n;
  end if;

  -- 4c. The inert policy is gone.
  if exists (select 1 from pg_policies
             where schemaname = 'public'
               and tablename  = 'community_submissions'
               and policyname = 'community_submissions_anon_read_feedback') then
    raise exception 'community_submissions_anon_read_feedback still exists';
  end if;

  -- 4d. The view's shape is exactly what the frontend selects.
  select string_agg(attname, ',' order by attnum) into v_cols
  from pg_attribute
  where attrelid = 'public.feedback_board_v'::regclass
    and attnum > 0 and not attisdropped;

  if v_cols is distinct from 'id,submitted_at,feedback_status,data,vote_count' then
    raise exception 'feedback_board_v columns are "%", expected id,submitted_at,feedback_status,data,vote_count', v_cols;
  end if;

  -- 4e. THE ALLOWLIST. Every row, every key. Catches a widened
  --     jsonb_build_object and a `data - 'x'` rewrite alike.
  select count(*) into v_n
  from public.feedback_board_v v
  where exists (select 1 from jsonb_object_keys(v.data) k
                where k not in ('title', 'description', 'category'));

  if v_n <> 0 then
    raise exception
      'feedback_board_v.data exposes a key outside the allowlist on % row(s)', v_n;
  end if;

  -- 4f. Only publishable base rows reach the view. The WHERE is the only guard,
  --     so it is checked against the base table rather than trusted.
  select count(*) into v_n
  from public.feedback_board_v v
  join public.community_submissions cs on cs.id = v.id
  where cs.content_type <> 'feedback'
     or coalesce(cs.is_spam, false)
     or cs.duplicate_of is not null;

  if v_n <> 0 then
    raise exception
      'feedback_board_v publishes % row(s) that are not live feedback (wrong content_type, spam, or a duplicate)', v_n;
  end if;

  -- 4g. anon can actually read it. This is what proves the view is still
  --     non-security_invoker; a CREATE OR REPLACE that flips the reloption
  --     fails here instead of silently emptying the board in production.
  begin
    set local role anon;
    select count(*) into v_n from public.feedback_board_v;
    reset role;
  exception when others then
    reset role;
    raise exception
      'anon cannot read feedback_board_v (%) — the view must stay non-security_invoker and keep its SELECT grant', sqlerrm;
  end;

  raise notice 'feedback_board_v: anon reads % row(s); anon on community_submissions = INSERT only', v_n;
end
$verify$;
