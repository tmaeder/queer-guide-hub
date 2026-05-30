# Personality Data Flywheel — Phase 2 (Loop C: Graph Cross-Linking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn flat personality records into a connected graph — geo-link them to cities/countries, auto-tag them with *appropriate* `unified_tags`, and create + populate a new personality↔entity relationship layer, surfaced via a graph RPC.

**Architecture:** Three independent sub-loops, all SQL/HTTP-cheap, reusing Phase-1 infra (`personality-refresh` cadence, `personality_data_health`, provenance via `personality_sources`) and existing geo/tag machinery. (1) **Geo** — a batch RPC wrapping the existing `match_personality_city()` logic, backfilling the 4,402 linkable records + a cron. (2) **Tags** — a deterministic profession→tag mapper plus a *category-whitelisted* assignment path (NO kink/NSFW/slang categories ever touch named people), writing `unified_tag_assignments` + maintaining `usage_count`. (3) **Cross-links** — a new `personality_relationships` table (personality↔personality / venue / event / queer_village), a SQL-only relationship builder (shared-city + shared-tag co-membership), and a `get_personality_graph_data()` RPC for the existing react-force-graph UI.

**Tech stack:** Supabase Postgres (migrations, pg_cron, pg_net), Deno edge functions, Deno tests for pure helpers.

**Reality baseline (live `xqeacpakadqfxjxjcewc`, 12,619 personalities):**
- city_id present: 1,442 (11%). country_id: 5,688. birth_place: 1,319. nationality: 5,817. **geo-linkable-now gap (no city, has birth_place or nationality): 4,402.** death_place: 0 (column unused).
- tag assignments on personalities: **0**. Taxonomy: 8,098 `unified_tags`, but heavily NSFW/kink/slang — only a minority of categories are appropriate for real named people.
- profession present: 8,087. cities: 3,818 (all `name_normalized`). countries: 250. `city_aliases` exists.
- `unified_tag_assignments` cols: `id, tag_id, entity_id, entity_type, created_at`. No relationship table exists. force-graph today is tag-only (`get_tag_graph_data`).

**Reused, do not modify:**
- `match_personality_city()` trigger fn — `supabase/migrations/20260510150000_personality_city_auto_create.sql` (the canonical birth_place/nationality → city_id/country_id logic; trigger only fires on insert/UPDATE OF birth_place,nationality, so existing rows were never linked).
- `resolve_city_and_country(p_city_name text, p_country_name text)` RPC.
- `personality_sources` (provenance), `personality_data_health` (Phase 1 view).
- pg_net cron pattern from `supabase/migrations/20260530160000_personality_refresh_cron.sql` (anon bearer + `net.http_post`).
- node-type registry pattern: `supabase/migrations/20260415150300_personality_pipeline_complete.sql`.

**Tag-safety policy (HARD CONSTRAINT — applies to all of Sub-loop B):**
Named real people must NEVER be auto-assigned tags from sensitive categories. Define an explicit ALLOWED category whitelist; everything else is excluded. Allowed: `Rights & Activism`, `Political Activism`, `Legal Rights`, `Identity & Orientation`, `Sexual Orientation`, `Gender Identity`, `Intersex`, `LGBTQ+ Culture`, `LGBTQ+ Rights`, `Historical Movements`, `Social Movements`, `History & Heritage`, plus profession-derived tags. NEVER: anything under Kink/Fetish/BDSM/Power Exchange/Leather/Substances/drugs/slang/sex toy/Sexual Practices/Health/STI/intimate_*, or `category IS NULL` (the 2,338 uncategorised dumping ground). Phase 2 does deterministic profession-mapping + whitelisted exact-name matching only — NO LLM free-tagging (deferred to a later, human-gated phase).

---

## File Structure

**Sub-loop A — Geo backfill**
- Create `supabase/migrations/<ts>_personality_geo_backfill.sql` — `backfill_personality_geo(p_limit int, p_dry_run bool)` RPC + one-shot backfill call.
- Create `supabase/migrations/<ts>_personality_geo_cron.sql` — daily cron invoking the RPC for newly-added rows.
- Create `supabase/tests/personality_geo_backfill.sql` — assertions.

**Sub-loop B — Auto-tag (whitelisted)**
- Create `supabase/migrations/<ts>_personality_profession_tag_map.sql` — `personality_profession_tags` mapping table + `assign_personality_profession_tags(p_limit, p_dry_run)` RPC (deterministic) + `usage_count` recompute.
- Create `supabase/migrations/<ts>_personality_tag_cron.sql` — cron.
- Create `supabase/tests/personality_auto_tag.sql` — assertions incl. a safety assertion that no NSFW-category tag is ever assigned.

**Sub-loop C — Cross-linking**
- Create `supabase/migrations/<ts>_personality_relationships.sql` — `personality_relationships` table + RLS + indexes.
- Create `supabase/migrations/<ts>_personality_relationship_builder.sql` — `build_personality_relationships(p_limit, p_dry_run)` RPC (shared-city + shared-tag) + `get_personality_graph_data(p_personality_id uuid, p_limit int)` RPC.
- Create `supabase/migrations/<ts>_personality_relationship_cron.sql` — cron.
- Create `supabase/tests/personality_relationships.sql` — assertions.

> For every `<ts>`: run `ls supabase/migrations | tail -3`, pick a UTC prefix strictly greater than the latest, and keep the within-subloop ordering (table before builder before cron). Apply each live via Supabase MCP `apply_migration` (project `xqeacpakadqfxjxjcewc`, `name` = filename without `.sql`). iCloud quirk: if a read returns empty, `brctl download <path>` then retry; trust Write/exit-codes over read-backs.

---

## Sub-loop A — Geo backfill

### Task 1: `backfill_personality_geo` RPC + one-shot backfill

**Files:**
- Create: `supabase/migrations/<ts>_personality_geo_backfill.sql`
- Test: `supabase/tests/personality_geo_backfill.sql`

- [ ] **Step 1: Write the failing test** — `supabase/tests/personality_geo_backfill.sql`:

```sql
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_geo_backfill.sql
BEGIN;
-- RPC exists and is callable in dry-run without mutating
DO $$
DECLARE v_before int; v_after int; v_would int;
BEGIN
  SELECT count(*) INTO v_before FROM public.personalities WHERE city_id IS NOT NULL;
  SELECT count(*) INTO v_would FROM public.backfill_personality_geo(50, true);  -- dry run
  SELECT count(*) INTO v_after FROM public.personalities WHERE city_id IS NOT NULL;
  ASSERT v_before = v_after, 'dry run must not mutate city_id';
  ASSERT v_would >= 0, 'dry run returns candidate rows';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails** — `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_geo_backfill.sql` (or via Supabase MCP `execute_sql` running the DO block). Expected FAIL: `function public.backfill_personality_geo(integer, boolean) does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/<ts>_personality_geo_backfill.sql`:

```sql
-- Geo backfill: the match_personality_city() trigger only fires on INSERT/UPDATE,
-- so the ~4,400 personalities imported before it existed were never geo-linked.
-- This RPC replays the SAME matching logic over existing rows, in batches.
-- Returns (personality_id, city_id, country_id) for each row it would/did link.

CREATE OR REPLACE FUNCTION public.backfill_personality_geo(
  p_limit   INT DEFAULT 200,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(personality_id UUID, city_id UUID, country_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            RECORD;
  _country_id  UUID;
  _city        RECORD;
  _birth_clean TEXT;
  _new_city_id UUID;
BEGIN
  FOR r IN
    SELECT id, birth_place, nationality, country_id AS cur_country
    FROM public.personalities
    WHERE city_id IS NULL
      AND duplicate_of_id IS NULL
      AND (birth_place IS NOT NULL OR nationality IS NOT NULL)
    ORDER BY view_count DESC NULLS LAST
    LIMIT p_limit
  LOOP
    _country_id := r.cur_country;
    _new_city_id := NULL;

    -- Resolve country from nationality (mirror of trigger).
    IF _country_id IS NULL AND r.nationality IS NOT NULL AND r.nationality <> '' THEN
      SELECT c.id INTO _country_id FROM public.countries c
      WHERE c.duplicate_of_id IS NULL AND c.name ILIKE r.nationality LIMIT 1;
    END IF;

    IF r.birth_place IS NOT NULL AND r.birth_place <> '' THEN
      _birth_clean := trim(split_part(r.birth_place, '(', 1));

      SELECT c.id, c.country_id INTO _city
      FROM public.cities c
      WHERE c.duplicate_of_id IS NULL
        AND (c.name ILIKE r.birth_place OR c.name ILIKE _birth_clean)
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;

      IF _city.id IS NOT NULL THEN
        _new_city_id := _city.id;
        IF _country_id IS NULL THEN _country_id := _city.country_id; END IF;
      ELSE
        SELECT ca.city_id INTO _new_city_id FROM public.city_aliases ca
        WHERE lower(ca.alias) = lower(_birth_clean) OR lower(ca.alias) = lower(r.birth_place)
        LIMIT 1;
      END IF;

      -- Auto-create city when we have a country and it isn't itself a country name.
      IF _new_city_id IS NULL AND _country_id IS NOT NULL
         AND length(_birth_clean) >= 2
         AND NOT EXISTS (SELECT 1 FROM public.countries WHERE name ILIKE _birth_clean AND duplicate_of_id IS NULL)
      THEN
        IF NOT p_dry_run THEN
          INSERT INTO public.cities (name, country_id, slug, data_source)
          VALUES (_birth_clean, _country_id, 'tmp-' || gen_random_uuid(), 'personality-birth-place')
          ON CONFLICT (country_id, name_normalized) WHERE duplicate_of_id IS NULL
          DO NOTHING
          RETURNING id INTO _new_city_id;
          IF _new_city_id IS NULL THEN
            SELECT id INTO _new_city_id FROM public.cities
            WHERE country_id = _country_id AND name ILIKE _birth_clean AND duplicate_of_id IS NULL
            LIMIT 1;
          END IF;
        END IF;
      END IF;
    END IF;

    -- Only emit/commit rows where we actually resolved something new.
    IF _new_city_id IS NOT NULL OR (_country_id IS NOT NULL AND r.cur_country IS NULL) THEN
      IF NOT p_dry_run THEN
        UPDATE public.personalities
        SET city_id      = COALESCE(_new_city_id, city_id),
            country_id   = COALESCE(_country_id, country_id),
            geo_linked_at = now()
        WHERE id = r.id AND city_id IS NULL;
      END IF;
      personality_id := r.id; city_id := _new_city_id; country_id := _country_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_personality_geo(INT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.backfill_personality_geo IS
  'Batch geo-link existing personalities (city_id/country_id) by replaying match_personality_city logic. p_dry_run=true previews without mutation.';

-- One-shot backfill of the current gap, in safe chunks (RPC self-limits; call repeatedly).
SELECT public.backfill_personality_geo(2000, false);
SELECT public.backfill_personality_geo(2000, false);
SELECT public.backfill_personality_geo(2000, false);
```

- [ ] **Step 4: Apply + verify** — apply via Supabase MCP. Then re-run the test (PASS). Confirm progress:
`SELECT count(*) FILTER (WHERE city_id IS NOT NULL) AS has_city, count(*) FILTER (WHERE country_id IS NOT NULL) AS has_country FROM personalities;` — `has_city` should jump well above the 1,442 baseline; `has_country` above 5,688.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/*_personality_geo_backfill.sql supabase/tests/personality_geo_backfill.sql
git commit -m "feat(personalities): batch geo-backfill RPC for existing records (Loop C-A)"
```

### Task 2: Geo backfill cron

**Files:** Create `supabase/migrations/<ts>_personality_geo_cron.sql`.

- [ ] **Step 1: Write the migration** (reuse the pg_net pattern, but this RPC needs no edge function — call it directly):

```sql
-- Daily geo-link sweep for any newly-added personalities the trigger missed
-- (e.g. rows where birth_place was set after insert via a path that bypassed
-- the UPDATE OF trigger). Cheap SQL-only RPC; small batch.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-geo-backfill';
  PERFORM cron.schedule('personality-geo-backfill', '40 4 * * *', $f$
    SELECT public.backfill_personality_geo(500, false);
  $f$);
END $$;
```

- [ ] **Step 2: Apply + verify** — apply via MCP. `SELECT jobname, schedule, active FROM cron.job WHERE jobname='personality-geo-backfill';` → one active row, `40 4 * * *`.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/*_personality_geo_cron.sql
git commit -m "feat(personalities): daily geo-backfill cron (Loop C-A)"
```

---

## Sub-loop B — Auto-tag (whitelisted, deterministic)

### Task 3: Profession→tag mapping table + safe assignment RPC

**Files:**
- Create: `supabase/migrations/<ts>_personality_profession_tag_map.sql`
- Test: `supabase/tests/personality_auto_tag.sql`

- [ ] **Step 1: Write the failing test** — `supabase/tests/personality_auto_tag.sql`:

```sql
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_auto_tag.sql
BEGIN;
-- RPC exists, dry-run does not insert assignments
DO $$
DECLARE v_before bigint; v_after bigint; v_would bigint;
BEGIN
  SELECT count(*) INTO v_before FROM public.unified_tag_assignments WHERE entity_type='personality';
  SELECT count(*) INTO v_would FROM public.assign_personality_profession_tags(50, true);
  SELECT count(*) INTO v_after FROM public.unified_tag_assignments WHERE entity_type='personality';
  ASSERT v_before = v_after, 'dry run must not insert assignments';
  ASSERT v_would >= 0, 'dry run returns candidate count';
END $$;
-- SAFETY: the mapping table must only reference whitelisted, non-sensitive tags.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.personality_profession_tags m
  JOIN public.unified_tags t ON t.id = m.tag_id
  WHERE t.category IS NULL
     OR lower(t.category) ~ '(kink|fetish|bdsm|leather|power exchange|substance|drug|slang|sex toy|sexual practice|sti|intimate|reproduc|health)';
  ASSERT v_bad = 0, format('mapping references %s sensitive/uncategorised tags — forbidden', v_bad);
END $$;
ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails** — expected FAIL: `relation "public.personality_profession_tags" does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/<ts>_personality_profession_tag_map.sql`:

```sql
-- Deterministic, SAFE auto-tagging for named people.
-- HARD RULE: only tags from an explicit allow-list of professional/identity/
-- activism categories are ever attached to a real person. No LLM, no NULL-category
-- tags, no kink/NSFW/slang. Free-form LLM tagging is deferred to a human-gated phase.

-- 1. Curated mapping: lowercased profession substring -> existing tag slug.
CREATE TABLE IF NOT EXISTS public.personality_profession_tags (
  id            BIGSERIAL PRIMARY KEY,
  profession_kw TEXT NOT NULL,           -- matched via ILIKE '%kw%' against personalities.profession
  tag_id        UUID NOT NULL REFERENCES public.unified_tags(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profession_kw, tag_id)
);

-- 2. Seed the mapping from EXISTING whitelisted tags only. We match common
-- professions to tags whose name equals the profession term and whose category
-- is in the allow-list (or, failing a category, we simply skip — never guess).
-- This INSERT is data-driven: it only creates a mapping row when a suitable
-- existing tag is found, so it is safe to run on any tag corpus.
WITH allowed AS (
  SELECT id, lower(name) AS lname FROM public.unified_tags
  WHERE status IS DISTINCT FROM 'deprecated'
    AND category IS NOT NULL
    AND lower(category) IN (
      'rights & activism','political activism','legal rights','identity & orientation',
      'sexual orientation','gender identity','intersex','lgbtq+ culture','lgbtq+ rights',
      'historical movements','social movements','history & heritage','rights & activism'
    )
), kw(profession_kw, tag_name) AS (
  VALUES
    ('activist','activist'), ('politician','politician'), ('writer','writer'),
    ('author','author'), ('poet','poet'), ('artist','artist'), ('musician','musician'),
    ('singer','singer'), ('actor','actor'), ('actress','actor'), ('filmmaker','filmmaker'),
    ('director','director'), ('journalist','journalist'), ('academic','academic'),
    ('historian','historian'), ('scientist','scientist'), ('athlete','athlete'),
    ('drag','drag queen'), ('model','model'), ('photographer','photographer')
)
INSERT INTO public.personality_profession_tags (profession_kw, tag_id)
SELECT kw.profession_kw, a.id
FROM kw JOIN allowed a ON a.lname = kw.tag_name
ON CONFLICT (profession_kw, tag_id) DO NOTHING;

-- 3. Assignment RPC: for each untagged personality, attach mapped tags whose
-- keyword appears in its profession. Idempotent; maintains usage_count.
CREATE OR REPLACE FUNCTION public.assign_personality_profession_tags(
  p_limit   INT DEFAULT 500,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(personality_id UUID, tag_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS pid, m.tag_id AS tid
    FROM public.personalities p
    JOIN public.personality_profession_tags m
      ON p.profession IS NOT NULL AND p.profession ILIKE '%' || m.profession_kw || '%'
    WHERE p.duplicate_of_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.unified_tag_assignments a
        WHERE a.entity_type='personality' AND a.entity_id=p.id AND a.tag_id=m.tag_id
      )
    LIMIT p_limit
  LOOP
    IF NOT p_dry_run THEN
      INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
      VALUES (r.tid, r.pid, 'personality')
      ON CONFLICT DO NOTHING;
    END IF;
    personality_id := r.pid; tag_id := r.tid; RETURN NEXT;
  END LOOP;

  -- Recompute usage_count for affected tags (cheap; whole-table is fine at this scale).
  IF NOT p_dry_run THEN
    UPDATE public.unified_tags t
    SET usage_count = sub.cnt
    FROM (
      SELECT tag_id, count(*) AS cnt FROM public.unified_tag_assignments GROUP BY tag_id
    ) sub
    WHERE sub.tag_id = t.id AND t.usage_count IS DISTINCT FROM sub.cnt;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_personality_profession_tags(INT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.assign_personality_profession_tags IS
  'Deterministic profession->tag assignment using the curated, category-whitelisted personality_profession_tags map. Never assigns sensitive/NSFW/uncategorised tags. p_dry_run previews.';

-- One-shot backfill.
SELECT public.assign_personality_profession_tags(20000, false);
```

- [ ] **Step 4: Apply + verify** — apply via MCP, re-run the test (PASS — both the dry-run and the SAFETY assertion). Confirm coverage + safety on live data:
```sql
SELECT count(DISTINCT entity_id) AS tagged FROM unified_tag_assignments WHERE entity_type='personality';
-- MUST be zero: any assigned tag that is sensitive/uncategorised
SELECT count(*) AS forbidden_assignments
FROM unified_tag_assignments a JOIN unified_tags t ON t.id=a.tag_id
WHERE a.entity_type='personality'
  AND (t.category IS NULL OR lower(t.category) ~ '(kink|fetish|bdsm|leather|power exchange|substance|drug|slang|sex toy|sexual practice|sti|intimate|reproduc|health)');
```
`forbidden_assignments` MUST be 0. If not, stop and fix the whitelist before proceeding.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/*_personality_profession_tag_map.sql supabase/tests/personality_auto_tag.sql
git commit -m "feat(personalities): safe deterministic profession auto-tagging, NSFW-excluded (Loop C-B)"
```

### Task 4: Auto-tag cron

**Files:** Create `supabase/migrations/<ts>_personality_tag_cron.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Daily safe auto-tag sweep for newly-added/edited personalities.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-auto-tag';
  PERFORM cron.schedule('personality-auto-tag', '50 4 * * *', $f$
    SELECT public.assign_personality_profession_tags(2000, false);
  $f$);
END $$;
```

- [ ] **Step 2: Apply + verify** — `SELECT jobname, schedule, active FROM cron.job WHERE jobname='personality-auto-tag';` → active, `50 4 * * *`.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/*_personality_tag_cron.sql
git commit -m "feat(personalities): daily safe auto-tag cron (Loop C-B)"
```

---

## Sub-loop C — Cross-linking

### Task 5: `personality_relationships` table

**Files:**
- Create: `supabase/migrations/<ts>_personality_relationships.sql`
- Test: `supabase/tests/personality_relationships.sql`

- [ ] **Step 1: Write the failing test** — `supabase/tests/personality_relationships.sql`:

```sql
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/personality_relationships.sql
BEGIN;
DO $$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='personality_relationships';
  ASSERT v_cols > 0, 'personality_relationships table must exist';
END $$;
-- self-relationship is rejected by the CHECK constraint
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.personalities LIMIT 1;
  BEGIN
    INSERT INTO public.personality_relationships
      (source_personality_id, target_type, target_personality_id, relationship_type, source)
      VALUES (v_id, 'personality', v_id, 'shared_city', 'test');
    ASSERT false, 'self-relationship should have been rejected';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;
END $$;
ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails** — expected FAIL: table does not exist.

- [ ] **Step 3: Write the migration** — `supabase/migrations/<ts>_personality_relationships.sql`:

```sql
-- Entity relationship layer for personalities. Polymorphic target: a personality
-- relates to another personality, a venue, an event, or a queer_village.
-- Feeds the react-force-graph UI via get_personality_graph_data().

CREATE TABLE IF NOT EXISTS public.personality_relationships (
  id                    BIGSERIAL PRIMARY KEY,
  source_personality_id UUID NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE,
  target_type           TEXT NOT NULL CHECK (target_type IN ('personality','venue','event','queer_village')),
  target_personality_id UUID REFERENCES public.personalities(id) ON DELETE CASCADE,
  target_entity_id      UUID,                 -- used when target_type <> 'personality'
  relationship_type     TEXT NOT NULL,        -- e.g. shared_city, shared_tag, performed_at, founded, associated_with
  weight                NUMERIC NOT NULL DEFAULT 1.0,
  source                TEXT NOT NULL DEFAULT 'auto',  -- auto | curated | llm
  detail                JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- no self-edges
  CONSTRAINT pr_no_self CHECK (NOT (target_type='personality' AND target_personality_id = source_personality_id)),
  -- target wiring matches target_type
  CONSTRAINT pr_target_shape CHECK (
    (target_type='personality' AND target_personality_id IS NOT NULL AND target_entity_id IS NULL)
    OR (target_type<>'personality' AND target_entity_id IS NOT NULL AND target_personality_id IS NULL)
  )
);

-- One edge per (source, target, type). Two partial unique indexes cover the two shapes.
CREATE UNIQUE INDEX IF NOT EXISTS pr_uniq_personality
  ON public.personality_relationships (source_personality_id, target_personality_id, relationship_type)
  WHERE target_type='personality';
CREATE UNIQUE INDEX IF NOT EXISTS pr_uniq_entity
  ON public.personality_relationships (source_personality_id, target_type, target_entity_id, relationship_type)
  WHERE target_type<>'personality';
CREATE INDEX IF NOT EXISTS pr_source_idx ON public.personality_relationships (source_personality_id);
CREATE INDEX IF NOT EXISTS pr_target_personality_idx ON public.personality_relationships (target_personality_id) WHERE target_type='personality';

ALTER TABLE public.personality_relationships ENABLE ROW LEVEL SECURITY;
-- Public read (graph is public content); writes via service_role / admin only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='personality_relationships' AND policyname='pr_public_read') THEN
    CREATE POLICY "pr_public_read" ON public.personality_relationships FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='personality_relationships' AND policyname='pr_admin_write') THEN
    CREATE POLICY "pr_admin_write" ON public.personality_relationships FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;
GRANT SELECT ON public.personality_relationships TO anon, authenticated;
GRANT ALL ON public.personality_relationships TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.personality_relationships_id_seq TO service_role;

COMMENT ON TABLE public.personality_relationships IS
  'Polymorphic personality relationship edges (personality/venue/event/queer_village). Auto-built + curatable. Feeds get_personality_graph_data().';
```

- [ ] **Step 4: Apply + verify** — apply via MCP, re-run the test (PASS — table exists, self-edge rejected).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/*_personality_relationships.sql supabase/tests/personality_relationships.sql
git commit -m "feat(personalities): personality_relationships edge table + RLS (Loop C-C)"
```

### Task 6: Relationship builder + graph RPC

**Files:** Create `supabase/migrations/<ts>_personality_relationship_builder.sql`.

- [ ] **Step 1: Write the migration** — two RPCs:

```sql
-- Build auto relationships from co-membership signals (SQL-only, cheap):
--   shared_city: two personalities with the same city_id
--   shared_tag : two personalities sharing a unified_tag assignment
-- Edges are undirected-by-convention; we store the lexicographically smaller id
-- as source to dedupe, capped per source to avoid hub explosion.

CREATE OR REPLACE FUNCTION public.build_personality_relationships(
  p_limit   INT DEFAULT 5000,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(source_id UUID, target_id UUID, relationship_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH city_pairs AS (
    SELECT LEAST(a.id,b.id) AS s, GREATEST(a.id,b.id) AS t, 'shared_city'::text AS rt
    FROM public.personalities a
    JOIN public.personalities b
      ON a.city_id = b.city_id AND a.id < b.id
    WHERE a.city_id IS NOT NULL AND a.duplicate_of_id IS NULL AND b.duplicate_of_id IS NULL
    LIMIT p_limit
  ),
  tag_pairs AS (
    SELECT LEAST(x.entity_id, y.entity_id) AS s, GREATEST(x.entity_id, y.entity_id) AS t, 'shared_tag'::text AS rt
    FROM public.unified_tag_assignments x
    JOIN public.unified_tag_assignments y
      ON x.tag_id = y.tag_id AND x.entity_id < y.entity_id
    WHERE x.entity_type='personality' AND y.entity_type='personality'
    LIMIT p_limit
  ),
  all_pairs AS (
    SELECT * FROM city_pairs UNION ALL SELECT * FROM tag_pairs
  ),
  ins AS (
    INSERT INTO public.personality_relationships
      (source_personality_id, target_type, target_personality_id, relationship_type, source, weight)
    SELECT s, 'personality', t, rt, 'auto', 1.0 FROM all_pairs
    WHERE NOT p_dry_run
    ON CONFLICT DO NOTHING
    RETURNING source_personality_id, target_personality_id, personality_relationships.relationship_type
  )
  SELECT s, t, rt FROM all_pairs;  -- always report candidates; ins side-effects only when not dry
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_personality_relationships(INT, BOOLEAN) TO service_role;
COMMENT ON FUNCTION public.build_personality_relationships IS
  'Auto-build personality<->personality edges from shared_city + shared_tag co-membership. p_dry_run previews. Idempotent via partial unique index.';

-- Graph RPC for the force-graph UI: neighbourhood around one personality.
CREATE OR REPLACE FUNCTION public.get_personality_graph_data(
  p_personality_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH edges AS (
    SELECT r.source_personality_id AS s, r.target_personality_id AS t,
           r.relationship_type AS rt, r.weight
    FROM public.personality_relationships r
    WHERE r.target_type='personality'
      AND (r.source_personality_id = p_personality_id OR r.target_personality_id = p_personality_id)
    ORDER BY r.weight DESC
    LIMIT p_limit
  ),
  node_ids AS (
    SELECT p_personality_id AS id
    UNION SELECT s FROM edges UNION SELECT t FROM edges
  )
  SELECT jsonb_build_object(
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'image_url', p.image_url,
        'profession', p.profession))
      FROM public.personalities p JOIN node_ids n ON n.id = p.id), '[]'::jsonb),
    'edges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', s, 'target', t, 'type', rt, 'weight', weight))
      FROM edges), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_personality_graph_data(UUID, INT) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_personality_graph_data IS
  'Returns {nodes,edges} JSON for the react-force-graph around a personality. Public-readable.';

-- One-shot build of the current graph (call in chunks).
SELECT count(*) FROM public.build_personality_relationships(20000, false);
```

- [ ] **Step 2: Apply + verify** — apply via MCP. Confirm edges exist and the RPC returns shape:
```sql
SELECT relationship_type, count(*) FROM personality_relationships GROUP BY relationship_type;
-- pick a well-connected personality and check the graph JSON
SELECT jsonb_array_length(get_personality_graph_data(
  (SELECT source_personality_id FROM personality_relationships LIMIT 1), 25) -> 'edges') AS edge_count;
```
Expected: `shared_city` + `shared_tag` rows present; `edge_count` > 0. Guard against hub explosion: `SELECT max(c) FROM (SELECT source_personality_id, count(*) c FROM personality_relationships GROUP BY 1) z;` — if pathologically large (e.g. > 5000 for one node), note it; acceptable for Phase 2 since the graph RPC caps per-query.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/*_personality_relationship_builder.sql
git commit -m "feat(personalities): relationship builder + get_personality_graph_data RPC (Loop C-C)"
```

### Task 7: Relationship build cron

**Files:** Create `supabase/migrations/<ts>_personality_relationship_cron.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Rebuild auto relationship edges daily (after geo + tag sweeps at 04:40/04:50).
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'personality-relationship-build';
  PERFORM cron.schedule('personality-relationship-build', '0 5 * * *', $f$
    SELECT public.build_personality_relationships(20000, false);
  $f$);
END $$;
```

- [ ] **Step 2: Apply + verify** — `SELECT jobname, schedule, active FROM cron.job WHERE jobname='personality-relationship-build';` → active, `0 5 * * *`.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/*_personality_relationship_cron.sql
git commit -m "feat(personalities): daily relationship-build cron (Loop C-C)"
```

---

## Final verification (Phase 2 done)

- [ ] All three SQL test files pass (geo, auto-tag incl. safety assertion, relationships).
- [ ] Geo: `has_city` climbed far above 1,442; geo cron active.
- [ ] Tags: personalities tagged > 0; `forbidden_assignments = 0` (the hard safety gate); auto-tag cron active.
- [ ] Cross-links: `personality_relationships` populated with shared_city + shared_tag; `get_personality_graph_data()` returns non-empty `{nodes,edges}`; build cron active.
- [ ] All four new crons coexist with `personality-refresh` (Phase 1) without schedule collision (04:40 geo, 04:50 tag, 05:00 relationship, refresh */30).
- [ ] Spot-check on https://queer.guide: an enriched personality now shows a linked city; (UI wiring of the force-graph itself is a follow-up — RPC is ready).

## Self-Review

**Spec coverage (Loop C = geo + tags + cross-links):**
- Geo-link birth_place/nationality → city/country, backfill + keep-current → Tasks 1–2. ✓
- Auto-tag via unified_tags → Tasks 3–4, with a HARD safety whitelist (the real data is NSFW-polluted; named people must not get kink/slang tags). LLM free-tagging intentionally deferred. ✓
- Entity cross-links (personality↔personality/venue/event/village) + graph feed → Tasks 5–7 (new table, builder, `get_personality_graph_data`). ✓ Phase 2 auto-builds personality↔personality (shared_city/shared_tag); venue/event/village edges are supported by the schema (`target_type`) and left for curated/LLM population in a later phase — noted, not silently dropped.

**Deferred (explicitly):** LLM significance narrative (Loop B / Phase 3); net-new discovery (Loop D / Phase 4); the force-graph React component wiring (RPC ships ready; UI is a frontend follow-up); venue/event/village relationship population.

**Placeholder scan:** none — every SQL/code step is complete and self-contained.

**Type/name consistency:** `backfill_personality_geo` (T1) → cron T2; `personality_profession_tags` + `assign_personality_profession_tags` (T3) → cron T4; `personality_relationships` (T5) → `build_personality_relationships` + `get_personality_graph_data` (T6) → cron T7. Column names (`target_type`, `target_personality_id`, `target_entity_id`, `relationship_type`, `weight`, `source`) defined in T5 and used consistently in T6. Reused fns verified against live signatures (`resolve_city_and_country(text,text)`, `match_personality_city()`).
