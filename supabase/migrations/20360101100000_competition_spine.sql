-- Queer competition spine: competitions, editions, entrants, episodes, results.
--
-- TWO DOMAINS, ONE SPINE
--
-- This holds both halves of competitive queer performance culture:
--
--   kind='drag_race'  the Drag Race television franchises — US, All Stars, UK,
--                     Canada, España, Down Under, Philippines, Thailand and the
--                     rest, ~113 seasons across 22 series.
--   kind='pageant'    the titleholder circuit — International Mr. Leather,
--                     Miss Continental, Miss Gay America, Mr Gay World,
--                     Mr Gay Europe, MIR, Miss International Queen, Miss T
--                     World, Miss Star International, Miss Fabulous Thailand,
--                     Mr. Gay India.
--
-- They are one schema because they are one shape: a competition runs editions,
-- an edition has entrants, an entrant places. The pageants are OLDER than the
-- television — IML since 1979, Miss Gay America since 1972 — and modelling them
-- as a lesser sibling of a TV show would invert the actual history.
--
-- The only asymmetry is the episode grid: a TV season has episodes and
-- per-episode outcomes, a pageant is decided in one night. So
-- `competition_episodes` / `competition_episode_results` simply have no rows for
-- a pageant edition, rather than the schema growing a second set of tables that
-- would duplicate every join. `competitions.kind` is what a reader (and the UI)
-- uses to know which surfaces apply.
--
-- WHY THIS EXISTS
--
-- `docs/architecture/open-data-integration.md` §1.8 records the gap verbatim:
-- "There is no performer entity ... the only person table is `personalities`, an
-- encyclopedia — 'performer' appears there as a *profession* value." That is
-- still true and this migration does not change it. What it adds is the missing
-- half: the *competition* a performer appeared in.
--
-- The people are already here. 776 personalities carry a drag profession, 521
-- with a `wikidata_qid`, 718 with a resolved `city_id`. Spot-checked before
-- writing this: 19 of 20 famous US queens and 20 of 21 international winners
-- already exist as rows. So this is a join, not an import of people, and
-- `competition_entrants.personality_id` is the join.
--
-- The data is already parsed, too, and then thrown away.
-- `scripts/data-quality/import-dragrace-contestants.mjs` (PR #1698) walks every
-- franchise season page on Wikipedia and builds
-- `rec.appearances = [{ franchise, season, outcome }]` per queen — then flattens
-- it into a prose `bio` string via `buildBio()` and discards the structure.
-- These tables are where that structure lands.
--
-- THE GRAIN IS AN APPEARANCE, NOT A PERSON
--
-- A `competition_entrants` row is one queen in one season. Shangela (S2, S3),
-- Eureka (S9, S10), Vanjie (S10, S11) and every All Stars returnee occupy
-- several rows pointing at one `personalities.id`. This is deliberate and it is
-- what reconciles the two numbers Wikipedia publishes for the US main series:
-- 242 season *slots* against ~238 unique *people*. Counting rows answers the
-- first question; counting distinct `personality_id` answers the second. A
-- schema that could only answer one of them would be wrong for the other.
--
-- WINNER / RUNNER-UP / MISS CONGENIALITY LIVE ON THE CONTESTANT, NEVER THE SEASON
--
-- The obvious design — three FK columns on `competition_editions` — cannot represent
-- this corpus, and the failure is not hypothetical:
--   * Seasons 4, 5, 6, 7, 8, 10 and 12 each have TWO runners-up (top-3 finales).
--   * Season 16 is the first-ever Miss Congeniality TIE — Sapphira Cristál and
--     Xunami Muse, $10k each.
--   * Sapphira Cristál is simultaneously runner-up AND Miss Congeniality. So is
--     season 1's Nina Flowers.
-- Three booleans on the appearance row represent all of it without a special
-- case, and "who won season N" is an index scan rather than a join.
--
-- OUTCOME IS NORMALISED; THE SOURCE CODE IS KEPT BESIDE IT
--
-- The progress-table vocabulary drifts per season and per franchise. Season 17
-- alone emits WIN, TOP2, SAFE, BDT (Badonka Dunk Tank), BTM, ELIM, LOSS
-- (LaLaPaRuza) and Guest. Across ~24 franchises there is no stable closed set.
--
-- So `outcome` is OUR six-value ordinal ladder plus one non-ordinal marker, and
-- `outcome_raw` preserves whatever the source actually said. Normalising is what
-- lets 24 franchises share one legend and one colour scale; keeping the raw code
-- is what lets fidelity be raised later without re-scraping Wikipedia.
--
-- `guest` is the seventh value and is deliberately NOT on the ladder: a queen
-- returning to judge or cameo is present in the episode but not competing in it,
-- which is a different fact from placing badly. `competition_outcome_rank()` returns
-- NULL for it so it can never be averaged into a placement statistic.
--
-- ABSENCE IS NOT A VALUE. No row for (contestant, episode) means she was not in
-- that episode — already eliminated, or not yet arrived. That must render
-- differently from `elim`, which is the episode she went home IN. See
-- `src/components/rights/StatusGlyph.tsx`, which already distinguishes "recorded
-- as absent" from "we hold no data" for exactly this reason.
--
-- NO SAFETY GATING HERE, AND THAT IS A DECISION
--
-- Venues, events and organizations carry `safety_gated` because a physical
-- address in a criminalising country is a physical risk. These rows are
-- television credits about public figures, and `personalities` — which already
-- holds every one of these people — is not gated either. Adding a gate here
-- would hide a Thai queen's television career from readers in Thailand while
-- her personality page stayed public, which is incoherent rather than safer.
--
-- REAL NAMES ARE OUT OF SCOPE AND THERE IS NO COLUMN FOR THEM.
-- Wikipedia does not carry them as a field, many queens deliberately withhold
-- them, and on this platform that field is an outing risk, not a missing value.
-- The absence of the column is the enforcement.

-- ---------------------------------------------------------------------------
-- Shared updated_at touch (one function for the five tables rather than five
-- identical copies; same shape as milestones_touch_updated_at).
-- ---------------------------------------------------------------------------
create or replace function public.competition_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Competitions (a television franchise OR a titleholder pageant)
-- ---------------------------------------------------------------------------
create table if not exists public.competitions (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  kind                text not null default 'drag_race',
  country_id          uuid references public.countries(id) on delete set null,
  -- Broadcaster for a TV franchise; NULL for a pageant, which has an organizer
  -- instead. Both columns are nullable because neither domain has the other's.
  network             text,
  organizer           text,
  -- All Stars / "vs the World" hang off their parent franchise so the UI can
  -- group "everything Canadian" without string-matching the name. Pageants use
  -- it for national qualifiers feeding an international final.
  parent_competition_id uuid references public.competitions(id) on delete set null,
  sort_order          integer not null default 100,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint competitions_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  constraint competitions_kind_check check (kind = any (array['drag_race', 'pageant']))
);

comment on table public.competitions is
  'One row per competition: a Drag Race television franchise, or a titleholder pageant (International Mr. Leather, Miss Continental, Mr Gay World, ...).';
comment on column public.competitions.kind is
  'drag_race | pageant. Decides whether editions carry an episode grid (a pageant has none) and how an edition is labelled - "Season 18" vs "2024".';
comment on column public.competitions.parent_competition_id is
  'All Stars / "vs the World" variants point at the parent series so a franchise family can be grouped without name matching.';

create index if not exists idx_competitions_parent on public.competitions (parent_competition_id);
create index if not exists idx_competitions_country on public.competitions (country_id);

-- ---------------------------------------------------------------------------
-- Editions (a TV season, or a pageant year)
--
-- `edition_number` is the season number for a franchise and the YEAR for a
-- pageant — "Miss Continental 2024" is edition 2024. One integer serves both
-- because both are a monotonic label the reader sorts by, and a pageant year is
-- never ambiguous the way a season number would be. `title` carries the human
-- form so no surface has to reconstruct it.
-- ---------------------------------------------------------------------------
create table if not exists public.competition_editions (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  edition_number  integer,
  title           text not null,
  slug            text not null unique,
  -- The episode count the SOURCE states. The number of competition_episodes rows
  -- we actually parsed is derived separately; keeping both makes a parse gap
  -- visible instead of silently reporting a short season. Always NULL for a
  -- pageant, which has no episodes.
  episode_count   integer,
  first_aired     date,
  last_aired      date,
  network         text,
  -- Where a pageant edition was held. Meaningless for a TV season and left NULL
  -- there; it is what puts the pageant circuit on the map.
  host_city_id    uuid references public.cities(id) on delete set null,
  host_country_id uuid references public.countries(id) on delete set null,
  status          text not null default 'aired',
  seo_indexable   boolean not null default true,
  duplicate_of_id uuid references public.competition_editions(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint competition_editions_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  constraint competition_editions_status_check check (status = any (array['aired', 'airing', 'announced'])),
  constraint competition_editions_dates_ordered check (last_aired is null or first_aired is null or last_aired >= first_aired)
);

comment on table public.competition_editions is
  'One row per season of a TV franchise or per year of a pageant. Winner / runners-up / Miss Congeniality are NOT here - they are flags on competition_entrants, because several seasons have two runners-up and US season 16 has a Miss Congeniality tie.';
comment on column public.competition_editions.edition_number is
  'Season number for a franchise; the YEAR for a pageant (Miss Continental 2024 = 2024).';
comment on column public.competition_editions.episode_count is
  'Episode count as stated by the source. Compare against count(competition_episodes) to detect an incomplete parse. NULL for pageants.';
comment on column public.competition_editions.status is
  'aired | airing | announced. An announced edition has no results and is excluded from the placement grid.';

create unique index if not exists competition_editions_number_uniq
  on public.competition_editions (competition_id, edition_number)
  where edition_number is not null;
create index if not exists idx_competition_editions_competition on public.competition_editions (competition_id);
create index if not exists idx_competition_editions_first_aired on public.competition_editions (first_aired);
create index if not exists idx_competition_editions_host_city on public.competition_editions (host_city_id);

-- ---------------------------------------------------------------------------
-- Contestants (one row per queen per season)
-- ---------------------------------------------------------------------------
create table if not exists public.competition_entrants (
  id                       uuid primary key default gen_random_uuid(),
  edition_id                uuid not null references public.competition_editions(id) on delete cascade,
  -- Nullable on purpose. A null link is recoverable; a WRONG link publishes one
  -- queen's biography under another's name. Readers must follow duplicate_of_id
  -- on the personality side - 5 of the 776 drag personalities are merge targets.
  personality_id           uuid references public.personalities(id) on delete set null,
  stage_name                text not null,
  age_at_filming           integer,
  hometown_text            text,
  city_id                  uuid references public.cities(id) on delete set null,
  placement                integer,
  placement_label          text,
  is_winner                boolean not null default false,
  is_runner_up             boolean not null default false,
  is_miss_congeniality     boolean not null default false,
  challenge_wins           integer not null default 0,
  lip_syncs                integer not null default 0,
  returning_from_edition_id uuid references public.competition_editions(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint competition_entrants_age_sane check (age_at_filming is null or (age_at_filming between 15 and 99)),
  constraint competition_entrants_placement_sane check (placement is null or placement >= 1),
  constraint competition_entrants_winner_is_first check (not is_winner or placement is null or placement = 1)
);

comment on table public.competition_entrants is
  'One row per queen per season - an APPEARANCE, not a person. A returning queen has several rows pointing at one personalities.id; that is what reconciles 242 US season slots against ~238 unique people.';
comment on column public.competition_entrants.personality_id is
  'Nullable link to the encyclopedia row. Prefer null to a guess: a wrong link publishes the wrong biography.';
comment on column public.competition_entrants.is_miss_congeniality is
  'A flag, not a season-level FK: season 16 has TWO (Sapphira Cristal + Xunami Muse), and Sapphira is simultaneously runner-up.';
comment on column public.competition_entrants.placement_label is
  'The source''s own words ("Winner", "Runner-up", "4th place", "Guest"). placement is the ordinal where one could be derived.';

create unique index if not exists competition_entrants_season_name_uniq
  on public.competition_entrants (edition_id, lower(stage_name));
create index if not exists idx_competition_entrants_personality on public.competition_entrants (personality_id);
create index if not exists idx_competition_entrants_season on public.competition_entrants (edition_id);
create index if not exists idx_competition_entrants_city on public.competition_entrants (city_id);
create index if not exists idx_competition_entrants_winner on public.competition_entrants (edition_id) where is_winner;

-- ---------------------------------------------------------------------------
-- Episodes
-- ---------------------------------------------------------------------------
create table if not exists public.competition_episodes (
  id             uuid primary key default gen_random_uuid(),
  edition_id      uuid not null references public.competition_editions(id) on delete cascade,
  episode_number integer not null,
  title          text,
  air_date       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint competition_episodes_number_positive check (episode_number >= 1)
);

comment on table public.competition_episodes is
  'One row per episode. Exists so per-episode results have something to hang on and so the grid axis is a real ordered entity rather than an integer column.';

create unique index if not exists competition_episodes_season_number_uniq
  on public.competition_episodes (edition_id, episode_number);

-- ---------------------------------------------------------------------------
-- Per-episode results
-- ---------------------------------------------------------------------------
create table if not exists public.competition_episode_results (
  id            uuid primary key default gen_random_uuid(),
  entrant_id uuid not null references public.competition_entrants(id) on delete cascade,
  episode_id    uuid not null references public.competition_episodes(id) on delete cascade,
  outcome       text not null,
  outcome_raw   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint competition_episode_results_outcome_check check (outcome = any (array[
    'win', 'high', 'safe', 'low', 'bottom', 'elim', 'guest']))
);

comment on table public.competition_episode_results is
  'Per-episode outcome. ABSENCE OF A ROW MEANS NOT IN THAT EPISODE (already out, or not yet arrived) and must render differently from "elim", which is the episode she went home in.';
comment on column public.competition_episode_results.outcome is
  'Our normalised vocabulary. Six ordinal states (win > high > safe > low > bottom > elim) plus non-ordinal "guest". Never the source string - see outcome_raw.';
comment on column public.competition_episode_results.outcome_raw is
  'Whatever the source actually said (TOP2, BDT, LOSS, WINNER, ...). Kept so fidelity can be raised later without re-scraping.';

create unique index if not exists competition_episode_results_pair_uniq
  on public.competition_episode_results (entrant_id, episode_id);
create index if not exists idx_competition_episode_results_episode on public.competition_episode_results (episode_id);

-- ---------------------------------------------------------------------------
-- Ordinal rank for the six competing states. NULL for 'guest' - a guest is not
-- on the ladder and must never be averaged into a placement statistic.
-- IMMUTABLE so it can back an index later.
-- ---------------------------------------------------------------------------
create or replace function public.competition_outcome_rank(p_outcome text)
returns int language sql immutable parallel safe as $$
  select case p_outcome
    when 'win'    then 1
    when 'high'   then 2
    when 'safe'   then 3
    when 'low'    then 4
    when 'bottom' then 5
    when 'elim'   then 6
    else null end;
$$;

comment on function public.competition_outcome_rank(text) is
  'Ordinal position of a competing outcome, best first. Returns NULL for "guest" (not competing) and for anything unrecognised.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['competitions', 'competition_editions', 'competition_entrants',
                           'competition_episodes', 'competition_episode_results']
  loop
    execute format('drop trigger if exists trg_%1$s_touch_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_touch_updated_at before update on public.%1$s
         for each row execute function public.competition_touch_updated_at()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants.
--
-- A GRANT without a policy is inert and a policy without a GRANT is unreachable
-- (20260902100000, 20260906100000) - both halves below, and every write stays
-- with the service role that runs the importer.
--
-- Default privileges in this project arm anon/authenticated on new tables
-- (20260816090000), so the revoke is not decorative. check-api-role-table-grants
-- fails if anon or authenticated ever holds TRUNCATE / TRIGGER / REFERENCES.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['competitions', 'competition_editions', 'competition_entrants',
                           'competition_episodes', 'competition_episode_results']
  loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists %1$s_public_read on public.%1$s', t);
    execute format('create policy %1$s_public_read on public.%1$s for select to public using (true)', t);
    execute format('grant select on public.%1$s to anon, authenticated', t);
    execute format('grant all on public.%1$s to service_role', t);
    execute format('revoke insert, update, delete, truncate, references, trigger
                      on public.%1$s from anon, authenticated', t);
  end loop;
end
$$;

grant execute on function public.competition_outcome_rank(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verify: prove the constraints this migration exists to establish actually
-- fire, with a positive control for each. An assertion that only checks the
-- happy path passes on a table with no constraints at all.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_f uuid; v_s uuid; v_c uuid; v_e uuid; v_n int;
begin
  insert into public.competitions (slug, name) values ('verify-fixture', 'Verify Fixture')
    returning id into v_f;
  insert into public.competition_editions (competition_id, edition_number, title, slug)
    values (v_f, 1, 'Verify Season', 'verify-fixture-1') returning id into v_s;
  insert into public.competition_entrants (edition_id, stage_name) values (v_s, 'Verify Queen')
    returning id into v_c;
  insert into public.competition_episodes (edition_id, episode_number) values (v_s, 1)
    returning id into v_e;

  -- 1. The outcome vocabulary must reject a raw source code.
  begin
    insert into public.competition_episode_results (entrant_id, episode_id, outcome)
      values (v_c, v_e, 'BDT');
    raise exception 'competition_episode_results: raw source code was accepted as an outcome';
  exception when check_violation then null;
  end;

  -- Positive control: the normalised value must be accepted, or test 1 would
  -- also pass on a column that rejects everything.
  insert into public.competition_episode_results (entrant_id, episode_id, outcome, outcome_raw)
    values (v_c, v_e, 'bottom', 'BDT');

  -- 2. One result per (contestant, episode).
  begin
    insert into public.competition_episode_results (entrant_id, episode_id, outcome)
      values (v_c, v_e, 'safe');
    raise exception 'competition_episode_results: duplicate (contestant, episode) was accepted';
  exception when unique_violation then null;
  end;

  -- 3. Two queens with the same name in one season is a parse error, not data.
  begin
    insert into public.competition_entrants (edition_id, stage_name) values (v_s, 'verify queen');
    raise exception 'competition_entrants: case-variant duplicate name in one season was accepted';
  exception when unique_violation then null;
  end;

  -- 4. A winner cannot be placed anywhere but first.
  begin
    insert into public.competition_entrants (edition_id, stage_name, is_winner, placement)
      values (v_s, 'Impossible Queen', true, 4);
    raise exception 'competition_entrants: a winner placed 4th was accepted';
  exception when check_violation then null;
  end;

  -- 5. guest is off the ordinal ladder; the six competing states are on it.
  if public.competition_outcome_rank('guest') is not null then
    raise exception 'competition_outcome_rank: guest must not have an ordinal rank';
  end if;
  if public.competition_outcome_rank('win') <> 1 or public.competition_outcome_rank('elim') <> 6 then
    raise exception 'competition_outcome_rank: ordinal ladder is wrong';
  end if;

  -- 5b. `kind` is a closed vocabulary, and BOTH members must be accepted — a
  --     CHECK that rejects 'pageant' would silently confine this spine to
  --     television and there would be nothing to notice it.
  begin
    insert into public.competitions (slug, name, kind) values ('verify-bad-kind', 'X', 'tv_show');
    raise exception 'competitions: an unknown kind was accepted';
  exception when check_violation then null;
  end;
  insert into public.competitions (slug, name, kind, organizer)
    values ('verify-pageant', 'Verify Pageant', 'pageant', 'Verify Org');
  delete from public.competitions where slug = 'verify-pageant';

  -- 6. Cascade: dropping the franchise must take the whole subtree with it,
  --    otherwise the fixture below would leak into the seeded corpus.
  delete from public.competitions where id = v_f;

  select count(*) into v_n from public.competition_editions where competition_id = v_f;
  if v_n <> 0 then raise exception 'competition_editions: % row(s) survived the franchise delete', v_n; end if;
  select count(*) into v_n from public.competition_episode_results where entrant_id = v_c;
  if v_n <> 0 then raise exception 'competition_episode_results: % row(s) survived the cascade', v_n; end if;

  select count(*) into v_n from public.competitions;
  if v_n <> 0 then raise exception 'competitions: table should be empty after verify, has %', v_n; end if;
end
$verify$;
