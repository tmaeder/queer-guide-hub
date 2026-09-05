/**
 * /tags — the LGBTQ+ glossary index.
 *
 * What this replaces and why:
 *
 * The page here before was a "Resource Hub". It opened with the headline "Help
 * & resources.", then spent the whole first screen on a crisis-hotline strip
 * (a copy of /help), a topic-hub grid, and a support-organisation directory (a
 * copy of /organizations) — and hid the actual 3,700-term glossary behind a
 * COLLAPSED disclosure labelled "Browse all topics & search". The product was
 * the thing you had to click to find. Browsing and searching are the page now;
 * the duplicated crisis and organisation content is gone, and /help and
 * /organizations own it as they already did.
 *
 * Structure:
 *   masthead → ink scale-board → [taxonomy rail | spine + A–Z + results]
 *   → end of line
 *
 * Two things worth knowing before editing:
 *
 * 1. **The category is in the PATH** (`/tags/c/:categorySlug`), not a query
 *    param. Three spellings of that filter used to coexist — `?cat=<name>`,
 *    `?category=<name>` and the path — reconciled by a 40-line effect that also
 *    flipped a view mode. The two query forms are now legacy inputs that
 *    resolve to a redirect (see tagsIndexState).
 * 2. **Everything derives from ONE indexing pass** (`entries`), memoized on the
 *    tag corpus alone. The old pipeline lowercased 3,700 names *and*
 *    descriptions on every keystroke, in two different places.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useCentralizedTags, useTagUsageCounts } from '@/hooks/useCentralizedTags';
import type { CategoryTreeNode, CentralizedTag } from '@/hooks/useCentralizedTags';
import { useTagAliasSearch } from '@/hooks/useTagAliasSearch';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { useMeta } from '@/hooks/useMeta';
import { PageContainer, STICKY_RAIL_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { getCategoryShortName, parentOrder } from '@/components/resources/categoryMeta';
import { CATEGORY_LINE_ORDER, lineForCategory } from '@/lib/tags/categoryIdentity';
import { redirectedCategorySlug } from '@/lib/tags/categorySlugRedirects';
import { GatedTagsNotice } from '@/components/tags/GatedTagsNotice';
import {
  applyTagsParams,
  compareTagsBy,
  hasActiveFilters,
  letterFor,
  parseTagsParams,
  serializeTagsParams,
  DEFAULT_TAGS_STATE,
  KIND_FILTER_MATCHES,
  MIN_SERVER_QUERY,
  type TagKindFilter,
  type TagSort,
  type TagUsageFilter,
  type TagView,
  type TagsIndexState,
} from '@/lib/tags/tagsIndexState';
import { TagsFilterSpine } from '@/components/tags/index/TagsFilterSpine';
import { CategoryTreeRail } from '@/components/tags/index/CategoryTreeRail';
import { TagAlphabetRail } from '@/components/tags/index/TagAlphabetRail';
import { TagResults } from '@/components/tags/index/TagResults';
import { TagsEndOfLine } from '@/components/tags/index/TagsEndOfLine';
import { FlagWall } from '@/components/tags/FlagWall';

/** One pass over the corpus. Every filter afterwards is a field read. */
interface TagIndexEntry {
  tag: CentralizedTag;
  haystack: string;
  letter: string;
  parentName: string | null;
  categoryNames: (string | null | undefined)[];
}

export default function TagsIndex() {
  const { t } = useTranslation();
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const navigate = useLocalizedNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { allTags, categoriesTree, loading, error } = useCentralizedTags();
  const { data: usageCounts = {} } = useTagUsageCounts();
  const safeMode = useSafeMode();

  // ── URL state ───────────────────────────────────────────────────────────
  const resolveCategorySlug = useCallback(
    (value: string): string | null => {
      const lower = value.toLowerCase();
      for (const parent of categoriesTree) {
        if (parent.name === value || parent.slug?.toLowerCase() === lower) return parent.slug;
        const child = parent.children?.find(
          (c) => c.name === value || c.slug?.toLowerCase() === lower,
        );
        if (child) return child.slug;
      }
      // Retired v2 category. The tree stopped carrying these when 20261006150000
      // deleted them, so the live loop above can no longer resolve a legacy
      // `?cat=`/`?category=` link and `parseTagsParams` would hold the param
      // forever — the reader lands on an unfiltered glossary instead of the
      // category they asked for. categorySlugRedirects' own header says it
      // serves these params; this is the call that makes that true.
      //
      // Both spellings have to be tried: the map is keyed by SLUG, while
      // `?cat=` carries the display NAME ("Health & Wellness"), which is what
      // the page emitted when these links were minted. The slugify rule is the
      // one the v2 slugs were derived under, so "Body Types & Archetypes"
      // collapses the ampersand into the separator run and lands on
      // `body-types-archetypes`.
      return (
        redirectedCategorySlug(lower) ??
        redirectedCategorySlug(lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      );
    },
    [categoriesTree],
  );

  const { state, changed, redirectTo } = parseTagsParams(searchParams, resolveCategorySlug);

  // A retired v2 category slug reaching the SPA (an in-app link, a bookmark
  // restored by the router, a ?cat= resolution) never touches Cloudflare, so
  // the 301s in public/_redirects cannot help it. Same map, client side.
  const retiredSlugTarget = redirectedCategorySlug(categorySlug);

  useEffect(() => {
    if (retiredSlugTarget) {
      const qs = searchParams.toString();
      navigate(`/tags/c/${retiredSlugTarget}${qs ? `?${qs}` : ''}`, { replace: true });
      return;
    }
    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }
    if (changed) setSearchParams(applyTagsParams(searchParams, state), { replace: true });
    // `state` is derived from `searchParams`; including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retiredSlugTarget, redirectTo, changed, searchParams]);

  // `state` is re-derived from the URL on every render, so it is a fresh object
  // each time and cannot be a dependency without making `patch` unstable (and
  // `JSON.stringify(state)` is not a dependency expression the lint rule
  // accepts). A ref is the honest version: the callback identity never changes,
  // and it always reads the current state at call time.
  // Written in an effect, never during render: a render-phase ref write makes
  // the React Compiler bail out of optimizing this whole component (it reported
  // both `react-hooks/refs` and, downstream, `preserve-manual-memoization` on
  // the `scope` memo below). `patch` only ever runs from an event handler, by
  // which point every effect for the render the reader is looking at has
  // flushed — so the value it reads is the same one it read before.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const patch = useCallback(
    (next: Partial<TagsIndexState>) => {
      setSearchParams((prev) => applyTagsParams(prev, { ...stateRef.current, ...next }), {
        replace: true,
      });
    },
    [setSearchParams],
  );

  // ── The single indexing pass ────────────────────────────────────────────
  const { entries, byId } = useMemo(() => {
    const list: TagIndexEntry[] = (allTags ?? []).map((tag) => {
      const categoryNames = [
        ...(tag.categories?.map((c) => c.name) ?? []),
        ...(tag.categories?.map((c) => c.parent_name ?? null) ?? []),
      ];
      const primary = tag.categories?.find((c) => c.is_primary) ?? tag.categories?.[0];
      return {
        tag,
        haystack: `${tag.name} ${tag.slug} ${tag.description ?? ''}`.toLowerCase(),
        letter: letterFor(tag.name),
        parentName: primary?.parent_name ?? primary?.name ?? null,
        categoryNames,
      };
    });
    return { entries: list, byId: new Map(list.map((e) => [e.tag.id, e])) };
  }, [allTags]);

  // ── Category scope, from the path ───────────────────────────────────────
  const scope = useMemo(() => {
    if (!categorySlug) return null;
    const lower = categorySlug.toLowerCase();
    const parent = categoriesTree.find((c) => c.slug?.toLowerCase() === lower);
    // `id` is carried for the graph: get_tag_graph_data's p_category_filter is
    // typed `uuid`, so filtering it by name raises 22P02 and the graph shows an
    // error instead of a filtered network.
    if (parent) {
      return { id: parent.id, name: parent.name, isParent: true, node: parent as CategoryTreeNode };
    }
    // Resolved with `find`, not a `for` loop that returns from inside it: the
    // React Compiler cannot preserve manual memoization across an early return
    // out of a loop, and bailed on this whole component because of it.
    const owner = categoriesTree.find((p) =>
      p.children?.some((c) => c.slug?.toLowerCase() === lower),
    );
    const child = owner?.children?.find((c) => c.slug?.toLowerCase() === lower);
    if (owner && child) {
      return { id: child.id, name: child.name, isParent: false, parentName: owner.name };
    }
    return null;
  }, [categorySlug, categoriesTree]);

  /** Safe mode + the explicit `?adult=1` opt-in. The index did NO safe-mode
   *  filtering at all before this, so 18+ terms sat in the grid for signed-out
   *  visitors while the detail page dutifully gated them. */
  const hideAdult = safeMode.enabled && !state.adult;

  const inScope = useCallback(
    (e: TagIndexEntry) => {
      if (!scope) return true;
      return e.categoryNames.some((n) => n === scope.name);
    },
    [scope],
  );

  const base = useMemo(
    () =>
      entries.filter((e) => {
        const entityKind = (e.tag as { entity_kind?: string | null }).entity_kind ?? 'concept';
        // Proper names are not glossary content — never on the public index.
        if (entityKind === 'person') return false;
        if (state.kind !== 'all' && !KIND_FILTER_MATCHES[state.kind].has(entityKind)) {
          return false;
        }
        if (hideAdult && safeMode.shouldHide(e.categoryNames)) return false;
        if (!inScope(e)) return false;
        // Default curation: the unscoped index shows every dictionary term
        // (unused kink vocabulary included — it ranks last under the usage
        // sort) but hides UNUSED descriptors/labels — an unused descriptor is
        // pure noise, not a definition. Any explicit filter or search widens
        // back to everything, and category pages always show their whole stop.
        if (
          !scope &&
          state.usage === 'all' &&
          state.kind === 'all' &&
          !state.q.trim() &&
          entityKind !== 'concept' &&
          entityKind !== 'practice' &&
          entityKind !== 'aesthetic' &&
          (usageCounts[e.tag.name] || 0) === 0
        ) {
          return false;
        }
        return true;
      }),
    [entries, hideAdult, safeMode, inScope, scope, state.kind, state.usage, state.q, usageCounts],
  );

  /** Letter counts reflect every filter EXCEPT the letter itself — otherwise
   *  picking B would grey out every other letter and strand the reader. */
  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of base) {
      if (state.q.trim() && !e.haystack.includes(state.q.trim().toLowerCase())) continue;
      if (state.usage === 'used' && (usageCounts[e.tag.name] || 0) === 0) continue;
      if (state.usage === 'unused' && (usageCounts[e.tag.name] || 0) > 0) continue;
      counts[e.letter] = (counts[e.letter] ?? 0) + 1;
    }
    return counts;
  }, [base, state.q, state.usage, usageCounts]);

  const narrow = useCallback(
    (list: TagIndexEntry[]) =>
      list.filter((e) => {
        if (state.letter && e.letter !== state.letter) return false;
        if (state.usage === 'used' && (usageCounts[e.tag.name] || 0) === 0) return false;
        if (state.usage === 'unused' && (usageCounts[e.tag.name] || 0) > 0) return false;
        return true;
      }),
    [state.letter, state.usage, usageCounts],
  );

  const sortEntries = useCallback(
    (list: TagIndexEntry[]) => {
      const compare = compareTagsBy(state.sort, state.dir, usageCounts);
      return [...list].sort((a, b) => compare(a.tag, b.tag));
    },
    [state.sort, state.dir, usageCounts],
  );

  // ── Search ──────────────────────────────────────────────────────────────
  // The instant substring filter paints on the first keystroke; the alias RPC
  // catches what a substring structurally cannot ("NB" → "non-binary") and
  // lands in its OWN block below, never interleaved — a fuzzy trigram hit must
  // not look like a direct match.
  const query = state.q.trim().toLowerCase();
  const { hits: aliasHits, loading: searching } = useTagAliasSearch(state.q);

  const primaryResults = useMemo(() => {
    const matched = query ? base.filter((e) => e.haystack.includes(query)) : base;
    return sortEntries(narrow(matched));
  }, [base, query, narrow, sortEntries]);

  const aliasResults = useMemo(() => {
    if (query.length < MIN_SERVER_QUERY || !aliasHits.length) return [];
    const already = new Set(primaryResults.map((e) => e.tag.id));
    const scoped = new Set(base.map((e) => e.tag.id));
    const out: TagIndexEntry[] = [];
    for (const hit of aliasHits) {
      if (already.has(hit.id) || !scoped.has(hit.id)) continue;
      // Join back to the corpus by id: the RPC row carries no `categories[]`,
      // which the card label, the category scope and the adult filter all need.
      const entry = byId.get(hit.id);
      if (!entry) continue;
      out.push(entry);
    }
    // An alias hit is a search result, not a filter bypass.
    return narrow(out);
  }, [aliasHits, query, primaryResults, base, byId, narrow]);

  const aliasIds = useMemo(
    () => new Set(aliasHits.filter((h) => h.match_via === 'alias').map((h) => h.id)),
    [aliasHits],
  );

  // ── Presentation helpers ────────────────────────────────────────────────
  const lineFor = useCallback(
    (tag: CentralizedTag) => lineForCategory(byId.get(tag.id)?.parentName),
    [byId],
  );
  const categoryLabelFor = useCallback((tag: CentralizedTag) => {
    const primary = tag.categories?.find((c) => c.is_primary) ?? tag.categories?.[0];
    return primary ? getCategoryShortName(primary.name) : undefined;
  }, []);

  /** The graph filters by `tag_categories.id`, so the picker needs ids, not the
   *  display names the rail uses. Ordered by `parentOrder` via CATEGORY_LINES. */
  const graphCategories = useMemo(
    () =>
      CATEGORY_LINE_ORDER.map((line) => {
        const node = categoriesTree.find((c) => c.name === line.name);
        return node ? { id: node.id, name: getCategoryShortName(node.name) } : null;
      }).filter((c): c is { id: string; name: string } => c !== null),
    [categoriesTree],
  );

  const paramsSuffix = useMemo(() => {
    const qs = serializeTagsParams({ ...state, letter: null }).toString();
    return qs ? `?${qs}` : '';
  }, [state]);

  const title = scope ? getCategoryShortName(scope.name) : t('tags.hero.title', 'The glossary');
  useMeta({
    title: scope
      ? t('tags.meta.categoryTitle', '{{name}} — LGBTQ+ glossary', { name: scope.name })
      : t('tags.meta.title', 'LGBTQ+ glossary'),
    description: t(
      'tags.meta.description',
      'Browse and search {{count}} LGBTQ+ terms — identities, practices, history and community language, each linked to the venues, events, people and news that use it.',
      { count: entries.length },
    ),
    canonicalPath: categorySlug ? `/tags/c/${categorySlug}` : '/tags',
  });

  if (loading) {
    // THE HEADING IS PART OF THE LOADING STATE, NOT PART OF THE PAYLOAD.
    //
    // This branch used to render the spinner alone, so /tags had no `h1` at
    // all until `useCentralizedTags()` resolved. That made the page's identity
    // a function of database latency: `e2e/intent-nav.spec.ts` asserts
    // `main h1` is visible with a 5s timeout, and on 2026-08-24 it failed
    // three times in a row on an unrelated PR while the tag tables were slow
    // (`tag_hygiene_stats()` was returning 57014 statement timeouts in the same
    // window). Nothing was broken about /tags — the query was just slower than
    // the assertion, and a required check went red on a change that had not
    // touched tags.
    //
    // The fix is not a longer timeout. A page that cannot say what it is until
    // its data arrives is worse for a screen reader and for anyone on a slow
    // connection, who gets an unlabelled spinner instead of "The glossary".
    // `title` needs no data on the index (`scope` is null without a
    // `categorySlug`), and on a scoped page it degrades to the family name
    // until the real one loads — honest, and it stops the heading moving.
    return (
      <PageContainer as="header">
        <Eyebrow variant="kicker" as="div">
          {t('tags.hero.eyebrow', 'Glossary')}
        </Eyebrow>
        <h1 className="mt-6 text-hero leading-[0.95]">{title}</h1>
        <div className="mt-10">
          <TrackLoader label={t('tags.loading', 'Loading the glossary')} />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="bg-muted rounded-container p-6">
          <h1 className="font-display text-headline">{t('tags.error', 'The glossary is down')}</h1>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
          >
            {t('tags.retry', 'Try again')}
          </button>
        </div>
      </PageContainer>
    );
  }

  // Count only the lines the page actually renders (parentOrder), not every
  // root in tag_categories — during the taxonomy-swap coexistence window the
  // table holds two trees and an unfiltered count inflates the hero stat.
  const stopCount = categoriesTree.reduce(
    (n, c) => n + (parentOrder.includes(c.name) ? (c.children?.length ?? 0) : 0),
    0,
  );
  const filtered = hasActiveFilters(state);

  return (
    <>
      <PageContainer as="header" className="pb-0">
        <Eyebrow variant="kicker" as="div">
          {t('tags.hero.eyebrow', 'Glossary')}
        </Eyebrow>
        <h1 className="mt-6 text-hero leading-[0.95]">{title}</h1>
        <p className="mt-6 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {scope
            ? t('tags.category.lede', 'Every term filed under {{name}}.', { name: scope.name })
            : t(
                'tags.hero.lede',
                'Every word the guide uses, defined — and everything tagged with it.',
              )}
        </p>
        <p className="mt-6 flex items-center gap-2 text-13 tabular-nums text-muted-foreground">
          <RouteBullet type="tag" size={30} />
          {t('tags.hero.legend', '{{terms}} terms · {{lines}} lines · {{stops}} stops', {
            terms: entries.length,
            lines: parentOrder.length,
            stops: stopCount,
          })}
        </p>
      </PageContainer>

      {!scope && (
        <div className="mt-10 bg-foreground text-background">
          <PageContainer>
            <Eyebrow as="p" className="text-background/70">
              {t('tags.stats.kicker', 'The corpus')}
            </Eyebrow>
            <dl className="mt-6 grid grid-cols-3 gap-x-6 gap-y-8">
              {[
                { value: entries.length, label: t('tags.stats.terms', 'Terms') },
                { value: parentOrder.length, label: t('tags.stats.lines', 'Lines') },
                { value: stopCount, label: t('tags.stats.stops', 'Stops') },
              ].map((s) => (
                <div key={s.label}>
                  <dd className="font-display text-display leading-none tabular-nums md:text-hero">
                    {s.value}
                  </dd>
                  <dt className="mt-2 text-2xs uppercase tracking-label text-background/70">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
          </PageContainer>
        </div>
      )}

      <PageContainer as="section" flush className="pb-16 md:pb-24">
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[224px_minmax(0,1fr)]">
          <CategoryTreeRail
            tree={categoriesTree}
            activeSlug={categorySlug ?? null}
            paramsSuffix={paramsSuffix}
            className={cn('sticky hidden self-start lg:block', STICKY_RAIL_UNDER_HEADER)}
          />
          <CategoryTreeRail
            tree={categoriesTree}
            activeSlug={categorySlug ?? null}
            paramsSuffix={paramsSuffix}
            orientation="horizontal"
            className="lg:hidden"
          />

          <div className="min-w-0">
            {/* The one sanctioned chromatic surface in the tag system — see
                FlagWall's header comment. */}
            {categorySlug?.toLowerCase() === 'symbols-flags' && <FlagWall />}

            <TagsFilterSpine
              q={state.q}
              onQ={(q) => patch({ q })}
              view={state.view}
              onView={(view: TagView) => patch({ view })}
              sort={state.sort}
              onSort={(sort: TagSort) => patch({ sort })}
              dir={state.dir}
              onDir={() => patch({ dir: state.dir === 'asc' ? 'desc' : 'asc' })}
              usage={state.usage}
              onUsage={(usage: TagUsageFilter) => patch({ usage })}
              kind={state.kind}
              onKind={(kind: TagKindFilter) => patch({ kind })}
            />

            {state.view !== 'graph' && (
              <TagAlphabetRail
                letter={state.letter}
                counts={letterCounts}
                onChange={(letter) => patch({ letter })}
                className="mt-6"
              />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {/* A count, never the grid — announcing a whole list of cards on
                  every keystroke is what makes a live region hostile. */}
              <p role="status" className="text-13 tabular-nums text-muted-foreground">
                {searching
                  ? t('tags.searching', 'Searching…')
                  : t('tags.count', '{{count}} terms', { count: primaryResults.length })}
              </p>
              {hideAdult && (
                <button
                  type="button"
                  onClick={() => patch({ adult: true })}
                  className="text-13 underline underline-offset-4"
                >
                  {t('tags.filter.includeAdult', 'Include 18+ terms')}
                </button>
              )}
              {filtered && (
                <button
                  type="button"
                  onClick={() => patch({ ...DEFAULT_TAGS_STATE, view: state.view })}
                  className="text-13 underline underline-offset-4"
                >
                  {t('tags.filter.reset', 'Reset filters')}
                </button>
              )}
            </div>

            <div className="mt-6">
              {primaryResults.length === 0 && state.view !== 'graph' ? (
                <div className="bg-muted rounded-container p-6">
                  <h2 className="text-title font-bold">
                    {t('tags.empty.title', 'No terms match.')}
                  </h2>
                  <p className="mt-2 text-13 text-muted-foreground">
                    {t('tags.empty.description', 'Try a broader letter, line, or search.')}
                  </p>
                </div>
              ) : (
                <TagResults
                  view={state.view}
                  tags={primaryResults.map((e) => e.tag)}
                  usageCounts={usageCounts}
                  lineFor={lineFor}
                  categoryLabelFor={categoryLabelFor}
                  aliasIds={aliasIds}
                  graphCategory={scope?.id ?? null}
                  graphCategories={graphCategories}
                />
              )}
            </div>

            {aliasResults.length > 0 && state.view !== 'graph' && (
              <section className="mt-12">
                <h2 className="font-display text-headline leading-tight">
                  {t('tags.alias.heading', 'Also found under other names')}
                </h2>
                <p className="mt-1 text-13 text-muted-foreground">
                  {t(
                    'tags.alias.description',
                    'These match a synonym or a close spelling rather than the term itself.',
                  )}
                </p>
                <div className="mt-4">
                  <TagResults
                    view={state.view}
                    tags={aliasResults.map((e) => e.tag)}
                    usageCounts={usageCounts}
                    lineFor={lineFor}
                    categoryLabelFor={categoryLabelFor}
                    aliasIds={aliasIds}
                  />
                </div>
              </section>
            )}

            {/* Only on the UNSCOPED, UNFILTERED index. `gated_tag_count()` is a
                whole-corpus number, so on a category stop or a search it would
                describe a set the reader is not looking at — and a confidently
                wrong count is worse than no notice. `hasActiveFilters`
                deliberately excludes `state.adult`, so "Include 18+ terms"
                keeps the notice and moves it from the safe-mode subset to the
                full count, which is the moment it becomes most informative. */}
            {!filtered && !scope && (
              <div className="mt-12">
                <GatedTagsNotice adultHidden={hideAdult} />
              </div>
            )}
          </div>
        </div>

        <TagsEndOfLine />
      </PageContainer>
    </>
  );
}
