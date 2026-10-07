-- Interactive workbooks on glossary terms — layer 2, the PRIVATE ANSWERS.
--
-- This is the one genuinely new thing in the workbook feature. Nothing in this
-- schema stored a private per-user answer to a structured prompt before now:
-- grepping all 422 CREATE TABLE statements for worksheet, workbook, journal,
-- reflection, questionnaire, survey, prompt_response or answers returned
-- content rows and zero features. The three nearest neighbours were each wrong
-- in a different way — `trip_journal_entries` is group-readable
-- (is_trip_member), `user_place_marks.note` has an additive is_public policy
-- that publishes the note when flipped, and `guide_participations.progress_json`
-- is row-level public on opted_in_public.
--
-- RLS STANCE — COPIED VERBATIM FROM kink_ratings, INCLUDING THE ASYMMETRY
--
-- `20260704144347_kink_ratings_visibility.sql` states it: ratings are STRICTLY
-- self-only, there is deliberately NO mutual-read policy, and every cross-user
-- read goes through a SECURITY DEFINER RPC that enforces the consent ladder.
-- That is what makes the reveal enforceable rather than advisory.
--
-- The asymmetry in those four policies is load-bearing and is reproduced here
-- exactly: SELECT and DELETE are plain ownership, INSERT and UPDATE
-- additionally require is_intimate_eligible(auth.uid()). So a user who opts out
-- of the intimate layer — or whose profile gets flagged by moderation — can
-- still read and erase their own answers (they can exercise erasure), but
-- cannot write new ones. Dropping the eligibility half of insert/update would
-- let a flagged account keep authoring; adding it to select/delete would trap
-- a user's own data behind a gate they just left.
--
-- Both tables also take `force row level security`, which matters because the
-- reveal RPCs run as a definer with rolbypassrls — the definer path must be the
-- ONLY bypass, not one of two.
--
-- WHY PLAIN TEXT AND NOT pgcrypto
--
-- Measured across the whole migration tree, exactly one pair of columns is
-- pgcrypto-encrypted: `intimate_profiles.about_intimate_enc` /
-- `looking_for_enc`. Everything else private is plain TEXT under RLS
-- (`trip_journal_entries.body`, `user_place_marks.note`). Copying the crypto
-- here would be actively worse, not merely heavier: a bytea answer cannot be
-- revealed to a partner without a definer function that holds the vault key for
-- a row it does not own, which is a strictly larger attack surface than
-- "RLS plus one gate function" — and it would make the answer invisible to RLS
-- reads, unsearchable, and un-to_jsonb-able for the GDPR export, which is why
-- export_my_data has to special-case the intimate text today.
--
-- WHY `shared` DEFAULTS FALSE AND IS A SECOND, INDEPENDENT OPT-IN
--
-- `kink_share_view` requires `include_in_share` on a category SEPARATELY from
-- the tier ladder — two independent opt-ins, because "I will show this person
-- my list" and "this item may leave my device" are different decisions. Same
-- shape here: an answer is withheld from the reveal unless the author flagged
-- that specific answer AND the partner has reciprocated a grant. Neither alone
-- is sufficient, and the default is withhold.

-- ---------------------------------------------------------------------------
-- 1. Answers. PK (user_id, step_id) — one answer per person per prompt.
--
-- Keyed on step_id, the stable uuid, NOT on a position: `guide_sections`-style
-- position keying re-attaches an answer to a different prompt on every reorder.
-- ---------------------------------------------------------------------------

create table if not exists public.tag_workbook_answers (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  step_id    uuid not null references public.tag_workbook_steps(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  shared     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, step_id)
);

create index if not exists tag_workbook_answers_user_idx
  on public.tag_workbook_answers(user_id);

-- ---------------------------------------------------------------------------
-- 2. Progress. One row per person per workbook. `started_at` is what paces a
-- kind='program' workbook — day N unlocks when now() - started_at >= N days,
-- computed client-side from this one timestamp. No cron, no server state, and
-- no per-day row to drift.
-- ---------------------------------------------------------------------------

create table if not exists public.tag_workbook_progress (
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  workbook_id  uuid not null references public.tag_workbooks(id) on delete cascade,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  last_step_id uuid references public.tag_workbook_steps(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, workbook_id)
);

-- ---------------------------------------------------------------------------
-- 3. RLS — the four kink_ratings policies, verbatim, on both tables.
-- ---------------------------------------------------------------------------

alter table public.tag_workbook_answers enable row level security;
alter table public.tag_workbook_answers force row level security;
alter table public.tag_workbook_progress enable row level security;
alter table public.tag_workbook_progress force row level security;

-- A policy without a grant is unreachable in this project. No anon grant at
-- all — an answer is never readable by an unauthenticated caller, by privilege
-- rather than by policy.
grant select, insert, update, delete on public.tag_workbook_answers  to authenticated;
grant select, insert, update, delete on public.tag_workbook_progress to authenticated;
grant all on public.tag_workbook_answers  to service_role;
grant all on public.tag_workbook_progress to service_role;

drop policy if exists tag_workbook_answers_self_select on public.tag_workbook_answers;
create policy tag_workbook_answers_self_select on public.tag_workbook_answers
  for select to authenticated using (user_id = auth.uid());

drop policy if exists tag_workbook_answers_self_insert on public.tag_workbook_answers;
create policy tag_workbook_answers_self_insert on public.tag_workbook_answers
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists tag_workbook_answers_self_update on public.tag_workbook_answers;
create policy tag_workbook_answers_self_update on public.tag_workbook_answers
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists tag_workbook_answers_self_delete on public.tag_workbook_answers;
create policy tag_workbook_answers_self_delete on public.tag_workbook_answers
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists tag_workbook_progress_self_select on public.tag_workbook_progress;
create policy tag_workbook_progress_self_select on public.tag_workbook_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists tag_workbook_progress_self_insert on public.tag_workbook_progress;
create policy tag_workbook_progress_self_insert on public.tag_workbook_progress
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists tag_workbook_progress_self_update on public.tag_workbook_progress;
create policy tag_workbook_progress_self_update on public.tag_workbook_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_intimate_eligible(auth.uid()));

drop policy if exists tag_workbook_progress_self_delete on public.tag_workbook_progress;
create policy tag_workbook_progress_self_delete on public.tag_workbook_progress
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists tag_workbook_answers_updated_at on public.tag_workbook_answers;
create trigger tag_workbook_answers_updated_at
  before update on public.tag_workbook_answers
  for each row execute function public.set_updated_at();

drop trigger if exists tag_workbook_progress_updated_at on public.tag_workbook_progress;
create trigger tag_workbook_progress_updated_at
  before update on public.tag_workbook_progress
  for each row execute function public.set_updated_at();

comment on column public.tag_workbook_answers.shared is
  'Per-answer opt-in to the two-party reveal. Independent of the partner grant: both are required, default is withhold. Mirrors kink_category_visibility.include_in_share being separate from the tier ladder.';

-- ---------------------------------------------------------------------------
-- Postconditions. Probe the BEHAVIOUR of the policies, not their text — a
-- rewrite that preserves the condition must pass and one that drops it must
-- fail. Run as an impersonated authenticated role, because the policies are
-- TO authenticated and postgres has rolbypassrls (the mechanic documented in
-- supabase/migrations/__tests__/kink_rls.sql).
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
begin
  -- P1: both tables carry enable AND force RLS. Force matters because the
  -- reveal RPCs are definers running as a rolbypassrls owner; without force,
  -- that owner is a second bypass path.
  select count(*) into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('tag_workbook_answers','tag_workbook_progress')
    and c.relrowsecurity
    and c.relforcerowsecurity;
  if v_bad <> 2 then
    raise exception 'P1 failed: expected 2 force-RLS answer tables, found %', v_bad;
  end if;

  -- P2: exactly four policies per table, and NO policy grants a read to anyone
  -- but the owner. A mutual-read policy here would make the reveal advisory.
  select count(*) into v_bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('tag_workbook_answers','tag_workbook_progress');
  if v_bad <> 8 then
    raise exception 'P2 failed: expected 8 policies across the two tables, found %', v_bad;
  end if;

  -- P3: the asymmetry. insert + update carry is_intimate_eligible; select +
  -- delete do not. Four of each across the two tables.
  select count(*) into v_bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('tag_workbook_answers','tag_workbook_progress')
    and cmd in ('INSERT','UPDATE')
    and coalesce(with_check, '') like '%is_intimate_eligible%';
  if v_bad <> 4 then
    raise exception 'P3 failed: expected 4 eligibility-gated write policies, found %', v_bad;
  end if;

  select count(*) into v_bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('tag_workbook_answers','tag_workbook_progress')
    and cmd in ('SELECT','DELETE')
    and (coalesce(qual, '') like '%is_intimate_eligible%');
  if v_bad <> 0 then
    raise exception 'P3b failed: select/delete must NOT require eligibility (found % that do) — an opted-out user must still be able to read and erase their own answers', v_bad;
  end if;

  -- P4: anon has no privilege on either table at all. Checked as a privilege,
  -- not as a policy — a policy change cannot re-expose what was never granted.
  select count(*) into v_bad
  from (
    select has_table_privilege('anon','public.tag_workbook_answers', p) as ok
      from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
    union all
    select has_table_privilege('anon','public.tag_workbook_progress', p)
      from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
  ) x where x.ok;
  if v_bad <> 0 then
    raise exception 'P4 failed: anon holds % privilege(s) on the answer tables', v_bad;
  end if;

  -- P5: `shared` defaults FALSE. A default of true would publish every answer
  -- the moment a partner grant went active.
  select count(*) into v_bad
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  join pg_class c on c.oid = d.adrelid
  where c.relname = 'tag_workbook_answers'
    and a.attname = 'shared'
    and pg_get_expr(d.adbin, d.adrelid) = 'false';
  if v_bad <> 1 then
    raise exception 'P5 failed: tag_workbook_answers.shared must default to false';
  end if;

  -- P6: body is length-capped. An uncapped free-text column on a table every
  -- authenticated user can write is a storage DoS.
  select count(*) into v_bad
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'tag_workbook_answers'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%char_length%';
  if v_bad < 1 then
    raise exception 'P6 failed: tag_workbook_answers.body must carry a length CHECK';
  end if;

  -- P7: erasure rides ON DELETE CASCADE from profiles(user_id). No bespoke
  -- delete path, same as the kink tables.
  select count(*) into v_bad
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname in ('tag_workbook_answers','tag_workbook_progress')
    and c.contype = 'f'
    and c.confdeltype = 'c'
    and pg_get_constraintdef(c.oid) like '%profiles(user_id)%';
  if v_bad <> 2 then
    raise exception 'P7 failed: expected 2 cascading profiles(user_id) FKs, found % — without them erasure leaves answers behind', v_bad;
  end if;

  raise notice 'tag_workbook_answers: P1-P7 pass';
end
$verify$;
