# Observances Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make annual awareness days (World AIDS Day, TDoR, Coming Out Day, …) first-class: a table, per-country date rules, a two-signal event linker, and a minimal `/days/:slug` hub — live before 2026-12-01.

**Architecture:** Three Postgres tables (`observances`, `observance_dates`, `event_observances`). All date logic lives in ONE SQL function (`observance_rule_range`) used by the linker, the hub RPC and the migration's own postconditions. A nightly pure-SQL cron (`observance_link`) proposes links; a `conditions.mode` lever (`dry_run` → `full`) means nothing auto-publishes until a human has read the proposals. The hub reads events through `events` RLS, so safety-gated events vanish for anon automatically; an aggregate-only definer RPC counts them.

**Tech Stack:** Postgres 17 (Supabase), pg_cron, React 19 + TanStack Query, react-router, vitest + RTL, Playwright.

**Spec:** `docs/plans/2026-11-22-observances-design.md`. Deltas from the spec, decided while planning (record them in the spec in Task 9):

| Spec said | Plan does | Why |
|---|---|---|
| rule types fixed / span / nth_weekday | fixed / **month** / nth_weekday | `span 02-01..02-28` drops Feb 29 in leap years; nothing in Phase 1 needs an arbitrary span |
| Ace Week in seed | **deferred** | needs a 4th rule type ("last full week"); 3 events in the corpus |
| Map on the hub | **deferred to Phase 2** | |
| Reader's country resolved | **all regional dates listed** | no viewer-country hook exists in `src/hooks`; listing is honest and needs no geo detection |
| "Duplicate First World AIDS Day milestone" | **published row merged INTO a draft** | measured: `5acdd342` (published) has `duplicate_of_id → caf76bbb` (draft); `/history/1988-first-world-aids-day` 301s to `/history/erster-welt-aids-tag-1988-12-01`, which 404s |
| "TDoR founded dated 1999-01-01 is a placeholder" | **not a defect** | `date_precision = 'year'`; the row is correct at year precision |

**Measured inputs (prod, 2026-11-22)** that set the seed windows — offset of title-matched events from the day:

| day | n | within ±3 | within ±7 | p10 / p90 | outliers |
|---|---|---|---|---|---|
| World AIDS Day | 57 | 53 | 56 | −1 / +1 | +14 |
| TDoR | 62 | 51 | 58 | −5 / 0 | −16, −13, −11, −8 |
| Coming Out Day | 28 | 25 | 27 | −3 / +1 | +18 |

TDoR events cluster *before* the day (Trans Awareness Week precedes it), hence `before 7 / after 1`.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/<v1>_milestone_world_aids_day_merge_direction.sql` | Reverse the WAD merge so the published row is the keeper |
| `supabase/migrations/<v2>_observances.sql` | Tables, RLS, grants, date functions, linker, seed, cron + registry, postconditions |
| `src/lib/__tests__/observancesMigration.test.ts` | Text guard on the migration's load-bearing invariants (comment-stripped) |
| `src/hooks/useObservances.ts` | All observance reads (only place that calls `untypedFrom`) |
| `src/lib/observanceWindow.ts` | Pure: next-date rows → event fetch window + display strings |
| `src/lib/__tests__/observanceWindow.test.ts` | Unit tests for the above |
| `src/pages/ObservanceDetail.tsx` | `/days/:slug` hub |
| `src/pages/__tests__/ObservanceDetail.test.tsx` | Render tests (tone, empty state, gated notice) |
| `src/components/events/EventObservanceChip.tsx` | "Part of World AIDS Day" chip on event detail |
| `src/routes.tsx` | Route + lazy import |
| `src/pages/EventDetail.tsx` | Mount the chip |
| `functions/_lib/appRoutes.json` | Regenerated (edge 404 guard knows `/days/:slug`) |
| `e2e/observances.spec.ts` | Prod check with positive controls |

`<v1>` and `<v2>` come from `scripts/next-migration-version.mjs`; never pick a version by hand.

---

### Task 0: Workspace

**Files:** none

- [ ] **Step 1: Install deps in THIS worktree** (no `node_modules` here; without it the pre-commit hook fails and vitest may resolve from the primary checkout)

Run: `npm ci`
Expected: exits 0; `ls node_modules/.bin/vitest` exists.

- [ ] **Step 2: Confirm the WAD merge defect is still present** (another session may have fixed it)

```sql
select id, status, duplicate_of_id from milestones
where id in ('5acdd342-fe6b-4b17-9459-d39f1c096067','caf76bbb-5a34-4124-bb05-c182d7e4e572');
```
Expected: `5acdd342` published with `duplicate_of_id = caf76bbb…`; `caf76bbb` draft, `duplicate_of_id` null. If it is already reversed, skip Task 1 and drop the WAD line from Task 2's verify block.

---

### Task 1: Reverse the World AIDS Day milestone merge

**Files:**
- Create: `supabase/migrations/<v1>_milestone_world_aids_day_merge_direction.sql`

Context: the nightly dedup sweep (audit `a22db1cd-…`, 2026-08-01, pre-`schema:1`, so `unmerge_entities` cannot replay it) merged the published English row into a draft German twin. Only this one row is fixed here; the 3 other published→draft milestone merges (two Ulrichs 1867 rows into one draft, Hirschfeld/WhK 1897) and the sweep's keep-selection are a separate session (see Task 10).

- [ ] **Step 1: Allocate the version and create the file**

Run: `node scripts/next-migration-version.mjs --create milestone_world_aids_day_merge_direction`
Expected: prints the created path.

- [ ] **Step 2: Write the migration**

```sql
-- The published "First World AIDS Day" milestone (5acdd342, slug 1988-first-world-aids-day)
-- was merged by the 2026-08-01 dedup sweep INTO a draft twin (caf76bbb,
-- erster-welt-aids-tag-1988-12-01). Result: the published URL 301s to a draft that 404s.
-- Reverse the direction: the published row keeps, the draft drops.
--
-- The audit predates schema:1, so unmerge_entities cannot replay it; the merge recorded
-- no moved rows worth restoring for a milestone pair. Steps:
--   1. remove the redirect that points the published slug at the draft
--   2. clear the published row's duplicate_of_id
--   3. merge draft -> published through the real merge core (writes the new redirect + audit)
-- Guarded on the current state so a re-run, or a concurrent fix, is a no-op.

do $$
declare
  v_pub   constant uuid := '5acdd342-fe6b-4b17-9459-d39f1c096067';
  v_draft constant uuid := 'caf76bbb-5a34-4124-bb05-c182d7e4e572';
begin
  if not exists (select 1 from public.milestones where id = v_pub and duplicate_of_id = v_draft) then
    raise notice 'WAD milestone merge already reversed or changed; skipping';
    return;
  end if;

  delete from public.milestone_slug_redirects
  where old_slug = '1988-first-world-aids-day' and milestone_id = v_draft;

  update public.milestones set duplicate_of_id = null where id = v_pub;

  perform public._milestone_merge_core(v_pub, v_draft, null::uuid);
end $$;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.milestones
  where id = '5acdd342-fe6b-4b17-9459-d39f1c096067'
    and (duplicate_of_id is not null or status <> 'published');
  if v_bad <> 0 then raise exception 'P1 failed: published WAD milestone is not the keeper'; end if;

  select count(*) into v_bad from public.milestone_slug_redirects
  where old_slug = '1988-first-world-aids-day';
  if v_bad <> 0 then raise exception 'P2 failed: published slug still redirects'; end if;
end $verify$;
```

- [ ] **Step 3: Dry-run on prod in a transaction forced to roll back**

Run the whole file through `execute_sql` with `raise exception 'ROLLBACK DRY RUN';` appended as the last statement (one call = one transaction; the raise rolls everything back).
Expected: the error message is exactly `ROLLBACK DRY RUN` — any other error (e.g. `_milestone_merge_core` signature mismatch, a role check) means fix and retry. Then confirm nothing committed:
```sql
select duplicate_of_id from milestones where id='5acdd342-fe6b-4b17-9459-d39f1c096067';
```
Expected: still `caf76bbb-…`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_milestone_world_aids_day_merge_direction.sql
git commit -m "fix(milestones): published First World AIDS Day is the keeper, not its draft twin"
```

---

### Task 2: Observances schema, date functions, linker, seed

**Files:**
- Create: `supabase/migrations/<v2>_observances.sql`
- Test: `src/lib/__tests__/observancesMigration.test.ts`

- [ ] **Step 1: Verify every seed date and source before writing it**

For each row in the seed below: open the source URL (`curl -sIL -o /dev/null -w '%{http_code}\n' <url>`), confirm the date against the page. 200 = record it. 403 = record it with `"unverifiable": true` (browser challenge, same convention as `scripts/check-legal-citation-links.mjs`). 404 = find the organiser's current page before seeding; do not seed an unsourced date.

| slug | rule | source |
|---|---|---|
| world-aids-day | fixed 12-01 | https://www.who.int/campaigns/world-aids-day |
| transgender-day-of-remembrance | fixed 11-20 | https://glaad.org/tdor/ |
| transgender-day-of-visibility | fixed 03-31 | https://transstudent.org/tdov/ |
| idahobit | fixed 05-17 | https://may17.org/ |
| coming-out-day | fixed 10-11 | https://www.hrc.org/resources/national-coming-out-day |
| bi-visibility-day | fixed 09-23 | https://bivisibilityday.com/ |
| lesbian-visibility-day | fixed 04-26 | https://www.lesbianvisibilityweek.com/ |
| intersex-awareness-day | fixed 10-26 | https://intersexday.org/en/ |
| spirit-day | nth_weekday 3rd Thu Oct | https://glaad.org/spiritday/ |
| zero-discrimination-day | fixed 03-01 | https://www.unaids.org/en/zero-discrimination-day |
| stonewall-anniversary | fixed 06-28 | https://www.nps.gov/ston/ |
| lgbt-history-month | month: GB 02, US 10, CA 10 | https://lgbtplushistorymonth.co.uk/ · https://lgbthistorymonth.com/ |

If a source disagrees with the table, the source wins: change the seed and say so in the commit message.

- [ ] **Step 2: Write the failing text guard**

```ts
// src/lib/__tests__/observancesMigration.test.ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards <v2>_observances.sql. Assertions run over COMMENT-STRIPPED SQL and are scoped
// to the statement they are about: the header quotes the rules it implements, so a
// bare toContain over the raw file passes against a deleted guard.
const dir = join(process.cwd(), 'supabase/migrations');
const file = readdirSync(dir).find((f) => f.endsWith('_observances.sql'));
const raw = file ? readFileSync(join(dir, file), 'utf8') : '';
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

function fnBody(name: string): string {
  const start = sql.indexOf(`function public.${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = sql.indexOf('$fn$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('observances migration', () => {
  it('exists', () => expect(file).toBeTruthy());

  it('linker never links on the name signal alone (both signals, full mode only)', () => {
    const body = fnBody('run_observance_link');
    expect(body).toMatch(/when v_mode = 'full' and s\.name_sig and s\.date_sig then 'linked'/);
    expect(body).not.toMatch(/then 'linked'[\s\S]{0,40}else 'linked'/);
  });

  it('candidates require a name match (date alone never inserts)', () => {
    const body = fnBody('run_observance_link');
    expect(body).toMatch(/join o on \(e\.title ~\* o\.rx or coalesce\(e\.description, ''\) ~\* o\.rx\)/);
    expect(body).not.toMatch(/where e\.title ~\*/);
  });

  it('a human decision or a rejection is never overwritten', () => {
    const body = fnBody('run_observance_link');
    const upd = body.slice(body.indexOf('on conflict'));
    expect(upd).toMatch(/where public\.event_observances\.status = 'review'/);
    expect(upd).toMatch(/and public\.event_observances\.method = 'auto'/);
    expect(upd).toMatch(/and excluded\.status = 'linked'/);
  });

  it('gated count returns an aggregate only, scoped to safety_gated', () => {
    const body = fnBody('observance_gated_count');
    expect(body).toMatch(/returns int/);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/and e\.safety_gated/);
  });

  it('linker is not callable by anon/authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.run_observance_link\(text, timestamptz\) from public, anon, authenticated;/,
    );
  });

  it('new tables revoke the public-schema default write grants', () => {
    for (const t of ['observances', 'observance_dates', 'event_observances']) {
      expect(sql).toContain(`revoke all on table public.${t} from anon, authenticated;`);
      expect(sql).toContain(`grant select on table public.${t} to anon, authenticated;`);
    }
  });

  it('postconditions assert computed dates, not just row counts', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain("'2025-10-16'");
    expect(verify).toContain("'2026-10-15'");
    expect(verify).toContain("'2028-02-29'");
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/lib/__tests__/observancesMigration.test.ts`
Expected: FAIL on `exists`.

- [ ] **Step 4: Allocate the version**

Run: `node scripts/next-migration-version.mjs --create observances`
Expected: a path sorting ABOVE Task 1's file.

- [ ] **Step 5: Write the migration**

Fill `sources` per row with the URLs verified in Step 1 (format: `'[{"url":"…","checked":"2026-11-2X"}]'::jsonb`). The SQL below shows World AIDS Day's; every row needs its own.

```sql
-- Observances: annual awareness days as first-class entities.
-- Design: docs/plans/2026-11-22-observances-design.md; plan: docs/superpowers/plans/2026-11-22-observances-phase1.md
--
-- ONE date implementation (observance_rule_range) feeds the linker, the hub RPC and the
-- postconditions below, so "what date is Spirit Day" cannot drift between them.
-- Linker rule: a link needs BOTH a name match and a date inside the window of the event's
-- own country rule (falling back to the global rule). Name only -> 'review'. Date only ->
-- nothing. 'rejected' is a tombstone. Nothing auto-links until conditions.mode = 'full'.

-- ===== 1. tables =====
create table public.observances (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  kind text not null check (kind in ('day', 'month')),
  tone text not null check (tone in ('memorial', 'awareness', 'celebration')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  summary text not null,
  body text,
  founded_year smallint,
  founded_milestone_id uuid references public.milestones(id) on delete set null,
  tag_id uuid references public.unified_tags(id) on delete set null,
  match_terms text[] not null check (cardinality(match_terms) > 0),
  window_days_before smallint not null default 3 check (window_days_before between 0 and 31),
  window_days_after smallint not null default 3 check (window_days_after between 0 and 31),
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.observance_dates (
  id uuid primary key default gen_random_uuid(),
  observance_id uuid not null references public.observances(id) on delete cascade,
  country_id uuid references public.countries(id) on delete cascade,  -- null = global default
  rule_type text not null check (rule_type in ('fixed', 'month', 'nth_weekday')),
  month smallint not null check (month between 1 and 12),
  day smallint check (day between 1 and 31),
  nth smallint check (nth between 1 and 5),
  weekday smallint check (weekday between 0 and 6),        -- 0 = Sunday, = extract(dow)
  check (
    (rule_type = 'fixed'       and day is not null and nth is null and weekday is null) or
    (rule_type = 'month'       and day is null and nth is null and weekday is null) or
    (rule_type = 'nth_weekday' and day is null and nth is not null and weekday is not null)
  )
);
create unique index observance_dates_one_rule_per_country
  on public.observance_dates (observance_id, coalesce(country_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.event_observances (
  event_id uuid not null references public.events(id) on delete cascade,
  observance_id uuid not null references public.observances(id) on delete cascade,
  method text not null check (method in ('auto', 'human')),
  status text not null check (status in ('linked', 'review', 'rejected')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, observance_id)
);
create index event_observances_by_observance on public.event_observances (observance_id, status);

-- ===== 2. RLS + grants =====
-- public-schema default privileges grant anon/authenticated write on new relations;
-- revoke first, then grant read only.
alter table public.observances enable row level security;
alter table public.observance_dates enable row level security;
alter table public.event_observances enable row level security;

create policy observances_public_read on public.observances
  for select using (status = 'published');
create policy observance_dates_public_read on public.observance_dates
  for select using (exists (select 1 from public.observances o
                            where o.id = observance_id and o.status = 'published'));
create policy event_observances_public_read on public.event_observances
  for select using (status = 'linked');

revoke all on table public.observances from anon, authenticated;
revoke all on table public.observance_dates from anon, authenticated;
revoke all on table public.event_observances from anon, authenticated;
grant select on table public.observances to anon, authenticated;
grant select on table public.observance_dates to anon, authenticated;
grant select on table public.event_observances to anon, authenticated;

-- ===== 3. date functions =====
create or replace function public.observance_rule_range(
  p_rule text, p_year int, p_month smallint, p_day smallint, p_nth smallint, p_weekday smallint)
returns daterange language sql immutable set search_path to 'public' as $fn$
  select case p_rule
    when 'fixed' then daterange(make_date(p_year, p_month, p_day), make_date(p_year, p_month, p_day), '[]')
    when 'month' then daterange(make_date(p_year, p_month, 1),
                                (make_date(p_year, p_month, 1) + interval '1 month')::date, '[)')
    when 'nth_weekday' then (
      select daterange(d, d, '[]') from (
        select make_date(p_year, p_month, 1)
             + ((p_weekday - extract(dow from make_date(p_year, p_month, 1))::int + 7) % 7)
             + (p_nth - 1) * 7 as d) s)
  end
$fn$;

-- Occurrence for one year in one country; the country's own rule wins over the global one.
create or replace function public.observance_occurrence(p_observance_id uuid, p_year int, p_country_id uuid)
returns daterange language sql stable set search_path to 'public' as $fn$
  select public.observance_rule_range(r.rule_type, p_year, r.month, r.day, r.nth, r.weekday)
  from public.observance_dates r
  where r.observance_id = p_observance_id
    and (r.country_id = p_country_id or r.country_id is null)
  order by (r.country_id is null)
  limit 1
$fn$;

-- Hub: current (still inside its after-window) or next occurrence, one row per rule.
create or replace function public.observance_next_dates(p_observance_id uuid)
returns table (country_id uuid, country_name text, starts date, ends date)
language sql stable set search_path to 'public' as $fn$
  select r.country_id, c.name, lower(x.rng), upper(x.rng) - 1
  from public.observance_dates r
  join public.observances o on o.id = r.observance_id
  left join public.countries c on c.id = r.country_id
  cross join lateral (
    select case when upper(t.rng) - 1 + o.window_days_after >= current_date then t.rng else n.rng end as rng
    from (select public.observance_rule_range(r.rule_type, extract(year from current_date)::int,
                                              r.month, r.day, r.nth, r.weekday) as rng) t,
         (select public.observance_rule_range(r.rule_type, extract(year from current_date)::int + 1,
                                              r.month, r.day, r.nth, r.weekday) as rng) n
  ) x
  where r.observance_id = p_observance_id
  order by r.country_id nulls first, c.name
$fn$;

grant execute on function public.observance_rule_range(text, int, smallint, smallint, smallint, smallint) to anon, authenticated;
grant execute on function public.observance_occurrence(uuid, int, uuid) to anon, authenticated;
grant execute on function public.observance_next_dates(uuid) to anon, authenticated;

-- ===== 4. gated count (aggregate only; same contract as gated_count_for_location) =====
create or replace function public.observance_gated_count(p_observance_id uuid, p_from date, p_to date)
returns int language sql stable security definer set search_path to 'public' as $fn$
  select count(*)::int
  from public.event_observances eo
  join public.events e on e.id = eo.event_id
  where eo.observance_id = p_observance_id
    and eo.status = 'linked'
    and e.duplicate_of_id is null
    and e.start_date::date between p_from and p_to
    and e.safety_gated
$fn$;
revoke all on function public.observance_gated_count(uuid, date, date) from public;
grant execute on function public.observance_gated_count(uuid, date, date) to anon, authenticated, service_role;

-- ===== 5. linker =====
-- p_since bounds the nightly scan; pass null once for the historical backfill.
create or replace function public.run_observance_link(p_mode text default null,
                                                      p_since timestamptz default now() - interval '400 days')
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_mode text;
begin
  select coalesce(p_mode, a.conditions->>'mode', 'dry_run') into v_mode
  from public.admin_automations a where a.slug = 'observance_link';
  v_mode := coalesce(v_mode, p_mode, 'dry_run');
  if v_mode not in ('dry_run', 'full') then
    raise exception 'observance_link: unknown mode %', v_mode;
  end if;

  with o as (
    select ob.id, ob.window_days_before as wb, ob.window_days_after as wa,
           -- ~* is case-insensitive; substring() is not, hence the (?i) prefix there
           '\m(' || array_to_string(ob.match_terms, '|') || ')\M' as rx, ob.match_terms
    from public.observances ob where ob.status = 'published'
  ),
  cand as (
    -- ponytail: UTC date of start_date, the ±window absorbs the day-edge error;
    -- switch to the event's timezone if a hand-read shows misses at the window edge.
    select e.id as event_id, o.id as observance_id, o.wb, o.wa,
           substring(e.title from ('(?i)' || o.rx)) as title_term,
           substring(coalesce(e.description, '') from ('(?i)' || o.rx)) as desc_term,
           e.start_date::date as d,
           public.observance_occurrence(o.id, extract(year from e.start_date)::int, e.country_id) as occ,
           exists (select 1 from public.observance_dates r
                   where r.observance_id = o.id and r.country_id = e.country_id) as country_rule
    from public.events e
    -- name match lives in the JOIN; the WHERE holds only event filters
    -- (`a or b and c` would parse as `a or (b and c)` and leak duplicates)
    join o on (e.title ~* o.rx or coalesce(e.description, '') ~* o.rx)
    where e.duplicate_of_id is null
      and e.start_date is not null
      and (p_since is null or e.start_date >= p_since)
  ),
  s as (
    select c.*, true as name_sig,
           c.occ is not null
             and c.d >= lower(c.occ) - c.wb
             and c.d <= (upper(c.occ) - 1) + c.wa as date_sig,
           case when c.occ is null then null else c.d - lower(c.occ) end as offset_days
    from cand c
  )
  insert into public.event_observances (event_id, observance_id, method, status, evidence)
  select s.event_id, s.observance_id, 'auto',
         case when v_mode = 'full' and s.name_sig and s.date_sig then 'linked' else 'review' end,
         jsonb_build_object('title_term', s.title_term, 'desc_term', s.desc_term,
                            'date_signal', coalesce(s.date_sig, false), 'offset_days', s.offset_days,
                            'country_rule', s.country_rule, 'mode', v_mode)
  from s
  on conflict (event_id, observance_id) do update
    set status = excluded.status, evidence = excluded.evidence, updated_at = now()
    where public.event_observances.status = 'review'
      and public.event_observances.method = 'auto'
      and excluded.status = 'linked';

  return jsonb_build_object(
    'mode', v_mode,
    'by_status', (select jsonb_object_agg(status, n)
                  from (select status, count(*) n from public.event_observances group by status) x));
end
$fn$;
revoke all on function public.run_observance_link(text, timestamptz) from public, anon, authenticated;
grant execute on function public.run_observance_link(text, timestamptz) to service_role;
```

Continue the migration:

```sql
-- ===== 6. seed =====
insert into public.observances
  (slug, name, kind, tone, status, summary, founded_year, match_terms, window_days_before, window_days_after, sources)
values
  ('world-aids-day', 'World AIDS Day', 'day', 'memorial', 'published',
   'Held every 1 December since 1988 to remember people who died of AIDS-related illness and to push for HIV prevention, testing and treatment.',
   1988, array['world aids day','welt-?aids-?tag','journ[ée]e mondiale (de lutte contre le )?sida','d[ií]a mundial (de la lucha contra el )?sida','giornata mondiale (contro l.)?aids'],
   3, 3, '[{"url":"https://www.who.int/campaigns/world-aids-day","checked":"2026-11-2X"}]'::jsonb),
  ('transgender-day-of-remembrance', 'Transgender Day of Remembrance', 'day', 'memorial', 'published',
   'Held every 20 November to remember trans people killed by anti-trans violence. Founded in 1999 after the murder of Rita Hester.',
   1999, array['trans(gender)? day of remembrance','tdor','transgender gedenktag'], 7, 1, '[]'::jsonb),
  ('transgender-day-of-visibility', 'Transgender Day of Visibility', 'day', 'celebration', 'published',
   'Held every 31 March to recognise trans people and the discrimination they face.',
   2009, array['trans(gender)? day of visibility','tdov'], 3, 3, '[]'::jsonb),
  ('idahobit', 'IDAHOBIT', 'day', 'awareness', 'published',
   'The International Day Against Homophobia, Biphobia and Transphobia, held every 17 May — the date in 1990 the WHO removed homosexuality from its list of mental disorders.',
   2004, array['idahobi?t','idahot','international day against homophobia'], 3, 3, '[]'::jsonb),
  ('coming-out-day', 'Coming Out Day', 'day', 'celebration', 'published',
   'Held every 11 October, first observed in the United States in 1988.',
   1988, array['coming[- ]out[- ]day','coming-out-tag'], 4, 2, '[]'::jsonb),
  ('bi-visibility-day', 'Bi Visibility Day', 'day', 'celebration', 'published',
   'Held every 23 September to recognise bisexual people, first observed in 1999.',
   1999, array['bi(sexual)? visibility day','celebrate bisexuality day'], 3, 3, '[]'::jsonb),
  ('lesbian-visibility-day', 'Lesbian Visibility Day', 'day', 'celebration', 'published',
   'Held every 26 April to recognise lesbians and their contributions.',
   null, array['lesbian visibility (day|week)'], 3, 3, '[]'::jsonb),
  ('intersex-awareness-day', 'Intersex Awareness Day', 'day', 'awareness', 'published',
   'Held every 26 October, marking the first public intersex demonstration in Boston in 1996.',
   1996, array['intersex awareness day'], 3, 3, '[]'::jsonb),
  ('spirit-day', 'Spirit Day', 'day', 'awareness', 'published',
   'Held on the third Thursday of October; people wear purple to stand against bullying of LGBTQ+ youth.',
   2010, array['spirit day'], 1, 1, '[]'::jsonb),
  ('zero-discrimination-day', 'Zero Discrimination Day', 'day', 'awareness', 'published',
   'A UNAIDS day held every 1 March for equality before the law and in practice.',
   2014, array['zero discrimination day'], 3, 3, '[]'::jsonb),
  ('stonewall-anniversary', 'Stonewall anniversary', 'day', 'awareness', 'published',
   'Marks the start of the Stonewall uprising in New York on 28 June 1969.',
   1969, array['stonewall anniversary','anniversary of (the )?stonewall'], 3, 3, '[]'::jsonb),
  ('lgbt-history-month', 'LGBT+ History Month', 'month', 'awareness', 'published',
   'A month of LGBT+ history events. The month differs by country: February in the UK, October in the United States and Canada.',
   1994, array['lgbt(q|qia)?\+? history month','queer history month'], 0, 0, '[]'::jsonb);

insert into public.observance_dates (observance_id, country_id, rule_type, month, day, nth, weekday)
select o.id, null, v.rule_type, v.month, v.day, v.nth, v.weekday
from (values
  ('world-aids-day', 'fixed', 12::smallint, 1::smallint, null::smallint, null::smallint),
  ('transgender-day-of-remembrance', 'fixed', 11, 20, null, null),
  ('transgender-day-of-visibility', 'fixed', 3, 31, null, null),
  ('idahobit', 'fixed', 5, 17, null, null),
  ('coming-out-day', 'fixed', 10, 11, null, null),
  ('bi-visibility-day', 'fixed', 9, 23, null, null),
  ('lesbian-visibility-day', 'fixed', 4, 26, null, null),
  ('intersex-awareness-day', 'fixed', 10, 26, null, null),
  ('spirit-day', 'nth_weekday', 10, null, 3, 4),
  ('zero-discrimination-day', 'fixed', 3, 1, null, null),
  ('stonewall-anniversary', 'fixed', 6, 28, null, null)
) v(slug, rule_type, month, day, nth, weekday)
join public.observances o on o.slug = v.slug;

insert into public.observance_dates (observance_id, country_id, rule_type, month)
select o.id, c.id, 'month', v.month
from (values ('GB', 2::smallint), ('US', 10), ('CA', 10)) v(code, month)
join public.countries c on c.code = v.code
cross join public.observances o
where o.slug = 'lgbt-history-month';

-- founding milestones + existing tags (by stable slug; null if absent, never guessed)
update public.observances o set founded_milestone_id = m.id
from (values
  ('world-aids-day', '1988-first-world-aids-day'),
  ('transgender-day-of-remembrance', '1999-transgender-day-of-remembrance-founded')
) v(slug, m_slug)
join public.milestones m on m.slug = v.m_slug and m.duplicate_of_id is null and m.status = 'published'
where o.slug = v.slug;

update public.observances o set tag_id = t.id
from (values
  ('transgender-day-of-remembrance', 'trans-day-of-remembrance'),
  ('transgender-day-of-visibility', 'transgender-day-of-visibility'),
  ('bi-visibility-day', 'bi-visibility-day'),
  ('world-aids-day', 'aids-awareness')
) v(slug, t_slug)
join public.unified_tags t on t.slug = v.t_slug and t.status = 'active'
where o.slug = v.slug;

-- ===== 7. registry + cron (starts in dry_run: proposes, never links) =====
insert into public.admin_automations
  (name, slug, action, enabled, trigger, schedule, conditions, managed_by, description, auto_pause_threshold)
values (
  'Link events to observances', 'observance_link',
  jsonb_build_object('type', 'cron', 'command', 'SELECT public.run_observance_link()', 'jobname', 'observance_link'),
  true, '{"type":"schedule"}'::jsonb, '25 3 * * *', '{"mode":"dry_run"}'::jsonb, 'system',
  'Nightly: links events to observances (World AIDS Day, TDoR, …) when the event names the day AND starts inside that day''s window for the event''s country. Name only -> review. conditions.mode: dry_run (everything -> review) | full (both signals -> linked). Kill switch = disable this row.',
  3
)
on conflict (slug) do nothing;

select cron.schedule('observance_link', '25 3 * * *', 'SELECT public.run_observance_link()');

-- ===== 8. postconditions =====
do $verify$
declare v_bad int; v_d date;
begin
  -- the date function, asserted on dates a human can check on a calendar
  select lower(public.observance_rule_range('nth_weekday', 2025, 10::smallint, null, 3::smallint, 4::smallint)) into v_d;
  if v_d <> '2025-10-16' then raise exception 'P1 failed: Spirit Day 2025 = %', v_d; end if;
  select lower(public.observance_rule_range('nth_weekday', 2026, 10::smallint, null, 3::smallint, 4::smallint)) into v_d;
  if v_d <> '2026-10-15' then raise exception 'P2 failed: Spirit Day 2026 = %', v_d; end if;
  select upper(public.observance_rule_range('month', 2028, 2::smallint, null, null, null)) - 1 into v_d;
  if v_d <> '2028-02-29' then raise exception 'P3 failed: Feb 2028 ends %', v_d; end if;

  -- country rule wins; a country with no rule falls back to null for a month-only observance
  select lower(public.observance_occurrence(o.id, 2027, c.id)) into v_d
  from public.observances o, public.countries c where o.slug = 'lgbt-history-month' and c.code = 'GB';
  if v_d <> '2027-02-01' then raise exception 'P4 failed: GB history month = %', v_d; end if;
  select lower(public.observance_occurrence(o.id, 2027, c.id)) into v_d
  from public.observances o, public.countries c where o.slug = 'lgbt-history-month' and c.code = 'US';
  if v_d <> '2027-10-01' then raise exception 'P5 failed: US history month = %', v_d; end if;

  -- every published observance has at least one date rule
  select count(*) into v_bad from public.observances o
  where o.status = 'published' and not exists (select 1 from public.observance_dates r where r.observance_id = o.id);
  if v_bad <> 0 then raise exception 'P6 failed: % published observances without a date rule', v_bad; end if;

  -- WAD and TDoR carry their founding milestone (Task 1 must have run first)
  select count(*) into v_bad from public.observances
  where slug in ('world-aids-day', 'transgender-day-of-remembrance') and founded_milestone_id is null;
  if v_bad <> 0 then raise exception 'P7 failed: founding milestone missing on % rows', v_bad; end if;

  -- 'idaho' alone must not match (the US state)
  if 'Idaho Pride Picnic' ~* (select '\m(' || array_to_string(match_terms, '|') || ')\M' from public.observances where slug = 'idahobit') then
    raise exception 'P8 failed: IDAHOBIT terms match the state of Idaho';
  end if;

  -- anon can read nothing it should not
  if has_function_privilege('anon', 'public.run_observance_link(text, timestamptz)', 'EXECUTE') then
    raise exception 'P9 failed: anon can execute the linker';
  end if;
  if has_table_privilege('anon', 'public.event_observances', 'INSERT') then
    raise exception 'P10 failed: anon can write event_observances';
  end if;
end $verify$;
```

- [ ] **Step 6: Run the guard**

Run: `npx vitest run src/lib/__tests__/observancesMigration.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Mutation-check the guard** (a green guard that cannot fail is worse than none)

For each mutation: apply it to a scratch copy, confirm the edit landed (`diff` shows exactly one changed line in the SQL, not a comment), point the test at the copy, run, expect FAIL, restore. Do NOT use `git checkout --` on uncommitted work.
1. `then 'linked' else 'review'` → `then 'linked' else 'linked'`
2. delete `and public.event_observances.method = 'auto'`
3. delete `and e.safety_gated`
4. delete the `revoke all on table public.event_observances …` line
5. control: add a comment line `-- then 'linked' else 'linked'` → must still PASS.

- [ ] **Step 8: Dry-run the migration on prod** (after Task 1's dry run, run BOTH files in one `execute_sql` call, Task 1 first, with `raise exception 'ROLLBACK DRY RUN';` appended)

Expected: error message exactly `ROLLBACK DRY RUN`. Any `P<n> failed` = fix the seed. Then confirm `select to_regclass('public.observances')` returns null (nothing committed).

- [ ] **Step 9: Lint the SQL**

Run: `node scripts/check-migration-sql.mjs && node scripts/check-migration-versions.mjs`
Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/*_observances.sql src/lib/__tests__/observancesMigration.test.ts
git commit -m "feat(observances): tables, date rules, two-signal linker (dry_run), seed"
```

---

### Task 3: Ship the migrations, then hand-read the proposals

**Files:** none (prod data work)

- [ ] **Step 1: Push and open the PR with Tasks 1–2** (the hub needs the tables live; shipping the DB half first is the safe order — the frontend half reads nothing until Task 7)

```bash
git push -u origin HEAD
gh pr create --title "Observances phase 1: schema, linker (dry-run), WAD milestone fix" --body "<summary + link to plan>"
```
Bind with `ccd_pr` tools, wait for checks, merge. After merge, verify by NAME:
```sql
select version, name from supabase_migrations.schema_migrations where name in ('observances','milestone_world_aids_day_merge_direction');
```
Expected: 2 rows. Then `curl -s -A Googlebot -o /dev/null -w '%{http_code}\n' https://queer.guide/history/1988-first-world-aids-day` → `200`.

- [ ] **Step 2: Run the full historical backfill in dry-run mode**

```sql
select public.run_observance_link('dry_run', null);
```
Expected: `by_status` has only `review`, roughly 150–250 rows. Record the runtime; if over 60 s, the nightly 400-day bound stays and the backfill is run only this once.

- [ ] **Step 3: Read every proposal**

```sql
select o.slug, e.title, e.start_date::date, e.city, eo.evidence->>'offset_days' off,
       eo.evidence->>'title_term' tt, eo.evidence->>'desc_term' dt, (eo.evidence->>'date_signal')::boolean ds
from event_observances eo join observances o on o.id = eo.observance_id join events e on e.id = eo.event_id
order by o.slug, ds desc, e.start_date;
```
For each row decide: correct link / wrong. Count per group:
- A: `ds = true` and `tt` set
- B: `ds = true`, `tt` null, `dt` set (description only)
- C: `ds = false` (review by design)

Acceptance: A must be ≥ 95 % correct. If B is below 90 %, auto-link must require the title signal — change the linker line to
`case when v_mode = 'full' and s.title_term is not null and s.date_sig then 'linked' else 'review' end`
in a follow-up migration before Step 5, and update the guard test regex to match.

- [ ] **Step 4: Tombstone the wrong ones**

```sql
update event_observances set status = 'rejected', method = 'human', updated_at = now()
where (event_id, observance_id) in (values ('<event uuid>'::uuid, '<observance uuid>'::uuid) /* , … */);
```

- [ ] **Step 5: Switch to full and promote**

```sql
update admin_automations set conditions = '{"mode":"full"}'::jsonb where slug = 'observance_link';
select public.run_observance_link('full', null);
```
Expected: `by_status.linked` ≈ group A (+B if kept), `rejected` = Step 4 count, nothing previously rejected changed:
```sql
select count(*) from event_observances where method = 'human' and status <> 'rejected';  -- 0
```

---

### Task 4: Pure window helper

**Files:**
- Create: `src/lib/observanceWindow.ts`
- Test: `src/lib/__tests__/observanceWindow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { eventWindow, type ObservanceDateRow } from '@/lib/observanceWindow';

const wad: ObservanceDateRow[] = [{ country_id: null, country_name: null, starts: '2026-12-01', ends: '2026-12-01' }];
const history: ObservanceDateRow[] = [
  { country_id: 'ca', country_name: 'Canada', starts: '2027-10-01', ends: '2027-10-31' },
  { country_id: 'gb', country_name: 'United Kingdom', starts: '2027-02-01', ends: '2027-02-28' },
];

describe('eventWindow', () => {
  it('pads a single day by the observance window', () => {
    expect(eventWindow(wad, 3, 3)).toEqual({ from: '2026-11-28', to: '2026-12-04' });
  });
  it('spans every regional rule (links already enforce each country window)', () => {
    expect(eventWindow(history, 0, 0)).toEqual({ from: '2027-02-01', to: '2027-10-31' });
  });
  it('returns null with no rules', () => {
    expect(eventWindow([], 3, 3)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/observanceWindow.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export interface ObservanceDateRow {
  country_id: string | null;
  country_name: string | null;
  starts: string; // YYYY-MM-DD
  ends: string;
}

function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Date range to fetch linked events for: earliest start − before … latest end + after. */
export function eventWindow(
  rows: ObservanceDateRow[],
  before: number,
  after: number,
): { from: string; to: string } | null {
  if (rows.length === 0) return null;
  const from = rows.map((r) => r.starts).sort()[0];
  const to = rows.map((r) => r.ends).sort().at(-1)!;
  return { from: shift(from, -before), to: shift(to, after) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/observanceWindow.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/observanceWindow.ts src/lib/__tests__/observanceWindow.test.ts
git commit -m "feat(observances): event window helper"
```

---

### Task 5: Data hooks

**Files:**
- Create: `src/hooks/useObservances.ts`

- [ ] **Step 1: Write the hooks**

```ts
// Observance reads. events RLS applies to the embedded join, so safety-gated events
// disappear for anon; observance_gated_count returns only how many were hidden.
import { useQuery } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import type { ObservanceDateRow } from '@/lib/observanceWindow';
import type { Database } from '@/integrations/supabase/types';

const HOUR = 60 * 60_000;
type EventRow = Database['public']['Tables']['events']['Row'];

export interface Observance {
  id: string;
  slug: string;
  name: string;
  kind: 'day' | 'month';
  tone: 'memorial' | 'awareness' | 'celebration';
  summary: string;
  body: string | null;
  founded_year: number | null;
  window_days_before: number;
  window_days_after: number;
  founded_milestone: { slug: string; title: string; date: string } | null;
}

export function useObservance(slug: string | undefined) {
  return useQuery({
    queryKey: ['observance', slug],
    enabled: !!slug,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedFrom('observances')
        .select(
          'id, slug, name, kind, tone, summary, body, founded_year, window_days_before, window_days_after, founded_milestone:milestones(slug, title, date)',
        )
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Observance | null;
    },
  });
}

export function useObservanceDates(observanceId: string | undefined) {
  return useQuery({
    queryKey: ['observance-dates', observanceId],
    enabled: !!observanceId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<ObservanceDateRow[]>('observance_next_dates', {
        p_observance_id: observanceId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useObservanceEvents(
  observanceId: string | undefined,
  window: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: ['observance-events', observanceId, window],
    enabled: !!observanceId && !!window,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await untypedFrom('event_observances')
        .select('event:events!inner(*)')
        .eq('observance_id', observanceId!)
        .eq('status', 'linked')
        .is('event.duplicate_of_id', null)
        .gte('event.start_date', `${window!.from}T00:00:00Z`)
        .lte('event.start_date', `${window!.to}T23:59:59Z`)
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as { event: EventRow }[])
        .map((r) => r.event)
        .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
    },
  });
}

export function useObservanceGatedCount(
  observanceId: string | undefined,
  window: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: ['observance-gated', observanceId, window],
    enabled: !!observanceId && !!window,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<number>('observance_gated_count', {
        p_observance_id: observanceId,
        p_from: window!.from,
        p_to: window!.to,
      });
      if (error) throw error;
      return data ?? 0;
    },
  });
}

export function useEventObservances(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-observances', eventId],
    enabled: !!eventId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedFrom('event_observances')
        .select('observance:observances!inner(slug, name)')
        .eq('event_id', eventId!)
        .eq('status', 'linked');
      if (error) throw error;
      return ((data ?? []) as { observance: { slug: string; name: string } }[]).map(
        (r) => r.observance,
      );
    },
  });
}
```

- [ ] **Step 2: Check the embedded-filter syntax against prod as anon** (PostgREST filters an aliased embed by the alias; confirm before building UI on it)

```bash
curl -s "https://xqeacpakadqfxjxjcewc.supabase.co/rest/v1/event_observances?select=event:events!inner(title,start_date)&status=eq.linked&event.start_date=gte.2025-11-01&limit=3" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```
Expected: JSON array of `{ "event": {…} }` with `start_date ≥ 2025-11-01`. If it errors with `PGRST100`, replace `event.` with `events.` in the four filter calls.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 (ratchet: no NEW errors).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useObservances.ts
git commit -m "feat(observances): data hooks"
```

---

### Task 6: Hub page

**Files:**
- Create: `src/pages/ObservanceDetail.tsx`
- Test: `src/pages/__tests__/ObservanceDetail.test.tsx`

- [ ] **Step 1: Write the failing render tests**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import ObservanceDetail from '@/pages/ObservanceDetail';

const hooks = vi.hoisted(() => ({
  useObservance: vi.fn(),
  useObservanceDates: vi.fn(),
  useObservanceEvents: vi.fn(),
  useObservanceGatedCount: vi.fn(),
}));
vi.mock('@/hooks/useObservances', () => hooks);
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/events/EventCard', () => ({
  EventCard: ({ event }: { event: { title: string } }) => <div data-testid="event-card">{event.title}</div>,
}));
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  useParams: () => ({ slug: 'transgender-day-of-remembrance' }),
}));

const base = {
  id: 'o1', slug: 'transgender-day-of-remembrance', name: 'Transgender Day of Remembrance',
  kind: 'day', summary: 'Held every 20 November.', body: null, founded_year: 1999,
  window_days_before: 7, window_days_after: 1, founded_milestone: null,
};

beforeEach(() => {
  hooks.useObservanceDates.mockReturnValue({
    data: [{ country_id: null, country_name: null, starts: '2026-11-20', ends: '2026-11-20' }],
  });
  hooks.useObservanceEvents.mockReturnValue({ data: [], isLoading: false });
  hooks.useObservanceGatedCount.mockReturnValue({ data: 0 });
});

describe('ObservanceDetail', () => {
  it('memorial tone: help link, no countdown', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'memorial' }, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByRole('heading', { level: 1, name: base.name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support/i })).toHaveAttribute('href', expect.stringContaining('/help'));
    expect(screen.queryByText(/in \d+ days/i)).toBeNull();
  });

  it('empty state is literal', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'memorial' }, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/No events listed for 2026 yet\./)).toBeInTheDocument();
  });

  it('groups events by country', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceEvents.mockReturnValue({
      isLoading: false,
      data: [
        { id: 'e1', title: 'Vigil Berlin', country: 'Germany', city: 'Berlin', start_date: '2026-11-20T18:00:00Z' },
        { id: 'e2', title: 'Vigil Zurich', country: 'Switzerland', city: 'Zurich', start_date: '2026-11-19T18:00:00Z' },
      ],
    });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByRole('heading', { level: 3, name: 'Germany' })).toBeInTheDocument();
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
  });

  it('gated notice shows a count only, no legal claim', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceGatedCount.mockReturnValue({ data: 4 });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/Sign in to see 4 more events/)).toBeInTheDocument();
    expect(screen.queryByText(/illegal|criminal/i)).toBeNull();
  });

  it('unknown slug renders not found', () => {
    hooks.useObservance.mockReturnValue({ data: null, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/__tests__/ObservanceDetail.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the page**

```tsx
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EventCard } from '@/components/events/EventCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  useObservance,
  useObservanceDates,
  useObservanceEvents,
  useObservanceGatedCount,
} from '@/hooks/useObservances';
import { eventWindow, type ObservanceDateRow } from '@/lib/observanceWindow';

function formatDate(iso: string, lang: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function dateLine(row: ObservanceDateRow, kind: 'day' | 'month', lang: string) {
  if (kind === 'month') {
    return new Date(`${row.starts}T12:00:00Z`).toLocaleDateString(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return formatDate(row.starts, lang);
}

function daysUntil(iso: string) {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - today) / 86_400_000);
}

export default function ObservanceDetail() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: obs, isLoading } = useObservance(slug);
  const { data: dates = [] } = useObservanceDates(obs?.id);
  const win = useMemo(
    () => (obs ? eventWindow(dates, obs.window_days_before, obs.window_days_after) : null),
    [obs, dates],
  );
  const { data: events = [], isLoading: eventsLoading } = useObservanceEvents(obs?.id, win);
  const { data: gated = 0 } = useObservanceGatedCount(obs?.id, win);

  const byCountry = useMemo(() => {
    const groups = new Map<string, typeof events>();
    for (const e of events) {
      const key = e.country || t('observances.unknownCountry', 'Location not listed');
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [events, t]);

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-12 w-2/3" />
      </PageContainer>
    );
  }
  if (!obs) {
    return (
      <PageContainer>
        <h1>{t('observances.notFound', 'Observance not found')}</h1>
      </PageContainer>
    );
  }

  const primary = dates[0];
  const year = primary?.starts.slice(0, 4) ?? String(new Date().getUTCFullYear());
  const lang = i18n.language || 'en';
  const until = primary ? daysUntil(primary.starts) : null;

  return (
    <>
      <PageContainer as="header" size="reading" className="pb-6">
        <Eyebrow variant="kicker">{t(`observances.kind.${obs.kind}`, obs.kind === 'day' ? 'Awareness day' : 'Awareness month')}</Eyebrow>
        <h1 className="mt-2">{obs.name}</h1>
        {dates.length > 0 && (
          <ul className="m-0 mt-4 list-none space-y-1 p-0 text-title font-bold">
            {dates.map((d) => (
              <li key={d.country_id ?? 'global'}>
                {d.country_name ? `${d.country_name}: ` : ''}
                {dateLine(d, obs.kind, lang)}
              </li>
            ))}
          </ul>
        )}
        {obs.tone !== 'memorial' && until !== null && until > 0 && (
          <p className="mt-1 text-13 text-muted-foreground">
            {t('observances.inDays', 'in {{count}} days', { count: until })}
          </p>
        )}
        <p className="mt-4 text-body-lg">{obs.summary}</p>
        {obs.tone === 'memorial' && (
          <p className="mt-4 text-15">
            <LocalizedLink to="/help">{t('observances.support', 'Need support? Crisis and support lines')}</LocalizedLink>
          </p>
        )}
      </PageContainer>

      <PageContainer as="section" flush className="pb-12" aria-labelledby="obs-events">
        <h2 id="obs-events" className="text-headline">
          {t('observances.thisYear', '{{year}} events', { year })}
        </h2>
        {!user && gated > 0 && (
          <p className="mt-2 text-15">
            <LocalizedLink to="/auth">
              {t('observances.gated', 'Sign in to see {{count}} more events.', { count: gated })}
            </LocalizedLink>
          </p>
        )}
        {eventsLoading ? (
          <Skeleton className="mt-6 h-40 w-full" />
        ) : events.length === 0 ? (
          <p className="mt-4">
            {t('observances.empty', 'No events listed for {{year}} yet.', { year })}{' '}
            <LocalizedLink to="/submit">{t('observances.submit', 'Submit an event')}</LocalizedLink>
          </p>
        ) : (
          byCountry.map(([country, list]) => (
            <section key={country} className="mt-8">
              <h3 className="text-title font-bold">{country}</h3>
              <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          ))
        )}
      </PageContainer>

      {(obs.body || obs.founded_milestone) && (
        <PageContainer as="section" size="reading" className="pb-12">
          <h2 className="text-headline">{t('observances.about', 'About')}</h2>
          {obs.body && <p className="mt-4 whitespace-pre-line">{obs.body}</p>}
          {obs.founded_milestone && (
            <p className="mt-4">
              <LocalizedLink to={`/history/${obs.founded_milestone.slug}`}>
                {obs.founded_milestone.date.slice(0, 4)} · {obs.founded_milestone.title}
              </LocalizedLink>
            </p>
          )}
        </PageContainer>
      )}
    </>
  );
}
```

Before writing: confirm `/submit` and `/auth` exist in `src/routes.tsx` (`grep -n 'path="submit\|path="auth' src/routes.tsx`); use whatever path the event submission and sign-in routes actually have.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/__tests__/ObservanceDetail.test.tsx`
Expected: PASS (5).

- [ ] **Step 5: Lint**

Run: `npx eslint src/pages/ObservanceDetail.tsx src/hooks/useObservances.ts src/lib/observanceWindow.ts`
Expected: no errors (no raw colours, spacing on the even scale, `PageContainer` used — `queerguide/no-hand-rolled-page-wrapper`).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ObservanceDetail.tsx src/pages/__tests__/ObservanceDetail.test.tsx
git commit -m "feat(observances): /days/:slug hub page"
```

---

### Task 7: Route + edge manifest

**Files:**
- Modify: `src/routes.tsx` (lazy imports near line 27; routes near line 696)
- Modify: `functions/_lib/appRoutes.json` (generated)

- [ ] **Step 1: Add the lazy import** next to `const GuideDetail = lazyRetry(...)`

```tsx
const ObservanceDetail = lazyRetry(() => import('./pages/ObservanceDetail'));
```

- [ ] **Step 2: Add the route** directly after `<Route path="events/:slug" element={<EventDetail />} />`

```tsx
          <Route path="days/:slug" element={<ObservanceDetail />} />
```

- [ ] **Step 3: Regenerate the edge route manifest** (without this, a direct load of `/days/world-aids-day` is an edge hard-404)

Run: `node scripts/agent-route-manifest.mjs && node scripts/agent-route-manifest.mjs --check`
Expected: `appRoutes.json` gains `"/days/:slug"`; `--check` exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/routes.tsx functions/_lib/appRoutes.json
git commit -m "feat(observances): route /days/:slug"
```

---

### Task 8: Event detail chip

**Files:**
- Create: `src/components/events/EventObservanceChip.tsx`
- Modify: `src/pages/EventDetail.tsx` (inside `body={<>…` just before `<SafetyAlertBanner`)

- [ ] **Step 1: Write the component**

```tsx
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useEventObservances } from '@/hooks/useObservances';

export function EventObservanceChip({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { data = [] } = useEventObservances(eventId);
  if (data.length === 0) return null;
  return (
    <p className="m-0 mb-4 text-15">
      {data.map((o, i) => (
        <span key={o.slug}>
          {i > 0 && ' · '}
          <LocalizedLink to={`/days/${o.slug}`}>
            {t('observances.partOf', 'Part of {{name}}', { name: o.name })}
          </LocalizedLink>
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 2: Mount it**

```tsx
import { EventObservanceChip } from '@/components/events/EventObservanceChip';
```
and as the first child of the `body` fragment:
```tsx
            <EventObservanceChip eventId={event.id} />
```

- [ ] **Step 3: Run the event detail tests** (a new `useQuery` in a bare-rendered component breaks suites that mock at the module boundary)

Run: `npx vitest run src/pages/__tests__ src/components/events`
Expected: PASS. If an EventDetail suite fails with "No QueryClient set", add `vi.mock('@/hooks/useObservances', () => ({ useEventObservances: () => ({ data: [] }) }))` to that suite — do not add a provider.

- [ ] **Step 4: Commit**

```bash
git add src/components/events/EventObservanceChip.tsx src/pages/EventDetail.tsx src/pages/__tests__
git commit -m "feat(observances): 'Part of <day>' chip on event detail"
```

---

### Task 9: Prod check, docs, ship

**Files:**
- Create: `e2e/observances.spec.ts`
- Modify: `docs/plans/2026-11-22-observances-design.md` (deltas table from this plan's header)
- Modify: `CLAUDE.md` (one short entry under Architecture)

- [ ] **Step 1: Write the e2e** (absence assertions need positive controls, or an empty page passes)

```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } }); // anon, in CI and locally

test('World AIDS Day hub renders linked events', async ({ page }) => {
  await page.goto('/days/world-aids-day');
  await expect(page.getByRole('heading', { level: 1, name: 'World AIDS Day' })).toBeVisible();
  // positive control: the hub actually loaded data
  await expect(page.getByText(/1 December/)).toBeVisible();
  // memorial tone
  await expect(page.getByRole('link', { name: /support/i })).toBeVisible();
  await expect(page.getByText(/in \d+ days/)).toHaveCount(0);
});

test('direct load is not an edge 404', async ({ request }) => {
  const res = await request.get('/days/transgender-day-of-remembrance');
  expect(res.status()).toBe(200);
});

test('unknown observance shows not found, and the control route does not', async ({ page }) => {
  await page.goto('/days/not-a-real-day');
  await expect(page.getByText(/not found/i)).toBeVisible();
  await page.goto('/days/coming-out-day');
  await expect(page.getByText(/not found/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Update the spec doc** — paste the deltas table from this plan's header under a `## Phase 1 deltas` heading in `docs/plans/2026-11-22-observances-design.md`, and correct its "Problem" bullet on milestones (published-into-draft merge; TDoR row is year-precision, not a defect).

- [ ] **Step 3: Add the CLAUDE.md entry** under Architecture:

```markdown
**Observances (annual awareness days, 2026-11):** `observances` + `observance_dates` (per-country rules: fixed / month / nth_weekday; country rule beats global) + `event_observances` (link + evidence). ONE date implementation, `observance_rule_range()`, feeds the linker, `observance_next_dates()` and the migration postconditions. Nightly `observance_link` (`25 3 * * *`) links an event only when it NAMES the day AND starts inside the window for its own country; name-only → `review`, date-only → nothing, `rejected` is a tombstone. Lever: `admin_automations.conditions.mode` dry_run|full. Hub `/days/:slug` reads events through events RLS (gated rows vanish for anon); `observance_gated_count()` is aggregate-only. Design + phases: `docs/plans/2026-11-22-observances-design.md`.
```

- [ ] **Step 4: Full local gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all exit 0.

- [ ] **Step 5: Push, PR, merge** (frontend half)

```bash
git add e2e/observances.spec.ts docs/plans/2026-11-22-observances-design.md CLAUDE.md
git commit -m "test(observances): prod e2e; docs"
git push
gh pr create --title "Observances phase 1: /days hub + event chip" --body "<summary>"
```
Bind with `ccd_pr`, wait for checks, merge.

- [ ] **Step 6: Verify on prod after the Pages deploy** (check `https://queer.guide/build-id.txt` matches the merge SHA first)

Run: `npx playwright test e2e/observances.spec.ts`
Expected: 3 passed. Then open `https://queer.guide/days/world-aids-day` in the browser pane, screenshot, and send it to the user.

---

### Task 10: Propose the follow-ups as sessions (do not do them here)

- [ ] **Step 1:** Start an `own_initiative` session: "Milestones merged into drafts" — 3 more published milestones redirect to draft keepers (`1867-karl-heinrich-ulrichs-calls-for-repeal…`, `1867-karl-heinrich-ulrichs-defends…` → `ulrichs-erste-rede-1867-08-29`; `1897-magnus-hirschfeld-founds…` → `whk-hirschfeld-1897`), and the dedup sweep's keep selection for milestones ignores `status`. Fix the keep rule first, then repair the rows (the two Ulrichs rows are near-duplicates of each other, so un-merging both re-creates a pair).
- [ ] **Step 2:** Start an `own_initiative` session: "Observances Phase 2" — `/days` index, news linking, Past years, `/events` facet, homepage slot, crawler branch + `sitemap-days.xml`, map, a triage source for `event_observances.status='review'` (otherwise the review rows accumulate with nobody reading them), `observance_signals()` sentinel.

---

## Self-review

- **Spec coverage (Phase 1):** tables ✓ T2 · seed incl. regional ✓ T2 · milestone fix ✓ T1 (corrected) · linker two-signal + tombstone ✓ T2 · dry-run then hand-read ✓ T3 · minimal hub (masthead, this year, about) ✓ T6 · EventDetail chip ✓ T8 · tone rules (memorial: no countdown, /help) ✓ T6 · no TDoR names list ✓ (nothing builds one) · gated count, no row leak ✓ T2/T6 · checks: guard ✓ T2, e2e ✓ T9. Sentinel `observance_signals()` and coverage radar are Phase 2/3 (T10).
- **Placeholders:** source `checked` dates are filled from Task 2 Step 1; `<event uuid>` values come from the Task 3 hand-read — both are data the executor produces, not missing design.
- **Names:** `run_observance_link(text, timestamptz)`, `observance_rule_range`, `observance_occurrence`, `observance_next_dates`, `observance_gated_count`, hooks `useObservance / useObservanceDates / useObservanceEvents / useObservanceGatedCount / useEventObservances`, `eventWindow` — consistent across tasks.
