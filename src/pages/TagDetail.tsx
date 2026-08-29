/**
 * /tags/:tagName — a glossary entry.
 *
 * Lifted out of the index page, which is the single biggest change here. Before
 * this, `/tags/bear-bar` mounted the whole index: it paged ~3,700
 * `unified_tags` rows plus ~5,000 category assignments plus the category tree,
 * blocked on `if (loading)`, then found the tag by a linear scan of that
 * corpus — with `fetchTagWithCategories` (two small queries, all the data
 * needed) as the *fallback* path. The whole-corpus load was a prerequisite for
 * rendering one term, and the correct fetch was the fallback.
 *
 * The shell is `SinglePage`, because src/config/singleModules.ts already
 * declares this type: `tag: { required: [1, 12, 7], … }`. The page used to
 * assemble its own layout, which is exactly what that spec exists to prevent.
 *
 * Notable absences, all deliberate:
 *
 * - **No image hero.** A 16:9 plate with a `linear-gradient(rgba(…))` scrim and
 *   white text was the most off-system element on the page; the title now sits
 *   in the masthead where Anton runs at 52/76px, and the image is an
 *   ink-framed figure with its attribution INSIDE the frame.
 * - **No relationship graph.** It rendered the whole *category's* graph, not
 *   this tag's neighbourhood, so the interchange band says the same thing more
 *   truthfully in 0 KB. The graph lives on /tags?view=graph.
 * - **No `quality_score`.** An internal editorial metric; printed next to a
 *   concept it reads as a judgement of the concept.
 * - **Module 12 (version history) is not here yet.** The content model marks it
 *   required, but `tag_change_log` is admin/moderator-only with no anon grant,
 *   so it cannot ship publicly without a redacted SECURITY DEFINER RPC.
 *   `ProvenanceLine` (spine S6) carries what is knowable today.
 */

import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { fetchTagWithCategories, type TagLegalSourceRow } from '@/hooks/usePageFetchers';
import { TagLegalSource } from '@/components/tags/TagLegalSource';
import { TagClinicalSource } from '@/components/tags/TagClinicalSource';
import { buildTagJsonLd } from '@/lib/tags/tagJsonLd';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';
import { useTagUsageBreakdown, totalUses } from '@/hooks/useTagUsageBreakdown';
import { useTagReferenceLinks, useSubstanceInteractions } from '@/hooks/useTagRelationships';
import { useActiveStation } from '@/hooks/useActiveStation';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { extractSections } from '@/lib/htmlSections';
import { getCategoryShortName } from '@/components/resources/categoryMeta';
import { PageContainer } from '@/components/layout/PageContainer';
import { SinglePage, SingleSection } from '@/components/transit/SinglePage';
import { RouteStrip, type RouteStation } from '@/components/transit/RouteStrip';
import { FactGrid, type Fact } from '@/components/transit/FactGrid';
import { StatLine } from '@/components/transit/StatLine';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { SidebarCard, SidebarRow } from '@/components/transit/SidebarCard';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TagDetailWithGate } from '@/components/age-gate/TagDetailWithGate';
import { FollowTagButton } from '@/components/tags/FollowTagButton';
import { TagAliasesDisplay } from '@/components/tags/TagAliasesDisplay';
import { TagSafetyCallout } from '@/components/tags/TagSafetyCallout';
import { TagWikiContent } from '@/components/tags/TagWikiContent';
import { TagInterchange } from '@/components/tags/TagInterchange';
import { SubstanceInteractions } from '@/components/tags/SubstanceInteractions';
import { TagDiagnosticCodes } from '@/components/tags/TagDiagnosticCodes';
import { TagFlagBand } from '@/components/tags/TagFlagBand';
import { TagFlagRailCard } from '@/components/tags/TagFlagRailCard';
import { TagHankyCodeBand } from '@/components/tags/TagHankyCodeBand';
import { flagByTagSlug, HANKY_CODE_TAG_SLUG } from '@/lib/flags';
import { TagLinkedContent } from '@/components/tags/TagLinkedContent';
import { StiProfile } from '@/components/tags/StiProfile';
import { TagMythFacts } from '@/components/tags/TagMythFacts';
import { TAG_DIAGRAMS } from '@/components/tags/tagDiagrams';
import { useTagMedicalCodes, countMedicalCodes } from '@/hooks/useTagMedicalCodes';
import { useStiProfile, useTagMythFacts } from '@/hooks/useStiProfile';

/** `entity_kind` is a classification, not a state — which is exactly what
 *  DetailMasthead's bordered ink status chip is for. */
const ENTITY_KIND_LABELS: Record<string, string> = {
  concept: 'Concept',
  venue_feature: 'Venue feature',
  practice: 'Practice',
  aesthetic: 'Aesthetic',
  // Kind axis of the 2026-08-29 recategorization program (20261006090000)
  descriptor: 'Descriptor',
  place: 'Place',
  attribute: 'Attribute',
  audience: 'Audience',
  person: 'Person',
};

/**
 * Label a citation by its host. `URL` throws on a malformed string and these
 * rows are operator-entered, so fall back to the raw value rather than letting
 * one bad row blank the whole rail.
 */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const EMPTY_DIAGRAMS: (typeof TAG_DIAGRAMS)[string] = [];

function isHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function extractFacts(data: Record<string, unknown> | null | undefined): Fact[] {
  if (!data || typeof data !== 'object') return [];
  const out: Fact[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value == null || typeof value === 'object') continue;
    out.push({
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: String(value),
    });
    if (out.length >= 4) break;
  }
  return out;
}

export default function TagDetail() {
  const { t } = useTranslation();
  const { tagName } = useParams<{ tagName: string }>();
  const navigate = useLocalizedNavigate();
  const safeMode = useSafeMode();
  const ageAffirmation = useAgeAffirmation();

  const decoded = tagName ? decodeURIComponent(tagName) : '';
  const slug = decoded.toLowerCase();

  // Canonicalize slug case. The SPA equivalent of a 301: replace the URL so
  // back/forward and copy-paste land on the canonical form. Crawlers that do
  // not execute JS won't see a 301 status — accepted SPA trade-off.
  useEffect(() => {
    if (decoded && decoded !== slug) {
      navigate(`/tags/${encodeURIComponent(slug)}`, { replace: true });
    }
  }, [decoded, slug, navigate]);

  const {
    data: tag,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tag-detail', slug],
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => ((await fetchTagWithCategories(slug)) as CentralizedTag | null) ?? null,
  });

  // Same SPA-301 as the case fix above, for the case where the row we got back
  // is filed under a DIFFERENT slug than the URL asked for. Two ways that
  // happens: `fetchTagWithCategories` followed a merge redirect (/tags/rack →
  // risk-aware-consensual-kink), or it fell back to matching on display name.
  //
  // This only fires on a client-side navigation. A hard load of a merged slug
  // never reaches React — functions/_middleware.ts answers it with a real 301,
  // which is the version crawlers and link equity actually need. The two paths
  // have to agree, and the shared resolver they agree through is
  // resolve_tag_slug(): the SPA calls the RPC, the edge reads the same
  // tag_slug_redirects rows with the same status='active' constraint on the
  // target. Change one and you must change the other.
  useEffect(() => {
    if (tag?.slug && tag.slug !== slug) {
      navigate(`/tags/${encodeURIComponent(tag.slug)}`, { replace: true });
    }
  }, [tag?.slug, slug, navigate]);

  // Curated legal citations, for law tags only. `fetchTagWithCategories` attaches
  // them; the `CentralizedTag` cast above does not know about them, hence the
  // local widening — same shape as the `human_reviewed` read further down.
  // One fetch, two cards. `fetchTagWithCategories` returns every published row for
  // the tag; splitting here rather than issuing a second query keeps the page at
  // one round trip. The split is by source_type because "Source of law" and
  // "Clinical guidance" are different claims about different kinds of authority —
  // a clinical citation rendered under a legal heading misleads about both.
  const publishedSources = useMemo(
    () => (tag as { legal_sources?: TagLegalSourceRow[] } | null)?.legal_sources ?? [],
    [tag],
  );
  const legalSources = useMemo(
    () => publishedSources.filter((s) => s.source_type !== 'clinical_guideline'),
    [publishedSources],
  );
  const clinicalSources = useMemo(
    () => publishedSources.filter((s) => s.source_type === 'clinical_guideline'),
    [publishedSources],
  );

  const primary = tag?.categories?.find((c) => c.is_primary) ?? tag?.categories?.[0];
  const parentName = primary?.parent_name ?? undefined;
  const parentSlug = (primary as { parent_slug?: string | null } | undefined)?.parent_slug;
  const childName = primary?.level === 1 ? primary.name : undefined;

  const { data: usage } = useTagUsageBreakdown(tag?.id);
  // Fetched here as well as inside the band so the route strip and the rail can
  // both react to whether this term is coded at all. React Query dedupes the
  // request; the band owns the rendering.
  const { data: medicalCodes } = useTagMedicalCodes(tag?.id ?? null);
  const medicalCodeCount = countMedicalCodes(medicalCodes);
  // Same reason as the codes above: the strip needs the count, the band owns
  // the rendering, and React Query dedupes the two calls.
  const { data: interactions } = useSubstanceInteractions(tag?.id ?? null);
  const interactionCount = interactions?.length ?? 0;
  // Same count-fetch shape again: the page needs to know whether the STI and
  // myth/fact bands will render so their stations appear; the bands own the
  // rendering and React Query dedupes the duplicate requests.
  const { data: stiProfile } = useStiProfile(tag?.id ?? null);
  const hasStiProfile = !!stiProfile;
  const { data: mythFacts } = useTagMythFacts(tag?.id ?? null);
  const mythFactCount = mythFacts?.length ?? 0;
  const diagrams = useMemo(
    () => (tag ? (TAG_DIAGRAMS[tag.slug] ?? EMPTY_DIAGRAMS) : EMPTY_DIAGRAMS),
    [tag],
  );
  // Plain reference links (saferparty.ch on the substance terms, and anything
  // else editorial). Distinct from `legalSources` above, which is a legal
  // INSTRUMENT — official title, jurisdiction, adopted year — and earns its own
  // band. A reference is just a link, so it belongs in the Elsewhere rail next
  // to Wikipedia.
  const { data: referenceLinks } = useTagReferenceLinks(tag?.id ?? null);
  const references = referenceLinks ?? [];

  // Parses the document with the DOM, so it must not run in the render body.
  const wiki = useMemo(() => {
    const body = tag?.long_description?.trim();
    if (!body || !isHtml(body)) return null;
    return extractSections(body);
  }, [tag?.long_description]);

  /** The stations are the page's BANDS, with the wiki's own `<h2>`s as
   *  sub-stations under "About". A prose-only table of contents renders nothing
   *  on most terms — only a minority carry a `long_description` with headings —
   *  which is why the component this replaces bailed out below three headings
   *  and showed an empty sidebar the rest of the time. */
  const stations = useMemo<RouteStation[]>(() => {
    if (!tag) return [];
    const s: RouteStation[] = [];
    if (tag.description || tag.long_description) {
      s.push({ id: 'about', title: t('tags.detail.about', 'About') });
      s.push(...(wiki?.sections ?? []).map((x) => ({ ...x, depth: 2 as const })));
    }
    // Both flag presence and the hanky slug are synchronous TS data, so unlike
    // the async counts below they need no extra memo deps beyond `tag`.
    if (flagByTagSlug.has(tag.slug)) {
      s.push({ id: 'flag', title: t('tags.detail.flag.title', 'The flag') });
    }
    if (tag.slug === HANKY_CODE_TAG_SLUG) {
      s.push({ id: 'hanky-code', title: t('tags.detail.hanky.title', 'The code') });
    }
    if (medicalCodeCount > 0) {
      s.push({ id: 'codes', title: t('tags.detail.codes.title', 'Diagnostic codes') });
    }
    if (hasStiProfile) {
      s.push({ id: 'sexual-health', title: t('tags.sti.eyebrow', 'Sexual health') });
    }
    // Above the taxonomy on purpose. Someone on /tags/ghb who is about to
    // combine something needs this before they need the ontology.
    if (interactionCount > 0) {
      s.push({ id: 'combinations', title: t('tags.interactions.eyebrow', 'Combinations') });
    }
    for (const d of diagrams) {
      s.push({ id: d.id, title: t(`tags.diagrams.${d.id}`, d.title) });
    }
    if (mythFactCount > 0) {
      s.push({ id: 'myths', title: t('tags.myths.eyebrow', 'Check the facts') });
    }
    s.push({ id: 'taxonomy', title: t('tags.detail.inTaxonomy', 'In the taxonomy') });
    if (usage?.venue_count) s.push({ id: 'venues', title: t('tags.detail.venues', 'Venues') });
    if (usage?.event_count) s.push({ id: 'events', title: t('tags.detail.events', 'Events') });
    if (usage?.news_count) s.push({ id: 'news', title: t('tags.detail.news', 'News') });
    if (usage?.marketplace_count) s.push({ id: 'shop', title: t('tags.detail.shop', 'Shop') });
    if (usage?.group_count) {
      s.push({ id: 'communities', title: t('tags.detail.communities', 'Communities') });
    }
    return s;
    // medicalCodeCount belongs here: the codes RPC resolves AFTER the first
    // render, so omitting it would pin the strip to the pre-fetch value of 0
    // and the stop would never appear. interactionCount, hasStiProfile and
    // mythFactCount are the same shape.
  }, [
    tag,
    wiki,
    usage,
    medicalCodeCount,
    interactionCount,
    hasStiProfile,
    mythFactCount,
    diagrams,
    t,
  ]);

  const { activeId, goToStation } = useActiveStation(stations);

  // ── Breadcrumbs ─────────────────────────────────────────────────────────
  // Published to the global bar rather than hand-rolled. The page used to
  // render its own <button> trail that called back into the index page's view
  // state, which is why the component took three `onSet*` props.
  const breadcrumbs = useMemo(() => {
    if (!tag) return null;
    return [
      { label: t('tags.hero.eyebrow', 'Glossary'), href: '/tags' },
      ...(parentName && parentSlug
        ? [{ label: getCategoryShortName(parentName), href: `/tags/c/${parentSlug}` }]
        : []),
      ...(childName ? [{ label: getCategoryShortName(childName) }] : []),
      { label: tag.name },
    ];
  }, [tag, parentName, parentSlug, childName, t]);
  useBreadcrumbs(breadcrumbs);

  // ── Meta ────────────────────────────────────────────────────────────────
  const isAdult = useMemo(() => {
    const names = [
      ...(tag?.categories?.map((c) => c.name) ?? []),
      ...(tag?.categories?.map((c) => c.parent_name ?? null) ?? []),
    ];
    return names.some((n) => safeMode.isAdultCategory(n));
  }, [tag, safeMode]);

  const meta = useMemo(() => {
    // Mirror the render's three branches below. A single `!tag` test conflated
    // "still loading" with "no such tag", so a dead glossary URL published
    // `<title>Loading</title>` — and, worse, inherited NO `noIndex`, which only
    // existed on the resolved-tag branch. `useMeta` always emits a canonical
    // (falling back to `pathname`), so an unknown slug advertised itself as its
    // own canonical with no robots tag: an indexable soft 404, the same failure
    // that got merged slugs indexed before they were 301'd. `noIndex` is the
    // lever that shuts that off — the canonical cannot be suppressed here.
    if (isLoading) return { title: t('tags.detail.loading', 'Loading') };
    if (isError || !tag) {
      return { title: t('tags.detail.notFound.title', 'No such term'), noIndex: true };
    }
    const longFirst = tag.long_description
      ?.trim()
      .split(/\n{2,}/)[0]
      ?.trim();
    const description =
      tag.description?.trim() ||
      tag.short_description?.trim() ||
      (longFirst ? longFirst.slice(0, 200) : '') ||
      `${tag.name} — Queer Guide glossary entry.`;
    // The live route is /tags/<slug>. This used to emit /resources/<slug>,
    // which public/_redirects 301s away — so every glossary page declared a
    // canonical pointing at a redirect and cancelled its own indexing. No
    // name-derived fallback: `unified_tags.slug` is NOT NULL, and a value with
    // spaces in it hard-404s at the Cloudflare edge.
    const jsonLd = buildTagJsonLd(
      {
        name: tag.name,
        slug: tag.slug,
        description,
        wikipedia_url: tag.wikipedia_url,
      },
      // All published rows, not just the legal half — buildTagJsonLd picks the
      // node type per row, and passing only `legalSources` would drop the citation
      // from every health tag.
      publishedSources,
    );
    return {
      title: tag.name,
      description,
      ogType: 'article' as const,
      canonicalPath: `/tags/${tag.slug}`,
      jsonLd,
      // One useMeta owns robots for this page. The age gate used to call its
      // own, and two of them racing on effect order is why the old page carried
      // a five-line comment about re-asserting noIndex from the parent.
      noIndex: tag.seo_indexable === false || isAdult,
    };
    // `publishedSources` MUST stay in this list. It arrives with the same fetch as
    // `tag`, but omitting it is the useMeta-freezing bug: the memo would keep the
    // first-computed jsonLd and publish a DefinedTerm with no `citation`.
    // `isLoading`/`isError` are load-bearing for the same reason: they gate the
    // two branches above, so leaving them out would pin the title to "Loading"
    // for the whole visit — exactly the bug this replaced.
  }, [tag, publishedSources, isAdult, isLoading, isError, t]);
  useMeta(meta);

  if (isLoading) {
    return (
      <PageContainer>
        <TrackLoader label={t('tags.detail.loading', 'Loading')} />
      </PageContainer>
    );
  }

  if (isError || !tag) {
    return (
      <PageContainer data-testid="tag-not-found" className="text-center">
        <h1 className="font-display text-display">
          {t('tags.detail.notFound.title', 'No such term')}
        </h1>
        <p className="mt-2 text-13 text-muted-foreground">
          {t('tags.detail.notFound.body', 'Nothing in the glossary is filed under')}{' '}
          <code className="bg-muted rounded-element px-1">/{decoded}</code>
        </p>
        <LocalizedLink
          to="/tags"
          className="mt-6 inline-block px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('tags.detail.notFound.browse', 'Browse the glossary')}
        </LocalizedLink>
      </PageContainer>
    );
  }

  const taxonomyPath = [parentName, childName]
    .filter(Boolean)
    .map((n) => getCategoryShortName(n as string))
    .join(' › ');

  const facts: Fact[] = [
    ...(taxonomyPath
      ? [
          {
            label: t('tags.detail.factLine', 'Line'),
            value: parentSlug ? (
              <LocalizedLink to={`/tags/c/${parentSlug}`}>{taxonomyPath}</LocalizedLink>
            ) : (
              taxonomyPath
            ),
          },
        ]
      : []),
    { label: t('tags.detail.factTagged', 'Tagged on'), value: totalUses(usage) || 0 },
    ...extractFacts(tag.scientific_data),
  ];

  const stats = [
    { key: 'venues', label: t('tags.detail.venues', 'Venues'), value: usage?.venue_count ?? 0 },
    { key: 'events', label: t('tags.detail.events', 'Events'), value: usage?.event_count ?? 0 },
    { key: 'news', label: t('tags.detail.news', 'News'), value: usage?.news_count ?? 0 },
    { key: 'shop', label: t('tags.detail.shop', 'Shop'), value: usage?.marketplace_count ?? 0 },
    {
      key: 'communities',
      label: t('tags.detail.communities', 'Communities'),
      value: usage?.group_count ?? 0,
    },
  ].filter((s) => s.value > 0);

  const body = (
    <>
      {stations.length > 1 && (
        <RouteStrip
          stations={stations}
          activeId={activeId}
          onNavigate={goToStation}
          orientation="horizontal"
          label={t('tags.detail.sections', 'Sections')}
        />
      )}

      {facts.length > 0 && <FactGrid facts={facts} />}

      {(tag.description || tag.long_description) && (
        <section id="about">
          {tag.description && (
            <p className="max-w-reading text-body-lg leading-relaxed">{tag.description}</p>
          )}
          {wiki ? (
            <div className="mt-6">
              <TagWikiContent html={wiki.htmlWithIds} />
            </div>
          ) : tag.long_description ? (
            <div className="qg-cms-body mt-6">
              {tag.long_description
                .split(/\n{2,}/)
                .map((para, i) => para.trim() && <p key={i}>{para.trim()}</p>)}
            </div>
          ) : null}
        </section>
      )}

      <TagFlagBand tagSlug={tag.slug} />

      <TagHankyCodeBand tagSlug={tag.slug} />

      <TagDiagnosticCodes tagId={tag.id} />

      {hasStiProfile && (
        <div id="sexual-health" className="scroll-mt-24">
          <StiProfile tagId={tag.id} tagName={tag.name} />
        </div>
      )}

      {interactionCount > 0 && (
        <div id="combinations" className="scroll-mt-24">
          <SubstanceInteractions tagId={tag.id} tagName={tag.name} />
        </div>
      )}

      {diagrams.map((d) => (
        <div key={d.id} id={d.id} className="scroll-mt-24">
          <d.Component />
        </div>
      ))}

      {mythFactCount > 0 && (
        <div id="myths" className="scroll-mt-24">
          <TagMythFacts tagId={tag.id} tagName={tag.name} />
        </div>
      )}

      <TagInterchange tagId={tag.id} tagName={tag.name} />

      <TagLinkedContent tagId={tag.id} tagName={tag.name} tagSlug={tag.slug} />

      {!tag.description && !tag.long_description && (
        <SingleSection title={t('tags.detail.about', 'About')}>
          <p className="text-13 italic text-muted-foreground">
            {t('tags.detail.noDefinition', 'No definition has been written for this term yet.')}
          </p>
        </SingleSection>
      )}
    </>
  );

  const rail = (
    <>
      {/* Rendered synchronously, outside every loading branch: a failed
          ontology or linked-content fetch must not be able to blank a content
          note. */}
      <TagSafetyCallout
        isSensitive={tag.is_sensitive}
        topics={(tag as { sensitive_topics?: string[] | null }).sensitive_topics}
      />

      {stats.length > 0 && (
        <SidebarCard eyebrow={t('tags.detail.whereItAppears', 'Where it appears')}>
          {/* Plain labels: StatLine keys its rows by `label`, so it takes a
              string. The RouteStrip above the body is the page's navigation —
              duplicating it as anchors here would give the reader two
              competing ways to reach the same band. */}
          <StatLine stats={stats.map((s) => ({ label: s.label, value: s.value }))} />
        </SidebarCard>
      )}

      {/* Above "Elsewhere" on purpose: the law a term comes from outranks
          "you can also read about this on Wikipedia". Sits alongside the
          diagnostic-codes pointer below — a term is either clinical or legal,
          so in practice only one of the two ever renders. */}
      <TagLegalSource sources={legalSources} tagSlug={tag.slug} />
      <TagClinicalSource sources={clinicalSources} />

      {/* The flag an identity HAS (lesbian → lesbian flag). The tag that IS a
          flag gets the full band in the body instead — never both. */}
      <TagFlagRailCard tagSlug={tag.slug} />

      {(tag.wikipedia_url || tag.wikidata_id || medicalCodeCount > 0 || references.length > 0) && (
        <SidebarCard eyebrow={t('tags.detail.elsewhere', 'Elsewhere')}>
          {/* An in-page anchor rather than the codes themselves: the rail is
              240px and the band has four groups. This row is a pointer, not a
              second copy. */}
          {medicalCodeCount > 0 && (
            <SidebarRow
              label={t('tags.detail.codes.title', 'Diagnostic codes')}
              value={<a href="#codes">{medicalCodeCount}</a>}
            />
          )}
          {tag.wikipedia_url && (
            <SidebarRow
              label="Wikipedia"
              value={
                <a href={tag.wikipedia_url} target="_blank" rel="noopener noreferrer">
                  {t('tags.detail.readThere', 'Read')}
                </a>
              }
            />
          )}
          {tag.wikidata_id && (
            <SidebarRow
              label="Wikidata"
              value={
                <a
                  href={`https://www.wikidata.org/wiki/${tag.wikidata_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tag.wikidata_id}
                </a>
              }
            />
          )}
          {/* Reference links with no dedicated column — saferparty.ch on the
              substance terms. The label is the URL's host rather than
              `claim_summary`, so nothing the RPC did not vet gets printed. */}
          {references.map((s) => (
            <SidebarRow
              key={s.source_url}
              label={sourceHost(s.source_url)}
              value={
                <a href={s.source_url} target="_blank" rel="noopener noreferrer">
                  {t('tags.detail.readThere', 'Read')}
                </a>
              }
            />
          ))}
        </SidebarCard>
      )}

      <ProvenanceLine
        addedBy={
          (tag as { human_reviewed?: boolean | null }).human_reviewed
            ? t('tags.detail.editors', 'Queer Guide editors')
            : undefined
        }
        addedAt={tag.created_at}
        // Passing null when the term is unverified is the point: the component
        // then prints "Not independently checked yet", which is the honest
        // rendering and needs no extra prop.
        checkedAt={
          (tag as { verification_status?: string | null }).verification_status === 'verified'
            ? ((tag as { last_verified_at?: string | null }).last_verified_at ?? null)
            : null
        }
        correctHref="/contact"
      />
    </>
  );

  const footer = (
    <section aria-labelledby="tag-end-of-line" className="bg-foreground p-6 text-background md:p-8">
      <p className="text-2xs font-bold uppercase tracking-label text-background/70">
        {t('tags.endOfLine.eyebrow', 'End of line')}
      </p>
      <h2 id="tag-end-of-line" className="mt-1 font-display text-headline leading-tight">
        {t('tags.detail.everythingTagged', 'Everything tagged {{name}}', { name: tag.name })}
      </h2>
      <p className="mt-2 max-w-reading text-13 leading-relaxed text-background/80">
        {t('tags.detail.everythingTaggedBody', '{{count}} items across the guide carry this tag.', {
          count: totalUses(usage),
        })}
      </p>
      <LocalizedLink
        to={`/search?tags=${encodeURIComponent(tag.slug)}`}
        className="border mt-4 inline-flex items-center gap-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
      >
        <TransitIcon name="search" size={18} />
        {t('tags.detail.searchTagged', 'Search everything tagged {{name}}', { name: tag.name })}
      </LocalizedLink>

      {/* The embedding-similarity pool ("More on this line") is gone from this
          page: at its 0.70 floor it published pairs like Tickler↔God as if
          they were related terms. Related terms are the curated, typed
          `tag_relations` rendered by TagInterchange; the pool stays as an
          internal candidate signal for that ontology, never a display. */}
    </section>
  );

  return (
    <TagDetailWithGate
      isAdult={isAdult}
      affirmed={ageAffirmation.affirmed}
      onDecline={() => navigate('/tags')}
    >
      <SinglePage
        type="tag"
        eyebrow={taxonomyPath || t('tags.hero.eyebrow', 'Glossary')}
        title={tag.name}
        status={
          ENTITY_KIND_LABELS[(tag as { entity_kind?: string }).entity_kind ?? ''] ?? undefined
        }
        lead={tag.description}
        tags={<TagAliasesDisplay tagId={tag.id} />}
        action={<FollowTagButton tagId={tag.id} tagName={tag.name} tagSlug={tag.slug} />}
        body={body}
        rail={rail}
        footer={footer}
      />
    </TagDetailWithGate>
  );
}
