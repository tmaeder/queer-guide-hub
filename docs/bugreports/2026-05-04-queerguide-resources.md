# Bug report — `/resources`, `/resources/[slug]`, `/help` (2026-05-04)

A black-box test of `https://queer.guide/resources` and its sub-routes (`/resources/[slug]`, `/help`) produced the tiered findings below. Severity tiers are the source of truth — do not reorder without flagging.

PR follow-up table is at the bottom of this file. As fixes land, append `Fixed in #PR-NUM (YYYY-MM-DD)` to the relevant row.

---

## P0 — ship today

### P0-1 — Tag Relationship Graph: 403 on Supabase RPC
- **Repro:** open the network tab on `/resources` → switch to graph view. `POST /rest/v1/rpc/get_tag_graph_data` returns 403.
- **Suspected root cause:** `get_tag_graph_data` is `SECURITY DEFINER` but its `GRANT EXECUTE` is missing for `anon`/`authenticated`. Same class as historical helper-grant bugs.
- **Fix:**
  - Add `GRANT EXECUTE ON FUNCTION public.get_tag_graph_data(...) TO anon, authenticated;` migration. Apply via Supabase CLI/MCP.
  - Audit the function body — confirm no dynamic SQL; confirm `search_path` is pinned.
  - Frontend: surface a distinct error state ("Couldn't load the tag graph" + retry button); do not fall back silently to "0 tags, 0 links".
- **Tests:** unit test mocks 403 → asserts error UI; Playwright e2e loads graph view, asserts ≥1 node renders and the network call returned 200.

### P0-2 — `/help` mixed German/English
- **Repro:** visit `https://queer.guide/help` in an English session. "Hilfe & Krisen-Hotlines" headings appear interleaved with English emergency CTAs.
- **Discovery note (2026-05-04):** explore agent confirmed `HelpHotlines.tsx` uses `t()` for every visible string and DE/EN bundles are complete. Likely real causes: (a) CMS row `cms_pages.body_html` for `slug='help'` stored in one language only, (b) i18n init flash before namespaces load, (c) `COUNTRY_NAMES` / `TOPIC_TO_RESOURCE` maps in `HelpHotlines.tsx:73-100` bleeding into render.
- **Fix:**
  - Reproduce locally first, screenshot the actual mix, then fix the real cause.
  - Add a CI heuristic Playwright script that loads `/help` and `/resources` under `?lng=en` and `?lng=de` and fails if visible text overlaps the wrong-locale bundle.
- **No prerender / build-time per-locale HTML** — this is an SPA.

### P0-3 — Adult content with no age gate
- **Fix:**
  - Session-level "I am 18+" affirmation modal gating the Sex & Kink subtree (any tag whose primary category is "Sexuality & Kink" or "Fetishes"). Persist 30 days in `localStorage` (`qg_age_affirmation`); clear on logout.
  - Global "Safe mode" toggle (default ON for new visitors) — hides 18+ tags from the landing's Popular tags, search, and category counts. Surface a small "Show 18+ content" button.
  - `<meta name="robots" content="noindex">` on 18+ tag pages until the gate is in place.
- **Tests:** Playwright loads an 18+ tag URL with cleared localStorage, asserts the gate renders before any explicit content; toggling Safe mode hides/shows tiles.
- **Server-side `is_adult` column** is deferred. Client-side gate ships first; schema change is a separate PR for human review.

---

## P1 — ship this sprint

### P1-1 — URL-driven search/filter/sort/view state
- Move filter/search store into URL query params: `q`, `cat`, `tag`, `hasImage`, `sort`, `dir`, `view`. Use React Router v7 `useSearchParams`. Debounce `q` updates ~300 ms. Hydrate from URL on mount, push to URL on change.
- E2E: load `/resources?cat=BDSM&hasImage=1&sort=alpha&dir=asc` and assert filter chips show, result set matches, URL stays put across in-page interactions.

### P1-2 — Unify counts: one source of truth
- Two queries today produce divergent counts ("BDSM 688" on the Sex & Kink card vs "BDSM 41" on the filter chip): `get_category_tree.total_tag_count` vs client-side `filteredAndSortedTags.length`.
- If the difference is intentional, **relabel** ("Tags in BDSM (incl. subcategories): 688" vs "Tags directly in BDSM: 41"). Don't surface two different numbers under the same label.
- Otherwise add a canonical RPC `get_tag_counts_by_category()` and route every surface through it.
- Test: snapshot — for every category, landing card count === filter chip count for the same scope.
- Production data changes flagged for human review.

### P1-3 — Popular tag chips: single click navigates
- Replace `<button>` with `<a href="/resources/[slug]">` in `TagListRenderer.tsx:164`. Remove focus-on-first-click behavior.
- E2E: single-click "Zucchini" → URL `/resources/zucchini`.

### P1-4 — Unknown `/resources/[slug]` returns real 404
- In the slug fetch path, when the tag doesn't exist, render `<NotFound />` instead of resetting `viewMode` to overview. Use a React Router loader if practical (`throw new Response('Not Found', { status: 404 })`).
- E2E: `/resources/asdfgibberish` renders the 404 component.

### P1-5 — Per-page metadata on tag and category pages
- Use `react-helmet-async` (SPA equivalent of Next's `generateMetadata`).
- `/resources/:slug`: `<title>{Tag} — Queer Guide</title>`, `og:title`, `og:description` (tag description; fall back to template), `og:image` (tag hero), `<link rel="canonical">`.
- JSON-LD: `DefinedTerm` where the tag has a description; `Article` for resource entries that read like articles.
- E2E: fetch `/resources/Lesbian` and assert the meta tags contain the tag name.
- **SEO trade-off:** metadata is JS-injected (SPA). Crawlers that don't execute JS will not see it. Documented; prerender deferred.

### P1-6 — Categories get their own routes
- Add `/resources/c/:category` to `routes.tsx`. The inline panel becomes a transition state of these routes.
- Update landing category cards to link to these routes.
- Server-render is out of scope (SPA); inline rendering inside `Ressources.tsx` is fine for v1.
- E2E: visiting `/resources/c/identity` directly renders the Identity subpanel.

### P1-7 — Canonicalize slug case
- Pick lowercase. In the slug route, if `params.tagName !== params.tagName.toLowerCase()`, navigate (replace) to the lowercase version. Note: SPA — crawlers don't see a 301 status.
- DB constraint or contribute-flow check that all new slugs are lowercase. Migration drafted, flagged for human review.

### P1-8 — Sort: rename labels, surface direction
- Rename dropdown options: "Alphabetical / Most used / Newest". Tooltip the direction button: "Sort direction (ascending/descending)".

### P1-9 — Heading hierarchy on tag pages
- Promote News / Related / Personalities / Wiki section labels to `<h2>`. Tag detail page gets exactly one `<h1>` (the tag name).
- Test: every visible section has `<h2>`; exactly one `<h1>`.

---

## P2 — next polish sprint

- **P2-1.** One source of truth for category labels (enum/lookup). Replace hard-coded label strings.
- **P2-2.** Subcategory lists agree across landing card, filter dropdown, category panel.
- **P2-3.** Split "Popular tags" into "Concepts" (resource taxonomy) and "Venue features". Tag rows with `entity_kind` enum.
- **P2-4.** Audit "Has image" filter — exclude gradient placeholders by checking width/height/MIME.
- **P2-5.** Image curation pass — admin UI to mark hero images approved/rejected. Replace mismatched images.
- **P2-6.** "Definition needed" CTA on tag pages with empty descriptions; fix duplicate-timestamp render bug ("Updated …Updated …").
- **P2-7.** Tighten related-tags algorithm: within-category co-occurrence, embedding-distance cap, manual override for sensitive terms.
- **P2-8.** Tighten news-attachment algorithm: require article body to mention the tag term (or a synonym from `aliases`).
- **P2-9.** Distinguish error vs empty states across the app.

---

## P3 — polish backlog

- **P3-1.** Header search rotating placeholder pinned to a context-appropriate set on `/resources`.
- **P3-2.** Empty-state copy: "No results — try a broader query."
- **P3-3.** Avatar `alt` should be display name, not email.
- **P3-4.** `aria-label` on the 6 unlabeled inputs on `/resources` (search, category, tag, has-image, sort, sort-direction).
- **P3-5.** Promote "Popular tags" and "Browse by category" to `<h2>` on the landing.
- **P3-6.** Sort-direction control: divider or "Direction" label adjacent to the arrow button.
- **P3-7.** Audit "Updated" timestamp — if it's `created_at`, rename the label.
- **P3-8.** "List" view-mode icon — make sure it actually renders a list when the result set is non-empty. Tooltips on all four view-mode icons.
- **P3-9.** Footer language switcher reaches every page including `/help`. Playwright test: switch DE → EN → DE on `/help` and assert full-locale rendering each time.

---

## Definition of done — per finding

- [ ] PR titled `[<finding-id>] <short description>`, branched from `main`
- [ ] PR description links back to this file's relevant section
- [ ] Test that fails on `main` and passes after the change
- [ ] Manual before/after on the deploy preview (screenshot or video)
- [ ] Existing test suite passes; no new TS/ESLint errors
- [ ] Deferred follow-ups named in the PR description

---

## PR follow-up table

| Finding | Status | PR | Date |
|---------|--------|----|------|
| P0-1    |        |    |      |
| P0-2    |        |    |      |
| P0-3    |        |    |      |
| P1-1    |        |    |      |
| P1-2    |        |    |      |
| P1-3    |        |    |      |
| P1-4    |        |    |      |
| P1-5    |        |    |      |
| P1-6    |        |    |      |
| P1-7    |        |    |      |
| P1-8    |        |    |      |
| P1-9    |        |    |      |
| P2-1..9 |        |    |      |
| P3-1..9 |        |    |      |
