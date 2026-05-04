# Discovery — `/resources` + `/help` bug-report fix campaign

Pre-flight findings from the 2026-05-04 black-box bug report. Anchors the implementation work.

## Routing & framework

- **Stack:** React 19 + Vite 6 + TypeScript SPA. **React Router v7** (`react-router`, `<BrowserRouter>` in `src/App.tsx`). NOT Next.js, NOT TanStack Router. No SSR.
- Routes (`src/routes.tsx`):
  - `/resources` and `/resources/:tagName` → both render `Resources` from `src/pages/Ressources.tsx` (note typo)
  - `/help` → `HelpHotlines` (`src/pages/HelpHotlines.tsx`)
  - **No `/resources/c/:category`** — category panel is inline state
  - Locale-aware wrapper at `/:locale?` (line 343)
- Data fetching: TanStack Query hooks in `src/hooks/`. No router loaders.

## Resources page anatomy

- **One mega-component:** `src/pages/Ressources.tsx` (~1000+ lines). State machine via `viewMode: 'overview' | 'category' | 'subcategory' | 'search' | 'tag-detail' | 'professions' | 'graph'`.
- **Filter / search / sort / view-mode state:** all `useState` (lines 47–68). Some URL params read on mount (`?profession`, `?category`); never written back. Search debounces 300ms (line 215–219).
- **Category cards:** `Ressources.tsx:482–525`. Count badge: `cat.total_tag_count` (line 505). Subcategory chips: `c.tag_count` (line 519).
- **Popular tag chips:** `Ressources.tsx:187–194` derives the list, renders via `src/components/resources/TagListRenderer.tsx:159–182`. Chips are `<button>` (line 164), not `<a>`. Limit 24.
- **Tag graph:** component `src/components/tags/TagRelationshipGraph.tsx`; data hook `src/hooks/useTagRelationships.tsx` (`useTagGraph` calls `supabase.rpc('get_tag_graph_data', ...)`).
- **Tag detail:** rendered inline at `Ressources.tsx:271–390` when `tagName` param present. **No `<h1>`** (line 323 uses `<span>`); section labels News/Related/Personalities/Wiki are `<div>`/`<h6>` (line 349+).
- **404 today:** `Ressources.tsx:120–128` — on tag-not-found, resets `viewMode` to overview (silent fallback). No `<NotFound />` rendered.

## Counts — the "688 vs 41" question

Two queries, two scopes.

- **Landing card count (e.g. "BDSM 688"):** `useCentralizedTags.tsx:83` → RPC `get_category_tree`. Returns `CategoryTreeNode[]` with `total_tag_count` (likely parent-rolled-up across children).
- **Filter context count (e.g. "BDSM 41"):** `Ressources.tsx:786` → `filteredAndSortedTags.length`, computed client-side at lines 132–176 from `allTags` filtered by `filterCategory`.
- **Most likely:** labeling problem (parent-roll-up vs leaf), not a query bug. **Read `get_category_tree` SQL** in `supabase/migrations/00000000000000_baseline.sql` before deciding fix shape.

## Help page

- `src/pages/HelpHotlines.tsx` — uses `t()` for every visible string. `en.json:955–971` and `de.json:684–717` both have full `help.*` namespaces.
- Hotline data comes from `cms_pages` row `slug='help'`, `body_json` array (line 8); intro from `body_html` (line 33, DOMPurify sanitized).
- Hardcoded maps: `COUNTRY_NAMES` (line 73–87), `TOPIC_TO_RESOURCE` (line 90–100). Country codes are not user-facing translation strings; topics may be.
- **Mixed-language bug suspected causes** (verify by repro):
  1. CMS row `body_html` stored in one language only — frontend reads the same row regardless of locale.
  2. i18n init flash — `src/i18n/index.ts:57` uses `initImmediate: false`. Brief fallback flash before namespace loads.
  3. Topic map keys leaking the wrong locale into render.

## i18n setup

- Library: `i18next` + `react-i18next` + `i18next-browser-languagedetector` (`package.json`).
- Bundles: `src/i18n/locales/{en,de,es,fr,pt,it,ru,zh,ja,ko,ar}.json`.
- Locale detection order (`src/i18n/index.ts:64`): URL path → localStorage `i18nextLng` → browser `navigator.language` → html lang.
- Language switcher: `src/components/i18n/LanguageSwitcher.tsx` calls `i18n.changeLanguage()` and navigates to `/{locale}{pathWithoutLocale}` (line 42–43). Persists via i18next localStorage.
- No per-route locale override found.

## Supabase RPC `get_tag_graph_data`

- Defined in `supabase/migrations/00000000000000_baseline.sql`.
- Signature: `get_tag_graph_data(p_min_score double precision DEFAULT 0.7, p_category_filter uuid DEFAULT NULL)`.
- Returns JSON `{ nodes, edges }`. Reads `unified_tags`, `tag_relationships`, `tag_categories`.
- `SECURITY DEFINER`, `set search_path = 'public'`. No dynamic SQL.
- **Permission bug confirmed:** only `GRANT ALL ON FUNCTION ... TO service_role`. **No `EXECUTE` for `anon` or `authenticated`** — exact match for the historical RLS-helper-grant class. Causes 403.

## Adult content / age gate

- **No existing logic.** Greenfield.
- Sex & Kink identified by string match in `src/components/resources/categoryMeta.ts:64`: `'Sexuality & Kink': { short: 'Sex & Kink', icon: Flame }`.
- Tags assigned via `tag_category_assignments`. No `is_adult` column.
- Persistence patterns to reuse: localStorage for client state (Supabase auth uses it; `src/integrations/api/client.ts:10–12` uses `qg_session`); sessionStorage used by `TravelPrefsPrompt`.

## Tests

- **Vitest** unit tests in `src/**/__tests__/*.test.ts[x]` (~40+).
- **Playwright** e2e in `e2e/` (~25 specs). Config: `playwright.config.ts`. Auth setup in `auth.setup.ts`. CI: single worker, 2 retries, HTML reporter.
- **No e2e for `/resources` or `/help`** today.
- Tag graph has unit test (`src/components/tags/__tests__/TagRelationshipGraph.test.tsx`) mocking the hook — does NOT test the RPC permission case.

## Stack adaptation note

The bug report references Next-isms (`notFound()`, `generateMetadata`, server-render on first paint, build-time per-locale prerender). This codebase is an SPA. SPA equivalents:

- 404 → React Router loader `throw new Response('Not Found', { status: 404 })`, or component-level `<NotFound />` render.
- Per-page metadata → `react-helmet-async` (verify dep before use).
- "Server-render on first paint" → not applicable; ensure no flash by deriving filtered state synchronously from URL.
- Build-time per-locale prerender → out of scope. Locale guarantee is runtime: block paint until `i18n.isInitialized` and namespace loaded.

## Critical-files cheat sheet

| Surface | File | Findings |
|---------|------|----------|
| Resources page | `src/pages/Ressources.tsx` | P0-3, P1-1, P1-4, P1-5, P1-6, P1-9 |
| Help page | `src/pages/HelpHotlines.tsx` | P0-2 |
| Tag chips | `src/components/resources/TagListRenderer.tsx` | P1-3 |
| Filter bar | `src/components/resources/ResourcesFilterBar.tsx` | P1-1, P1-8 |
| Category meta | `src/components/resources/categoryMeta.ts` | P0-3 |
| Tag counts hook | `src/hooks/useCentralizedTags.tsx` | P1-2 |
| Tag graph hook | `src/hooks/useTagRelationships.tsx` | P0-1 |
| Tag graph test | `src/components/tags/__tests__/TagRelationshipGraph.test.tsx` | P0-1 |
| i18n | `src/i18n/index.ts`, `src/i18n/locales/{en,de}.json` | P0-2 |
| Routes | `src/routes.tsx` | P1-6 |
| Migration source | `supabase/migrations/00000000000000_baseline.sql` | P0-1 (read), P1-2 (read), P1-7 (write) |
| E2E | `e2e/` | every P0/P1 fix lands a spec |
