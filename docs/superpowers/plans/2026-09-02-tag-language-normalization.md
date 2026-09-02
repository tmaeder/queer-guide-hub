# Tag Language Normalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put English in the English column, stop the producer that keeps filling it with German, and repair the lossy slugs it created — without touching the 106 deliberately-namespaced slugs or the 13 marketplace facets that merely *look* like duplicates.

**Architecture:** `unified_tags.name` is the English slot of an 11-language system (`name_i18n` never holds `en`). The live producer `source-tags-extract` promotes free-text `tags[]` into vocabulary weekly with no language gate and its own broken slugify, and passes that slug into `upsert({onConflict:'slug'})` — which beats both database triggers. We seal it (it proposes into `ai_suggestions` instead of inserting), seal the slug at the database as defence in depth, then apply a hand-curated repair. No LLM judges anywhere.

**Tech Stack:** Postgres (Supabase), Deno edge functions, Vitest (`src/**` only), `deno test` for `supabase/functions/**`.

**Spec:** `docs/superpowers/specs/2026-09-02-tag-language-normalization-design.md`

---

## Ground rules for this plan

Read these before Task 1. Each one is a mistake that was already made and measured.

1. **Never use `slug <> normalize_tag_slug(name)` as a repair predicate.** It matches 115 active rows of which only 8 are defects. The other 106 are deliberate namespace prefixes (`mat-silicone` = 4,643 uses, `news-education`, `occ-pride`, `genre-horror`, `color-black`, `vibe-bold`). The correct predicate always includes `name ~ '[^\x00-\x7F]'`.
2. **Never use `tag_hygiene_stats().duplicate_active_name` as a merge work-list.** 13 of its 14 rows are a marketplace facet colliding with a glossary term.
3. **Never widen `tag_language_guard` with word lists.** The "looks German" heuristic measures ~5% precision — it flags `Party`, `Film`, `Pride`, `Transgender`.
4. **Migration versions must sort above `20261127100000`.** This worktree is at `20261119100000`, prod at `20261126100000`, sibling worktrees hold `20261126100000` (twice) and `20261127100000`. Use the `20261128*` range. A duplicate version is a *silent skip*, not an error.
5. **`app.actor` must not match `system:%`.** `log_unified_tag_change()` RAISEs when a system actor modifies a `human_reviewed` row and aborts the whole statement. Use `admin:tag-language-normalisation`.
6. **Batch discipline.** `trg_search_documents_tag` fires per row. Keep any single `UPDATE unified_tags` under ~300 rows. Every repair here is far below that.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261128100000_tag_slug_seal.sql` | Trigger seal: name-derived slug wins when the name is non-ASCII |
| `supabase/migrations/20261128100100_tag_slug_repair.sql` | Repair the 21 lossy slugs |
| `supabase/migrations/20261128100200_tag_language_dispositions.sql` | D1 renames + deprecations, D4 merges, chimera retraction |
| `supabase/migrations/20261128100300_tag_name_i18n_sense_purge.sql` | Delete sense-category `name_i18n` |
| `supabase/migrations/20261128100400_tag_hygiene_language_sentinels.sql` | Four deterministic sentinels |
| `supabase/functions/source-tags-extract/index.ts` | Propose into `ai_suggestions`; fix slugify |
| `supabase/functions/translate-i18n-batch/index.ts` | Stop writing `name_i18n` for sense-category tags |
| `supabase/functions/_shared/ai-enrichment.ts` | Add output-language instruction to two prompts |
| `src/lib/__tests__/tagSlugSeal.test.ts` | Guard: namespace prefixes excluded from the seal |
| `src/lib/__tests__/tagHygieneStats.test.ts` | Extend: the four new sentinel keys |
| `supabase/functions/source-tags-extract/index.test.ts` | Slugify + propose-not-insert |
| `scripts/check-pipeline-health.mjs` | Wire the zero-invariants |

---

### Task 1: Seal the slug at the database

The producer supplies its own slug and `unified_tags_normalize_slug()` does `normalize_tag_slug(coalesce(NEW.slug, NEW.name))` — slug first — so the caller wins. Make the **name** win whenever the name carries a non-ASCII character. Every deliberate namespaced slug sits on a pure-ASCII name, so this cannot touch them.

**Files:**
- Create: `supabase/migrations/20261128100000_tag_slug_seal.sql`
- Create: `src/lib/__tests__/tagSlugSeal.test.ts`

- [ ] **Step 1: Write the failing guard test**

```ts
// src/lib/__tests__/tagSlugSeal.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase/migrations')

function latestDefining(fnName: string): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => readFileSync(join(DIR, f), 'utf8').includes(`FUNCTION public.${fnName}`))
    .sort()
  if (files.length === 0) throw new Error(`no migration defines ${fnName}`)
  return readFileSync(join(DIR, files[files.length - 1]), 'utf8')
}

describe('unified_tags_normalize_slug seal', () => {
  const sql = latestDefining('unified_tags_normalize_slug')

  it('prefers the name-derived slug when the name is non-ASCII', () => {
    // The seal is the whole point: a caller-supplied slug must not win for a
    // name carrying a diacritic, which is how "Bühne" became "b-hne".
    expect(sql).toMatch(/\[\^\\x00-\\x7F\]/)
  })

  it('still honours a caller slug for a pure-ASCII name', () => {
    // mat-silicone (4,643 uses), news-education, occ-pride, genre-horror are
    // deliberate namespace prefixes on ASCII names. If this branch disappears
    // the seal starts renaming them and breaking thousands of links.
    expect(sql).toMatch(/coalesce\(NEW\.slug, NEW\.name\)/i)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/__tests__/tagSlugSeal.test.ts`
Expected: FAIL — `no migration defines unified_tags_normalize_slug` (the live definition predates this repo's current migration set), or the non-ASCII assertion fails.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261128100000_tag_slug_seal.sql
--
-- source-tags-extract computes its own slug with
--   name.toLowerCase().replace(/[^a-z0-9]+/g,'-')
-- which never transliterates, so "ü" falls into the character class and becomes
-- "-": "Bühne" -> "b-hne". It then passes that slug into
-- upsert({onConflict:'slug'}), and because normalize_tag_input() only re-derives
-- from the name when the slug is NULL/empty, and this function coalesces slug
-- BEFORE name, the caller's broken slug wins over both triggers.
--
-- The seal is deliberately narrow: prefer the name-derived slug ONLY when the
-- name contains a non-ASCII character. Every deliberate namespaced slug in this
-- table (mat-, news-, occ-, genre-, color-, vibe-) sits on a pure-ASCII name, so
-- none of them are reachable by this branch. A blanket "always derive from name"
-- would rename mat-silicone -> silicone and break 4,643 marketplace links.

CREATE OR REPLACE FUNCTION public.unified_tags_normalize_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NEW.name IS NOT NULL AND NEW.name ~ '[^\x00-\x7F]' THEN
    -- A caller has no business hand-slugging a diacritic name.
    NEW.slug := normalize_tag_slug(NEW.name);
  ELSE
    NEW.slug := normalize_tag_slug(coalesce(NEW.slug, NEW.name));
  END IF;

  IF NEW.slug = '' OR NEW.slug IS NULL THEN
    NEW.slug := encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/tagSlugSeal.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the seal against live data in a rolled-back transaction**

Run this via the Supabase MCP `execute_sql`. It must print `buhne` for the sealed
insert and leave the namespaced rows untouched:

```sql
BEGIN;
-- apply the function body from Step 3 here, then:
SELECT set_config('app.actor','admin:tag-language-normalisation',false);
INSERT INTO public.unified_tags (name, slug) VALUES ('Prüfung', 'pr-fung') RETURNING name, slug;
-- expect: slug = 'prufung', NOT 'pr-fung'
SELECT slug FROM public.unified_tags WHERE slug IN ('mat-silicone','news-education','occ-pride');
-- expect: all three unchanged
ROLLBACK;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261128100000_tag_slug_seal.sql src/lib/__tests__/tagSlugSeal.test.ts
git commit -m "fix(tags): name-derived slug wins for non-ASCII names

source-tags-extract slugifies without transliterating, so 'ü' falls into
[^a-z0-9] and becomes '-' (Bühne -> b-hne), and it passes that slug into
upsert(onConflict:'slug'), beating both triggers.

Seal is narrow on purpose: it fires only when the name is non-ASCII. Every
deliberate namespace prefix (mat-, news-, occ-, genre-, color-, vibe-) sits
on an ASCII name, so a blanket rule would have renamed mat-silicone and
broken 4,643 marketplace links.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Repair the 21 lossy slugs

**Files:**
- Create: `supabase/migrations/20261128100100_tag_slug_repair.sql`

- [ ] **Step 1: Confirm the population is still exactly 21 before writing the repair**

Run via MCP `execute_sql`:

```sql
SELECT status, count(*)
  FROM public.unified_tags
 WHERE name ~ '[^\x00-\x7F]'
   AND slug IS DISTINCT FROM public.normalize_tag_slug(name)
 GROUP BY 1;
```

Expected at time of writing: `active 9, deprecated 2, merged 10`. If the numbers moved, a sibling session or the Sunday cron has touched the table — re-read the rows before proceeding rather than trusting this plan's list.

- [ ] **Step 2: Write the repair migration**

```sql
-- supabase/migrations/20261128100100_tag_slug_repair.sql
--
-- Repairs slugs that lost a diacritic to a hyphen. Predicate is deliberately
-- narrowed by `name ~ '[^\x00-\x7F]'`: the unqualified drift predicate
-- (slug <> normalize_tag_slug(name)) matches 115 active rows, 106 of which are
-- deliberate namespace prefixes on ASCII names. See 20261128100000.
--
-- trg_unified_tags_slug_redirect logs the old -> new slug into
-- tag_slug_redirects (284 rows live), so existing URLs keep resolving.
-- Row count is ~21, far under the ~300 batch ceiling that trg_search_documents_tag
-- imposes.

DO $$
DECLARE
  v_before int;
  v_after  int;
BEGIN
  SELECT count(*) INTO v_before
    FROM public.unified_tags
   WHERE name ~ '[^\x00-\x7F]'
     AND slug IS DISTINCT FROM public.normalize_tag_slug(name);

  IF v_before = 0 THEN
    RAISE NOTICE 'tag_slug_repair: nothing to do';
    RETURN;
  END IF;

  IF v_before > 60 THEN
    RAISE EXCEPTION 'tag_slug_repair: expected ~21 rows, found % — re-read before applying', v_before;
  END IF;

  PERFORM set_config('app.actor', 'admin:tag-language-normalisation', false);

  UPDATE public.unified_tags
     SET slug = public.normalize_tag_slug(name)
   WHERE name ~ '[^\x00-\x7F]'
     AND slug IS DISTINCT FROM public.normalize_tag_slug(name);

  SELECT count(*) INTO v_after
    FROM public.unified_tags
   WHERE name ~ '[^\x00-\x7F]'
     AND slug IS DISTINCT FROM public.normalize_tag_slug(name);

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'tag_slug_repair: % rows still lossy after repair', v_after;
  END IF;

  RAISE NOTICE 'tag_slug_repair: repaired % slugs', v_before;
END $$;
```

- [ ] **Step 3: Dry-run it on prod inside a rolled-back transaction**

Wrap the whole `DO $$ ... $$` in `BEGIN; ... ROLLBACK;` via MCP `execute_sql` and confirm the NOTICE reads `repaired 21 slugs` with no exception.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261128100100_tag_slug_repair.sql
git commit -m "fix(tags): repair 21 slugs that lost a diacritic to a hyphen

b-hne, preistr-ger, nonbin-r, sch-neberg, kirsten-pl-tz, m-nchen, caf (from
Café), fu-ball (from Fußball), and a slug containing a literal ü.

Predicate is narrowed by name ~ '[^\\x00-\\x7F]' and the migration aborts if
it matches more than 60 rows, because the unqualified drift predicate matches
115 and would rename mat-silicone.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: source-tags-extract proposes instead of creating

This is the actual seal. Two changes in one file: fix the slugify, and write to `ai_suggestions` instead of `unified_tags`.

**Files:**
- Modify: `supabase/functions/source-tags-extract/index.ts:39` and `:74-91`
- Create: `supabase/functions/source-tags-extract/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/source-tags-extract/index.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { tagSlug } from './index.ts'

Deno.test('tagSlug transliterates before stripping', () => {
  // The bug: "ü" survived .toLowerCase() and fell into [^a-z0-9], becoming "-".
  assertEquals(tagSlug('Bühne'), 'buhne')
  assertEquals(tagSlug('Preisträger'), 'preistrager')
  assertEquals(tagSlug('Nonbinär'), 'nonbinar')
  assertEquals(tagSlug('Schöneberg'), 'schoneberg')
  assertEquals(tagSlug('Fußball'), 'fussball')
  assertEquals(tagSlug('Café'), 'cafe')
})

Deno.test('tagSlug leaves ASCII names alone', () => {
  assertEquals(tagSlug('Drag Queen'), 'drag-queen')
  assertEquals(tagSlug('HIV/AIDS'), 'hiv-aids')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd supabase/functions && deno test --allow-net --allow-env --allow-read source-tags-extract/index.test.ts`
Expected: FAIL — `tagSlug` is not exported.

- [ ] **Step 3: Export a corrected slugify**

Replace line 39's inline expression. Add near the top of `index.ts`, after the imports:

```ts
/** Matches public.normalize_tag_slug / public.tag_deaccent in the database.
 *  The previous inline version ran .toLowerCase() but never transliterated, so
 *  ü/ä/ö/ß fell into [^a-z0-9] and became "-": "Bühne" -> "b-hne". Those slugs
 *  then beat both DB triggers because they were passed into
 *  upsert({onConflict:'slug'}). */
export function tagSlug(input: string): string {
  return input
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
```

Then change line 39 to:

```ts
        const slug = tagSlug(name)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd supabase/functions && deno test --allow-net --allow-env --allow-read source-tags-extract/index.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Replace the write path with a proposal**

Replace lines 55-91 (the comment block, `rows`, and the chunked upsert) with:

```ts
    // PROPOSE, DO NOT CREATE.
    //
    // This node used to upsert straight into unified_tags. It has no language
    // gate, so every German section heading a scraper dropped into events.tags
    // became live vocabulary on the next Sunday run: Bühne, Beratung, Bildung,
    // Vernetzung, Gesundheit. It also once carried status:'active' in the
    // upsert, resurrecting 297 deprecated tags into a state where the page
    // rendered but search refused to index — lgbtiq, sauna and kink were
    // unreachable for three months (repaired in 20261007100000).
    //
    // It now files proposals for a human instead. suggestion_type 'tag' and
    // source 'rule' are both already in the CHECK vocabulary, so this needs no
    // migration. entity_id is NULL because the tag does not exist yet.
    const slugs = Array.from(tagSet.keys())

    // Skip anything that is already vocabulary IN ANY STATUS — a deprecated tag
    // must not be re-proposed, that is restore_deprecated_tag()'s job.
    const existing = new Set<string>()
    for (let i = 0; i < slugs.length; i += 500) {
      const { data } = await supabase
        .from('unified_tags')
        .select('slug')
        .in('slug', slugs.slice(i, i + 500))
      for (const r of data ?? []) existing.add(r.slug as string)
    }

    // Skip anything already proposed. A 'rejected' row is a TOMBSTONE: without
    // this the weekly cron re-files every string a human already refused.
    const proposed = new Set<string>()
    {
      const { data } = await supabase
        .from('ai_suggestions')
        .select('proposed_value')
        .eq('suggestion_type', 'tag')
        .eq('entity_type', 'tag')
        .in('status', ['pending', 'approved', 'rejected'])
      for (const r of data ?? []) {
        const s = (r.proposed_value as { slug?: string } | null)?.slug
        if (s) proposed.add(s)
      }
    }

    const fresh = Array.from(tagSet.values()).filter(
      (t) => !existing.has(t.slug) && !proposed.has(t.slug),
    )

    if (fresh.length === 0) {
      return jsonResponse(
        { success: true, items: 0, items_total: tagSet.size, message: 'no new tags to propose' },
        200,
        req,
      )
    }

    const CHUNK = 200
    let filed = 0
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const chunk = fresh.slice(i, i + CHUNK).map((t) => ({
        suggestion_type: 'tag',
        entity_type: 'tag',
        entity_id: null,
        source: 'rule',
        source_run_id: runId,
        status: 'pending',
        proposed_value: { name: t.name, slug: t.slug, seen_in: t.source },
      }))
      const { error, count } = await supabase
        .from('ai_suggestions')
        .insert(chunk, { count: 'exact' })
      if (error) {
        console.error(`tag proposal chunk ${i}: ${error.message}`)
      } else {
        filed += count ?? chunk.length
      }
    }

    return jsonResponse({
      success: true,
      items: filed,
      items_total: tagSet.size,
      items_processed: tagSet.size,
      items_succeeded: filed,
      items_failed: 0,
      skipped_existing: tagSet.size - fresh.length,
    }, 200, req)
```

Add `const runId = crypto.randomUUID()` immediately after `const supabase = getServiceClient()` on line 11.

- [ ] **Step 6: Make the 5,000-row cap honest**

Line 30 reads `.limit(5000)` with no `ORDER BY`, so the function has never scanned the whole corpus and which rows it sees is arbitrary. Do not silently widen it — report it. After the `for` loop over `tables`, add:

```ts
    // The per-table cap is arbitrary without an ORDER BY, so say so rather than
    // letting a partial scan read as a complete one.
    if (truncated.length > 0) {
      console.warn(`source-tags-extract: partial scan, capped at 5000 rows for: ${truncated.join(', ')}`)
    }
```

and inside the table loop, after `const { data } = await supabase...`, add:

```ts
      if (data && data.length === 5000) truncated.push(table)
```

declaring `const truncated: string[] = []` above the loop. Surface it in the response by adding `truncated_tables: truncated` to the returned JSON.

- [ ] **Step 7: Run the full edge-function suite**

Run: `npm run test:functions`
Expected: PASS. This runs by discovery, so the new test file is picked up automatically.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/source-tags-extract/
git commit -m "fix(tags): source-tags-extract proposes, it no longer creates

This node promoted free-text tags[] into live vocabulary every Sunday with no
language gate, which is how Bühne/Beratung/Bildung/Vernetzung/Gesundheit —
German section headings from source-milchjugend — became glossary entries.
Rows were created 2026-08-09, 08-23 and 08-30; all three are Sundays and the
pipeline cron is 0 5 * * 0.

Now files ai_suggestions rows for review. suggestion_type 'tag' and source
'rule' are already in the CHECK vocabulary, so no migration is needed.
Re-proposal is guarded against unified_tags in ANY status and against
pending/approved/rejected suggestions, with rejected acting as a tombstone —
without that a weekly cron re-files everything a human already refused.

Also fixes the slugify to transliterate (Bühne -> buhne, matching
normalize_tag_slug) and stops the arbitrary 5,000-row cap reading as a
complete scan.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Teach the review queue to render a new-tag proposal

`src/components/admin/search-intelligence/SuggestionsTab.tsx` is the only reader of `ai_suggestions`. Every existing type edits an existing row, so it very likely assumes `entity_id` is non-null. A proposal with no entity must not render blank or crash.

**Files:**
- Modify: `src/components/admin/search-intelligence/SuggestionsTab.tsx`

- [ ] **Step 1: Read the component and find the entity assumption**

Run: `grep -n 'entity_id\|entity_type\|suggestion_type' src/components/admin/search-intelligence/SuggestionsTab.tsx`

Identify where it resolves an entity name/link for display. That is the branch that must tolerate `entity_id === null`.

- [ ] **Step 2: Write the failing test**

Create `src/components/admin/search-intelligence/__tests__/SuggestionsTab.newTag.test.tsx`. Render the component with one `suggestion_type: 'tag'`, `entity_id: null`, `proposed_value: { name: 'Bühne', slug: 'buhne', seen_in: 'events' }` row and assert the proposed name is visible and nothing throws.

Follow the existing render/mock conventions in `src/components/admin/**/__tests__/` — match whatever wrapper and Supabase mock the sibling tests in that directory already use rather than inventing a new one.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/components/admin/search-intelligence/__tests__/SuggestionsTab.newTag.test.tsx`

- [ ] **Step 4: Add the null-entity branch**

Render `proposed_value.name` as the subject when `entity_id` is null, with the `seen_in` table as secondary context, and an approve action that creates the tag. Keep the existing behaviour untouched for every other suggestion type.

- [ ] **Step 5: Run the test to verify it passes, then the full suite**

Run: `npx vitest run src/components/admin/search-intelligence/`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/search-intelligence/
git commit -m "feat(admin): render new-tag proposals in the suggestions queue

source-tags-extract now files tag proposals with entity_id NULL, because the
tag does not exist yet. Every other suggestion type edits an existing row, so
the queue assumed an entity was always resolvable.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: D1 dispositions and D4 merges

One migration, because the renames and merges touch the same rows and the ordering matters (a rename re-derives the slug, so it must run after Task 1's seal is in place).

**Rule applied:** merge into the existing English tag where one exists; deprecate where none does. Deprecating a tag that has a live English equivalent would throw away a redirect for no reason.

**Files:**
- Create: `supabase/migrations/20261128100200_tag_language_dispositions.sql`

- [ ] **Step 1: Re-read every row this migration names, on prod, before writing it**

Run via MCP `execute_sql`:

```sql
SELECT slug, name, status, coalesce(usage_count,0) uses, seo_indexable, category
  FROM public.unified_tags
 WHERE slug IN (
   'schwul','lesbisch','nonbinar','gesundheit','deutschland','munchen','feministisch',
   'buhne','beratung','bildung','vernetzung','schauspielerin','schriftsteller','priester',
   'gay','lesbian','non-binary','health','germany','munich','feminist','stage',
   'counseling','news-education','actress','writer',
   'preistrager','schwimmen','bischof','stolperstein-strafverfolgung',
   'pulse-mordopfer-hassverbrechen','mordopfer-hassverbrechen',
   'admiralduncan-mordopfer-hassverbrechen','barnoar-mordopfer-hassverbrechen',
   'clubq-mordopfer-hassverbrechen','mavie-horbiger','mavie-h-rbiger'
 )
 ORDER BY slug;
```

Note that the German slugs listed here are the **post-Task-2** forms (`nonbinar`, `buhne`, `munchen`, `preistrager`). If Task 2 has not been applied yet, they are still `nonbin-r`, `b-hne`, `m-nchen`, `preistr-ger`. **This is exactly how the previous fix died** — `englishify-tags.mjs` keys its `RENAMES` map on slug and its `munchen: 'Munich'` entry could never fire, because the live slug was `m-nchen`. Key this migration on `id` resolved at runtime, never on a literal slug.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20261128100200_tag_language_dispositions.sql
--
-- Curated, hand-read dispositions for the non-English cohort. Every entry is a
-- decision a human made after reading the tag, its category, its usage and its
-- description. There is no heuristic here on purpose: the obvious one
-- ("name equals its own German translation") measures ~5% precision and flags
-- Party, Film, Pride and Transgender.
--
-- Resolution is by NAME -> id at runtime, never by literal slug. The previous
-- pass keyed on slug and its munchen -> Munich entry could never fire, because
-- the broken slug pipeline had produced m-nchen.

DO $$
DECLARE
  r record;
  v_dup uuid;
  v_canon uuid;
  v_merged int := 0;
  v_deprecated int := 0;
  v_renamed int := 0;
BEGIN
  PERFORM set_config('app.actor', 'admin:tag-language-normalisation', false);

  ---------------------------------------------------------------------------
  -- A. Merge German into the existing English tag.
  ---------------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('Schwul',         'Gay'),
      ('Lesbisch',       'Lesbian'),
      ('Nonbinär',       'Non-Binary'),
      ('Gesundheit',     'Health'),
      ('Deutschland',    'Germany'),
      ('München',        'Munich'),
      ('Feministisch',   'Feminist'),
      ('Bühne',          'Stage'),
      ('Beratung',       'Counseling'),
      ('Bildung',        'Education'),
      ('Schauspielerin', 'Actress'),
      ('Schriftsteller', 'Writer')
    ) AS t(dup_name, canon_name)
  LOOP
    SELECT id INTO v_dup   FROM public.unified_tags
      WHERE name = r.dup_name AND status = 'active' ORDER BY id LIMIT 1;
    SELECT id INTO v_canon FROM public.unified_tags
      WHERE name = r.canon_name AND status = 'active' ORDER BY id LIMIT 1;

    IF v_dup IS NULL OR v_canon IS NULL OR v_dup = v_canon THEN
      RAISE NOTICE 'skip merge %: dup=% canon=%', r.dup_name, v_dup, v_canon;
      CONTINUE;
    END IF;

    PERFORM public.merge_tag_concept(
      v_canon, v_dup, 'admin:tag-language-normalisation', 'tag-language-normalisation');
    v_merged := v_merged + 1;
  END LOOP;

  -- The Mavie Hörbiger self-duplicate: same name, two rows, two categories.
  -- Keep the one whose slug is already correct.
  SELECT id INTO v_canon FROM public.unified_tags
    WHERE name = 'Mavie Hörbiger' AND slug = 'mavie-horbiger' AND status = 'active';
  SELECT id INTO v_dup FROM public.unified_tags
    WHERE name = 'Mavie Hörbiger' AND status = 'active' AND id <> coalesce(v_canon, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY id LIMIT 1;
  IF v_canon IS NOT NULL AND v_dup IS NOT NULL THEN
    PERFORM public.merge_tag_concept(
      v_canon, v_dup, 'admin:tag-language-normalisation', 'tag-language-normalisation');
    v_merged := v_merged + 1;
  END IF;

  ---------------------------------------------------------------------------
  -- B. Rename where the concept is real and no English tag exists yet.
  ---------------------------------------------------------------------------
  UPDATE public.unified_tags SET name = 'Award Winner'
   WHERE name = 'Preisträger' AND status = 'active';
  GET DIAGNOSTICS v_renamed = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- C. Deprecate. Scraped German hashtag strings and occupation nouns with no
  --    English glossary equivalent. All at 0 uses. "Weaver" would not be a
  --    glossary tag in English either, so translating them is not the fix.
  --
  --    The hashtag rows name real events — Admiral Duncan 1999, Bar Noar 2009,
  --    Pulse 2016, Club Q 2022. Deprecating the scraped STRING is not a
  --    judgement about the events; if the platform wants those concepts they
  --    deserve authored tags, not a concatenated hashtag.
  ---------------------------------------------------------------------------
  UPDATE public.unified_tags
     SET status = 'deprecated',
         deprecated_at = now(),
         deprecation_reason = 'tag-language-normalisation: scraped non-English string, not a concept',
         seo_indexable = false
   WHERE status = 'active'
     AND name IN (
       'Admiralduncan #Mordopfer #Hassverbrechen',
       'Barnoar #Mordopfer #Hassverbrechen',
       'Clubq #Mordopfer #Hassverbrechen',
       'Mordopfer #Hassverbrechen',
       'Pulse #Mordopfer #Hassverbrechen',
       'Stolperstein #Strafverfolgung',
       'Vernetzung', 'Weberin', 'Topferin', 'Kriegerin', 'Wissenschaftler',
       'Anglikanischer Priester', 'Zen Priester', 'Priester', 'Bischof',
       'Dekan Von St Albans', 'Burgermeister Von Houston', 'Jugendbund Grunder',
       'Strafverfolgung', 'Gewaltverbrechen', 'Bogenschiessen', 'Schwimmen'
     );
  GET DIAGNOSTICS v_deprecated = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- D. Retract three wrong-entity descriptions. These are INDEXABLE and their
  --    prose describes a different subject entirely: Pulse (the Orlando
  --    nightclub) described the pulse in an artery, Schwimmen a card game,
  --    Bischof "is a surname". Retraction REMOVES only — never a rewrite. The
  --    LLM judge that rewrote prose here was measured at ~19% precision and is
  --    disabled; nothing in this migration generates text.
  ---------------------------------------------------------------------------
  -- unified_tags has NO needs_attention column (it is not one of the 43 columns
  -- on this table — venues/events have it, this does not). The deindex reason
  -- is the field that carries "why" here, and retraction must set it in the
  -- SAME statement that clears the prose: a retracted page that stays indexable
  -- is the failure this is meant to prevent.
  UPDATE public.unified_tags
     SET description = NULL,
         long_description = NULL,
         seo_indexable = false,
         seo_deindex_reason = 'tag-language-normalisation: description described a different entity'
   WHERE name IN ('Pulse #Mordopfer #Hassverbrechen', 'Schwimmen', 'Bischof')
     AND description IS NOT NULL;

  RAISE NOTICE 'dispositions: % merged, % renamed, % deprecated', v_merged, v_renamed, v_deprecated;
END $$;
```

Block C runs before block D, so the three chimeras are already `deprecated` by the
time D retracts their prose. D has no status filter, so it still matches — that is
intentional, not an oversight.

- [ ] **Step 3: Confirm the thin-page gate will not reject the retraction**

`trg_tag_thin_page_gate` fires `BEFORE UPDATE OF description, short_description, seo_indexable, status, merged_into_id`. Block D touches three of those five at once. Dry-run it and confirm the gate does not RAISE — it is designed to stop an indexable row *without* a description, and D sets `seo_indexable = false` in the same statement, so it should pass. If it raises, split D so `seo_indexable` is cleared first.

- [ ] **Step 4: Dry-run the whole migration in a rolled-back transaction**

Wrap in `BEGIN; ... ROLLBACK;` via MCP `execute_sql`. Confirm the NOTICE reports ~13 merged, 1 renamed, ~22 deprecated, and that no `merge_tag_concept` call raised. `merge_tag_concept` aborts on a 23505 unique violation, so a raise here means a canonical/duplicate pair needs hand resolution — fix the pair, do not loosen the loop.

- [ ] **Step 5: Verify the winners kept their usage counts**

```sql
SELECT name, usage_count, status FROM public.unified_tags
 WHERE name IN ('Gay','Lesbian','Non-Binary','Health','Germany','Writer') ORDER BY name;
```

Expected inside the transaction: `Gay` still ≈4,914, `Lesbian` ≈2,960, `Writer` ≈992. A collapsed count means the merge ran backwards — merge direction can delete content.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261128100200_tag_language_dispositions.sql
git commit -m "fix(tags): curated English dispositions for the German cohort

12 merges into existing English tags (Schwul->Gay, Lesbisch->Lesbian,
Nonbinär->Non-Binary, ...), all losers at 0-2 uses; one rename
(Preisträger->Award Winner); 22 deprecations of scraped hashtag strings and
occupation nouns with no English glossary equivalent.

Resolved by NAME at runtime, never by literal slug: the previous pass keyed
RENAMES on slug and its munchen->Munich entry could never fire, because the
broken slug pipeline had produced m-nchen.

Also retracts three indexable wrong-entity descriptions found while hand-
reading: Pulse (the Orlando nightclub) described an artery, Schwimmen a card
game, Bischof 'is a surname'. Retraction removes only — no text is generated.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Purge the unread sense-category name translations

**Files:**
- Create: `supabase/migrations/20261128100300_tag_name_i18n_sense_purge.sql`
- Modify: `supabase/functions/translate-i18n-batch/index.ts`

- [ ] **Step 1: Re-confirm `name_i18n` still has no reader**

Run: `grep -rn 'name_i18n' src functions workers --include='*.ts' --include='*.tsx' | grep -v 'integrations/supabase/types.ts'`

Expected: no hits in `src/` or `functions/`. If a reader has appeared since the spec was written, **stop** — the purge becomes a user-visible change and needs re-deciding.

Positive control, so an empty result is trusted: `grep -rn 'description_i18n' src --include='*.tsx' | grep -v types.ts` must return hits (`KinkGridEditor`, `KinkWizard`).

- [ ] **Step 2: Write the purge migration**

```sql
-- supabase/migrations/20261128100300_tag_name_i18n_sense_purge.sql
--
-- unified_tags.name_i18n has no reader anywhere in src/, functions/ or
-- workers/ — translate-i18n-batch writes it and nothing renders it. For the
-- sense categories its content is actively wrong, because machine translation
-- took queer slang literally:
--   Stud  -> es "Estudio" (a studio)
--   Ussy  -> es "Vagina"
--   Trade -> es "Trueque" (barter)
--   Cruising -> fr "Croisière" (a boat cruise)
--   Missing Stair -> es "Escalera que falta"
--   Backshot -> es "Disparo por detrás" (a gunshot from behind)
--
-- Harm today is zero. This removes the loaded gun before someone wires up a
-- reader and the glossary starts publishing Estudio for Stud.
--
-- Membership mirrors isSenseCategory() in _shared/tag-style.ts. It is restated
-- here only because SQL cannot import TypeScript; if the tree changes, both
-- move together. Venue Types / Destinations / Substances are deliberately
-- absent — their generic sense is the right one.

UPDATE public.unified_tags
   SET name_i18n = '{}'::jsonb
 WHERE status = 'active'
   AND name_i18n IS NOT NULL
   AND name_i18n <> '{}'::jsonb
   AND lower(category) IN (
     'dynamics & roles','fetishes','practices & play','gear',
     'kink community & scenes','positions','slang & language',
     'subcultures & scenes','relationship structures','expression & style',
     'consent & negotiation','vibe & crowd'
   );
```

- [ ] **Step 3: Dry-run and confirm the row count**

`BEGIN; <the UPDATE> ROLLBACK;` — expect ~1,736 rows. `description_i18n` must be untouched; confirm with a `count(*) FILTER (WHERE description_i18n <> '{}')` before and after inside the transaction.

- [ ] **Step 4: Stop the translator refilling it**

In `supabase/functions/translate-i18n-batch/index.ts`, the `unified_tags` entry of `TABLE_FIELDS` currently reads:

```ts
  unified_tags: {
    id_field: 'id',
    sources: ['name', 'description'],
    i18n_map: { name: 'name_i18n', description: 'description_i18n' },
  },
```

The `name` source must be skipped for sense-category rows. Import `isSenseCategory` from `../_shared/tag-style.ts` and, where the function builds the per-row source list for `unified_tags`, drop `'name'` when `isSenseCategory(row.category)` is true. Keep `'description'` in every case.

Read the surrounding loop before editing — the exact insertion point depends on how rows are batched, and this plan does not guess at code it has not read.

- [ ] **Step 5: Add a regression test**

Create `supabase/functions/translate-i18n-batch/senseCategory.test.ts` asserting that the source list for a `Slang & Language` tag excludes `name` and includes `description`, and that a `Venue Types` tag keeps both.

- [ ] **Step 6: Run and commit**

```bash
npm run test:functions
git add supabase/migrations/20261128100300_tag_name_i18n_sense_purge.sql supabase/functions/translate-i18n-batch/
git commit -m "fix(tags): purge and stop writing sense-category name translations

unified_tags.name_i18n has no reader (positive control: description_i18n does),
and for sense categories its content is wrong — Stud -> es 'Estudio', Ussy ->
es 'Vagina', Cruising -> fr 'Croisière'. 1,736 rows cleared and the translator
no longer refills them. Description translations are untouched.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Four deterministic sentinels

No LLM verdicts. Each is mechanically checkable and cannot false-positive a correct definition.

**Files:**
- Create: `supabase/migrations/20261128100400_tag_hygiene_language_sentinels.sql`
- Modify: `src/lib/__tests__/tagHygieneStats.test.ts`
- Modify: `scripts/check-pipeline-health.mjs`

- [ ] **Step 1: Read the current definition so the replacement is complete**

Run: `grep -rl 'tag_hygiene_stats' supabase/migrations/ | sort | tail -1`

Open that file and copy the **entire** existing `CREATE OR REPLACE FUNCTION public.tag_hygiene_stats()` body. The new migration must restate every existing key — a `CREATE OR REPLACE` that drops keys silently breaks `TagHygienePanel` and `check-pipeline-health.mjs`.

- [ ] **Step 2: Extend the test first**

Add to `src/lib/__tests__/tagHygieneStats.test.ts`:

```ts
it('exposes the language sentinels', () => {
  const sql = latestTagHygieneStatsSql()   // reuse the helper already in this file
  expect(sql).toContain('slug_diacritic_lossy')
  expect(sql).toContain('name_mojibake')
  expect(sql).toContain('name_contains_hashtag')
  expect(sql).toContain('non_latin_name')
})

it('keys slug_diacritic_lossy on a non-ASCII name', () => {
  // Without this guard the key degrades into the unqualified drift predicate,
  // which matches 115 rows of which 106 are deliberate namespace prefixes.
  const sql = latestTagHygieneStatsSql()
  const idx = sql.indexOf('slug_diacritic_lossy')
  expect(sql.slice(idx, idx + 400)).toMatch(/\[\^\\?\\x00-\\?\\x7F\]/)
})
```

If `latestTagHygieneStatsSql()` does not exist in that file, write it using the same `readdirSync` + sort-and-take-last pattern as `tagSlugSeal.test.ts` in Task 1.

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/lib/__tests__/tagHygieneStats.test.ts`
Expected: FAIL on all four keys.

- [ ] **Step 4: Write the migration**

Restate the existing body and add these four keys to the returned jsonb:

```sql
    'slug_diacritic_lossy', (
      SELECT count(*) FROM public.unified_tags
       WHERE name ~ '[^\x00-\x7F]'
         AND slug IS DISTINCT FROM public.normalize_tag_slug(name)
    ),
    'name_mojibake', (
      SELECT count(*) FROM public.unified_tags
       WHERE name LIKE '%' || U&'\FFFD' || '%'
    ),
    'name_contains_hashtag', (
      SELECT count(*) FROM public.unified_tags
       WHERE status = 'active' AND name LIKE '%#%'
    ),
    'non_latin_name', (
      SELECT count(*) FROM public.unified_tags
       WHERE name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]'
    ),
```

`non_latin_name` asserts `tag_language_guard` still holds; it is 0 today and a non-zero value means the trigger was dropped or bypassed.

- [ ] **Step 5: Run the test, then verify live**

Run: `npx vitest run src/lib/__tests__/tagHygieneStats.test.ts` → PASS.

Then via MCP: `SELECT * FROM tag_hygiene_stats();` and confirm every pre-existing key is still present alongside the four new ones. Expected after Tasks 2 and 5: `slug_diacritic_lossy` 0, `name_contains_hashtag` 0, `non_latin_name` 0, `name_mojibake` ≥1 (the merged `M�Llerian` row).

- [ ] **Step 6: Wire the zero-invariants into CI**

In `scripts/check-pipeline-health.mjs`, follow the existing `tag_hygiene_stats` handling and hard-fail on `slug_diacritic_lossy > 0`, `name_contains_hashtag > 0` and `non_latin_name > 0`. Leave `name_mojibake` as a warning until the merged row is dispositioned, and say so in a comment — a check that fails on day one gets muted.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261128100400_tag_hygiene_language_sentinels.sql src/lib/__tests__/tagHygieneStats.test.ts scripts/check-pipeline-health.mjs
git commit -m "feat(tags): deterministic language sentinels in tag_hygiene_stats

slug_diacritic_lossy, name_mojibake, name_contains_hashtag, non_latin_name.
All mechanically checkable; no LLM verdicts, because the judge for this job
was measured at ~19% precision and destroyed 13 correct definitions.

slug_diacritic_lossy is keyed on a non-ASCII name and a test asserts that,
so it cannot degrade into the unqualified drift predicate that matches 115
rows of which 106 are deliberate namespace prefixes.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Upstream language hygiene

Stops the *next* German-language source repeating this. Lower priority than Tasks 1–7 and safe to ship separately.

**Files:**
- Modify: `supabase/functions/_shared/ai-enrichment.ts:236-247` and `:278-288`
- Modify: `supabase/functions/source-milchjugend/index.ts:145`

- [ ] **Step 1: Add an output-language instruction to both enrichment prompts**

The venue prompt (`:236-247`) and event prompt (`:278-288`) feed the model a scraped page and ask for `suggested_tags`, with no language constraint — so a German venue page reliably yields German tags. Add to both:

```
All suggested_tags MUST be in English. If the source page is in another
language, translate the concept; never emit the source-language term.
```

- [ ] **Step 2: Stop the raw German section headings**

`source-milchjugend/index.ts:145` spreads `...e.categories, ...e.tags` — raw, unslugified German section headings from a Zurich site. This is the direct origin of `Bühne`, `Beratung`, `Bildung`, `Vernetzung` and `Gesundheit`.

These are navigation labels, not content tags. Drop `e.categories` from the spread and keep `'lgbtq'` plus anything already normalised. Check `source-gay-ch:273`, `source-display-magazin:251` and `source-eventfrog:120` for the same shape while here.

- [ ] **Step 3: Verify nothing else regressed**

Run: `npm run test:functions`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/ai-enrichment.ts supabase/functions/source-milchjugend/index.ts
git commit -m "fix(tags): stop German entering tags[] at the source

The venue and event enrichment prompts fed the model a scraped page with no
output-language instruction, so a German page yielded German suggested_tags.
source-milchjugend spread raw German section headings straight into
events.tags — the direct origin of Bühne/Beratung/Bildung/Vernetzung/
Gesundheit.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Verification

- [ ] **Step 1: Confirm the repairs held**

```sql
SELECT
  (SELECT count(*) FROM unified_tags
    WHERE name ~ '[^\x00-\x7F]' AND slug IS DISTINCT FROM normalize_tag_slug(name)) lossy,
  (SELECT count(*) FROM unified_tags WHERE status='active' AND name LIKE '%#%') hashtag,
  (SELECT usage_count FROM unified_tags WHERE slug='gay') gay_uses,
  (SELECT slug FROM unified_tags WHERE slug='mat-silicone') silicone,
  (SELECT usage_count FROM unified_tags WHERE slug='mat-silicone') silicone_uses;
```

Expected: `lossy 0`, `hashtag 0`, `gay_uses` ≈4,914, `silicone` = `mat-silicone`, `silicone_uses` ≈4,643.

- [ ] **Step 2: Confirm the German losers redirect rather than 404**

```sql
SELECT from_slug, to_slug FROM tag_slug_redirects
 WHERE from_slug IN ('schwul','lesbisch','b-hne','m-nchen','buhne','munchen')
 ORDER BY from_slug;
```

- [ ] **Step 3: Confirm the producer is sealed — after the next Sunday run**

```sql
SELECT count(*) FROM unified_tags
 WHERE created_at > now() - interval '8 days'
   AND name ~ '[^\x00-\x7F]' AND slug IS DISTINCT FROM normalize_tag_slug(name);
-- expect 0

SELECT count(*), min(created_at) FROM ai_suggestions
 WHERE suggestion_type='tag' AND entity_type='tag' AND status='pending';
-- expect > 0 once the cron has run: proposals, not insertions
```

This is the only check that proves Task 3 worked, and it cannot be run before the cron fires (`0 5 * * 0`). Note the date it was verified.

- [ ] **Step 4: Full gate**

```bash
npm run lint && npm run typecheck && npm test && npm run test:functions
```

- [ ] **Step 5: Open the PR**

Base it on `origin/main`, not the local `main` ref — the local one in this worktree is 227 commits stale, and a stale base silently reverts merged work.

```bash
git fetch origin
git rebase origin/main
gh pr create --base main --title "fix(tags): put English in the English column, and seal the producer that kept filling it with German"
```

---

## Notes for whoever picks this up

**What was measured and rejected, so you do not rebuild it:**

- "Flag tags whose name equals their own German translation" — ~5% precision, flags `Party`, `Film`, `Pride`, `Transgender` (4,714 uses). English words German borrowed.
- "Repair every `slug <> normalize_tag_slug(name)`" — 115 rows, 8 defects. Would rename `mat-silicone` and break 4,643 links.
- `duplicate_active_name` as a merge list — 13 of 14 are marketplace facets vs glossary terms.
- Any LLM pass over descriptions or synonyms — the judge for this exact job retracted 16 definitions, 13 of them correct, at high self-reported confidence. It is disabled by decision and `tag_prose_apply` lost its retract branch at the DB layer so it cannot be re-enabled by accident.

**Sibling-session hazard:** two other worktrees hold migrations at `20261126100000` — the same version, two different filenames. A duplicate version is a silent skip under `db push`. That is not this branch's problem to fix, but do not add a third.
