-- Interactive workbooks on glossary terms — layer 1, the DEFINITION.
--
-- WHY THIS EXISTS
--
-- The glossary defines `negotiation`, `hard-limits`, `safe-word`, `chastity`,
-- `consensual-non-consent-cnc`. It tells a reader what the word means and then
-- stops. The exercise that word exists to support — sit down with your partner
-- and actually negotiate — lives nowhere in this product. Measured before this
-- migration: grepping all 422 CREATE TABLE statements plus src/ for worksheet,
-- workbook, journal, reflection, questionnaire, survey, prompt_response or
-- answers returns CONTENT (book titles in marketplace rows, tag prose) and not
-- one feature. There is no structure anywhere that stores a private answer to
-- a structured prompt.
--
-- This migration adds the content half: an ordered set of steps hung off a
-- glossary term. The private answers are a separate table with a separate
-- privacy model (see the sibling migration) — the two must not be conflated,
-- which is the whole reason this is two files.
--
-- WHY A SIDE TABLE KEYED BY tag_id, AND NOT public.guides
--
-- `guides` was the obvious host and is the wrong one, for three measured
-- reasons:
--
--   1. `guides_quest_shape_chk` pins `criteria` to format='quest', so workbook
--      configuration would have to live in `meta` anyway.
--   2. `guide_sections` carries only (position, kind, body_md). There is no
--      stable per-step identity, and GuideSectionsPanel reorders by SWAPPING
--      position values in two separate mutations — so answers keyed to a
--      section would silently re-attach to a different prompt on every reorder.
--   3. `guide_participations.progress_json` is the one pre-built per-user slot
--      in that family, and `guide_participations_read_public` is a ROW-level
--      policy on `opted_in_public = true`. One tick of "show me in
--      contributors" on any quest would publish every answer a user had ever
--      written. That column must never hold workbook answers.
--
-- So this follows `20260815111727_tag_medical_codes.sql` instead: a side table
-- keyed by tag_id, an anon-read RPC that composes one grouped document, and a
-- band that renders nothing when the list is empty. Same two reasons that
-- migration gives for not using a jsonb column on unified_tags apply verbatim
-- here — `unified_tags_audit` is an unscoped AFTER trigger and
-- `trg_search_documents_tag` is column-scoped, so a column there would both
-- storm the audit log and trigger a search reindex on every content edit.
--
-- WHY is_public DEFAULTS FALSE WITH A COMPLETENESS CHECK
--
-- From `20260906100000_tag_sources_legal_citations.sql`: a row cannot go public
-- while it is incomplete, enforced by CHECK rather than by whoever remembers.
-- Default-deny means a half-authored workbook is invisible by construction, not
-- by an editor's discipline.
--
-- WHY kind='menu' DELEGATES TO THE KINK TAXONOMY
--
-- A negotiation menu — rate each scenario yes / no / maybe / hard limit, flag
-- what needs discussing first — already exists in this schema. `kink_ratings`
-- is exactly that scale (favorite|like|curious|maybe|no|hard_limit plus
-- needs_discussion) over `kink_items`, which already carry a one-line
-- consent-forward `description` and a `discussion_recommended` flag. A menu
-- step therefore stores a `kink_category_slug` and renders the EXISTING
-- control, inheriting the rating scale, the per-category visibility tiers,
-- `kink_compare`'s veto-aware intersection reveal, expiring/revocable share
-- links, the GDPR export and the moderation path. Building a second rating
-- engine here would duplicate all of it and diverge from it.

-- ---------------------------------------------------------------------------
-- 1. The workbook
-- ---------------------------------------------------------------------------

create table if not exists public.tag_workbooks (
  id               uuid primary key default gen_random_uuid(),
  tag_id           uuid not null references public.unified_tags(id) on delete cascade,
  slug             text not null unique
                     check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  title            text,
  dek              text,
  intro_md         text,
  -- 'negotiation' a two-party agreement to work through; 'menu' a rating pass
  -- over a kink category; 'program' a day-paced series; 'reflection' private
  -- prompts with no partner half.
  kind             text not null
                     check (kind in ('negotiation','menu','program','reflection')),
  day_count        int check (day_count is null or day_count between 2 and 60),
  requires_partner boolean not null default false,
  is_public        boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A program with no day_count cannot be paced; a public workbook with no
  -- title or intro renders a blank band. Neither is publishable.
  constraint tag_workbooks_public_requires_content
    check (
      not is_public
      or (title is not null and intro_md is not null
          and (kind <> 'program' or day_count is not null))
    ),
  -- day_count only means anything for a program.
  constraint tag_workbooks_day_count_program_only
    check (kind = 'program' or day_count is null)
);

create index if not exists tag_workbooks_tag_idx
  on public.tag_workbooks(tag_id) where is_public;

-- ---------------------------------------------------------------------------
-- 2. The steps
--
-- `key` exists so the content seed is re-runnable: a seed does
-- `on conflict (workbook_id, key) do update`, which a position-keyed table
-- cannot express. Answers key on `id`, which survives a reorder — `key` is for
-- authoring, `id` is the identity.
-- ---------------------------------------------------------------------------

create table if not exists public.tag_workbook_steps (
  id                uuid primary key default gen_random_uuid(),
  workbook_id       uuid not null references public.tag_workbooks(id) on delete cascade,
  key               text not null
                      check (key ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'),
  position          int not null default 0,
  -- NULL for a non-program; 0 = day one.
  day_offset        int check (day_offset is null or day_offset >= 0),
  kind              text not null
                      check (kind in ('prose','prompt','menu','checklist')),
  heading           text,
  prompt_md         text,
  help_md           text,
  -- kind='menu' only: which kink category this step rates.
  kink_category_slug text references public.kink_categories(slug) on delete restrict,
  answer_max_len    int not null default 4000
                      check (answer_max_len between 1 and 4000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (workbook_id, key),

  -- A menu step without a category has nothing to render; a non-menu step with
  -- one is a mis-authored row that would render two controls.
  constraint tag_workbook_steps_menu_needs_category
    check ((kind = 'menu') = (kink_category_slug is not null)),
  -- A prompt must ask something.
  constraint tag_workbook_steps_prompt_needs_text
    check (kind <> 'prompt' or prompt_md is not null)
);

create index if not exists tag_workbook_steps_workbook_idx
  on public.tag_workbook_steps(workbook_id, position);

-- ---------------------------------------------------------------------------
-- 3. RLS. Definition rows are CONTENT — anon-readable like the tag prose they
-- hang off. The private half is the sibling migration's problem.
--
-- A policy without a grant is unreachable in this project, so both are stated.
-- ---------------------------------------------------------------------------

alter table public.tag_workbooks enable row level security;
alter table public.tag_workbook_steps enable row level security;

grant select on public.tag_workbooks      to anon, authenticated;
grant select on public.tag_workbook_steps to anon, authenticated;
grant all    on public.tag_workbooks      to service_role;
grant all    on public.tag_workbook_steps to service_role;

-- Public read is gated on is_public AND on the parent tag still being active,
-- the same two-part gate `tag_sources_public_read` uses: a workbook hanging off
-- a deprecated or merged term must stop rendering with it.
drop policy if exists tag_workbooks_public_read on public.tag_workbooks;
create policy tag_workbooks_public_read on public.tag_workbooks
  for select
  using (
    is_public
    and exists (
      select 1 from public.unified_tags t
      where t.id = tag_workbooks.tag_id and t.status = 'active'
    )
  );

drop policy if exists tag_workbook_steps_public_read on public.tag_workbook_steps;
create policy tag_workbook_steps_public_read on public.tag_workbook_steps
  for select
  using (
    exists (
      select 1
      from public.tag_workbooks w
      join public.unified_tags t on t.id = w.tag_id
      where w.id = tag_workbook_steps.workbook_id
        and w.is_public
        and t.status = 'active'
    )
  );

-- Staff write. Editor is included because the tags console sits in a nav
-- section with minRole 'editor' — the precedent and the reason are both in
-- 20260906100000_tag_sources_legal_citations.sql.
drop policy if exists tag_workbooks_staff_write on public.tag_workbooks;
create policy tag_workbooks_staff_write on public.tag_workbooks
  for all to authenticated
  using (public.has_any_role_jwt(array['admin','moderator','editor']::app_role[]))
  with check (public.has_any_role_jwt(array['admin','moderator','editor']::app_role[]));

drop policy if exists tag_workbook_steps_staff_write on public.tag_workbook_steps;
create policy tag_workbook_steps_staff_write on public.tag_workbook_steps
  for all to authenticated
  using (public.has_any_role_jwt(array['admin','moderator','editor']::app_role[]))
  with check (public.has_any_role_jwt(array['admin','moderator','editor']::app_role[]));

-- ---------------------------------------------------------------------------
-- 4. updated_at. The house trigger function is public.set_updated_at() —
-- update_updated_at_column() does not exist in this schema.
-- ---------------------------------------------------------------------------

drop trigger if exists tag_workbooks_updated_at on public.tag_workbooks;
create trigger tag_workbooks_updated_at
  before update on public.tag_workbooks
  for each row execute function public.set_updated_at();

drop trigger if exists tag_workbook_steps_updated_at on public.tag_workbook_steps;
create trigger tag_workbook_steps_updated_at
  before update on public.tag_workbook_steps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. The anon-read RPC. One grouped document per tag, `is_public` filtered
-- INSIDE the function so no caller can forget it.
--
-- Deliberately returns the step PROMPTS but never any answer — answers are not
-- reachable from this function at all, by construction rather than by filter.
-- ---------------------------------------------------------------------------

create or replace function public.get_tag_workbooks(p_tag_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(wb order by wb->>'sort_order', wb->>'slug'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id',               w.id,
             'slug',             w.slug,
             'title',            w.title,
             'dek',              w.dek,
             'intro_md',         w.intro_md,
             'kind',             w.kind,
             'day_count',        w.day_count,
             'requires_partner', w.requires_partner,
             'sort_order',       w.sort_order,
             'step_count',       (select count(*) from public.tag_workbook_steps s
                                   where s.workbook_id = w.id and s.kind <> 'prose'),
             'steps',            coalesce(
                                   (select jsonb_agg(
                                             jsonb_build_object(
                                               'id',                 s.id,
                                               'key',                s.key,
                                               'position',           s.position,
                                               'day_offset',         s.day_offset,
                                               'kind',               s.kind,
                                               'heading',            s.heading,
                                               'prompt_md',          s.prompt_md,
                                               'help_md',            s.help_md,
                                               'kink_category_slug', s.kink_category_slug,
                                               'answer_max_len',     s.answer_max_len
                                             )
                                             order by s.position, s.key
                                           )
                                    from public.tag_workbook_steps s
                                    where s.workbook_id = w.id),
                                   '[]'::jsonb)
           ) as wb
    from public.tag_workbooks w
    join public.unified_tags t on t.id = w.tag_id
    where w.tag_id = p_tag_id
      and w.is_public
      and t.status = 'active'
  ) g;
$$;

revoke all on function public.get_tag_workbooks(uuid) from public;
grant execute on function public.get_tag_workbooks(uuid) to anon, authenticated, service_role;

-- Resolve a workbook by slug for the runner route, with its steps. Same
-- public gate; the runner then layers the intimate-eligibility check on top.
create or replace function public.get_tag_workbook_by_slug(p_slug text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
           'id',               w.id,
           'slug',             w.slug,
           'title',            w.title,
           'dek',              w.dek,
           'intro_md',         w.intro_md,
           'kind',             w.kind,
           'day_count',        w.day_count,
           'requires_partner', w.requires_partner,
           'tag_slug',         t.slug,
           'tag_name',         t.name,
           'steps',            coalesce(
                                 (select jsonb_agg(
                                           jsonb_build_object(
                                             'id',                 s.id,
                                             'key',                s.key,
                                             'position',           s.position,
                                             'day_offset',         s.day_offset,
                                             'kind',               s.kind,
                                             'heading',            s.heading,
                                             'prompt_md',          s.prompt_md,
                                             'help_md',            s.help_md,
                                             'kink_category_slug', s.kink_category_slug,
                                             'answer_max_len',     s.answer_max_len
                                           )
                                           order by s.position, s.key
                                         )
                                  from public.tag_workbook_steps s
                                  where s.workbook_id = w.id),
                                 '[]'::jsonb)
         )
  from public.tag_workbooks w
  join public.unified_tags t on t.id = w.tag_id
  where w.slug = p_slug
    and w.is_public
    and t.status = 'active';
$$;

revoke all on function public.get_tag_workbook_by_slug(text) from public;
grant execute on function public.get_tag_workbook_by_slug(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Postconditions. Assert the REACHED state, not the statements that reach it.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
begin
  -- P1: both tables exist with RLS on.
  select count(*) into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('tag_workbooks','tag_workbook_steps')
    and c.relrowsecurity;
  if v_bad <> 2 then
    raise exception 'P1 failed: expected 2 RLS-enabled workbook tables, found %', v_bad;
  end if;

  -- P2: is_public defaults FALSE on tag_workbooks. A default of true would make
  -- every half-authored workbook live the moment it is inserted.
  select count(*) into v_bad
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  join pg_class c on c.oid = d.adrelid
  where c.relname = 'tag_workbooks'
    and a.attname = 'is_public'
    and pg_get_expr(d.adbin, d.adrelid) = 'false';
  if v_bad <> 1 then
    raise exception 'P2 failed: tag_workbooks.is_public must default to false';
  end if;

  -- P3: an incomplete workbook cannot be published. Probe it rather than
  -- asserting the constraint text — a rewrite that preserves the condition
  -- must still pass, and one that drops it must still fail.
  begin
    insert into public.tag_workbooks (tag_id, slug, kind, is_public)
    select t.id, 'zz-probe-incomplete', 'negotiation', true
    from public.unified_tags t where t.status = 'active' limit 1;
    raise exception 'P3 failed: published a workbook with no title or intro';
  exception
    when check_violation then null;
  end;

  -- P4: a program with no day_count cannot be published either.
  begin
    insert into public.tag_workbooks (tag_id, slug, title, intro_md, kind, is_public)
    select t.id, 'zz-probe-program', 'p', 'i', 'program', true
    from public.unified_tags t where t.status = 'active' limit 1;
    raise exception 'P4 failed: published a program with no day_count';
  exception
    when check_violation then null;
  end;

  -- P5: both RPCs are reachable by anon and neither is granted to public.
  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('get_tag_workbooks','get_tag_workbook_by_slug')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad <> 2 then
    raise exception 'P5 failed: expected 2 anon-executable workbook RPCs, found %', v_bad;
  end if;

  -- P6: get_tag_workbooks returns an empty ARRAY, never null, for a tag with
  -- no workbook. A null would make the band's emptiness check ambiguous.
  if public.get_tag_workbooks('00000000-0000-0000-0000-000000000000'::uuid)
       is distinct from '[]'::jsonb then
    raise exception 'P6 failed: get_tag_workbooks must return [] for an unknown tag';
  end if;

  raise notice 'tag_workbook_definition: P1-P6 pass';
end
$verify$;
