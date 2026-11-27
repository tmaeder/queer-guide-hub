/**
 * TagLinkedContent — everything in the guide that carries this tag.
 *
 * Rewritten onto the transit primitives. The data layer is unchanged
 * (`get_tag_linked_content` through `useTagContent`, plus the news relevance
 * ranking below); what went was ~350 lines of bespoke card markup carrying four
 * `rgba()` literals, two `linear-gradient()`s, a `backdropFilter`, twenty-odd
 * inline `style` objects and a `style={{ fill: 'hsl(var(--foreground))' }}`.
 *
 * Two behavioural improvements ride along:
 *
 * - **Rows are real links.** Every card was a `<div onClick={navigate}>`, so
 *   tag → venue could not be middle-clicked, opened in a new tab, or followed
 *   by a crawler. NestedEntityCard and DepartureRow both carry a real overlay
 *   anchor.
 * - **People render as a Roster, not a photo grid.** The content model marks
 *   module 07 required for this type and its own note says "this is not a photo
 *   grid" — so the images go, and with them the `useEntityImageAssets` fetch.
 *
 * Section ids match the RouteStrip stations TagDetail builds; the two must stay
 * in step or the rail links to nothing.
 */

import { useTranslation } from 'react-i18next';
import { useTagContent, type TagContentResult } from '@/hooks/useTagContent';
import { SingleSection } from '@/components/transit/SinglePage';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { TagShopRail } from '@/components/tags/TagShopRail';
import { DepartureRow } from '@/components/transit/DepartureRow';
import { Roster } from '@/components/transit/Roster';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { formatCount, previewCount } from '@/lib/previewCount';

/** Preview size per section; the full set is one search link away. */
const PREVIEW = 6;

/**
 * P2-8 — rank news by relevance to the tag. Articles whose title or excerpt
 * mention the tag name sort first; others are demoted. This is a lightweight
 * client-side heuristic until the ingestion pipeline gets a confidence score.
 */
function rankNewsByRelevance(
  articles: TagContentResult['news'],
  tagName: string,
): TagContentResult['news'] {
  if (articles.length === 0) return articles;
  const terms = tagName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return articles;

  return [...articles].sort((a, b) => {
    const textA = `${a.title ?? ''} ${a.excerpt ?? ''}`.toLowerCase();
    const textB = `${b.title ?? ''} ${b.excerpt ?? ''}`.toLowerCase();
    const scoreA = terms.filter((t) => textA.includes(t)).length;
    const scoreB = terms.filter((t) => textB.includes(t)).length;
    // Higher mention count first; preserve original order (by published_at)
    // within the same score.
    return scoreB - scoreA;
  });
}

function placeOf(a: { city?: string | null; country?: string | null }): string | null {
  return [a.city, a.country].filter(Boolean).join(', ') || null;
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// gap-4, not gap-3: the 8 pt grid admits only even steps (plus .5 for
// icon-level offsets), and `no-restricted-syntax` flags the odd ones.
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

/** Full-list exit for a capped section: tag-filtered, type-scoped search. */
function SectionSeeAll({ tagSlug, type }: { tagSlug: string; type: string }) {
  const { t } = useTranslation();
  return (
    <LocalizedLink
      to={`/search?tags=${encodeURIComponent(tagSlug)}&types=${type}`}
      className="mt-4 inline-block text-13 font-medium underline underline-offset-4"
    >
      {t('tags.detail.seeAllInSearch', 'See all in search')}
    </LocalizedLink>
  );
}

/** Assignment totals from `tag_usage_summary`, so a capped preview can say "of N". */
export interface TagLinkedTotals {
  venues?: number;
  events?: number;
  news?: number;
}

export function TagLinkedContent({
  tagId,
  tagName,
  tagSlug,
  totals,
}: {
  tagId: string;
  tagName: string;
  tagSlug?: string;
  totals?: TagLinkedTotals;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language;
  /**
   * "Showing 6 of 31,659" when the preview is capped and the total is known;
   * "Showing the first 6" when only the fetched page is known (the RPC itself
   * caps at 20, so its length is not a total); "3 items" when nothing is cut.
   */
  const note = (fetched: number, total?: number) => {
    const shown = Math.min(fetched, PREVIEW);
    if (total === undefined) {
      return fetched > shown
        ? t('tags.detail.showingFirst', 'Showing the first {{shown}}', { shown })
        : t('tags.detail.itemCount', '{{count}} items', { count: shown });
    }
    const c = previewCount(shown, total);
    return c.partial
      ? t('tags.detail.showingOf', 'Showing {{shown}} of {{total}}', {
          shown: formatCount(c.shown, lang),
          total: formatCount(c.total, lang),
        })
      : t('tags.detail.itemCount', '{{count}} items', { count: c.total });
  };
  const { data, isLoading } = useTagContent(tagId, tagName);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <div className={GRID}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { venues, events, personalities, groups } = data;
  const marketplace = data.marketplace ?? [];
  const villages = data.queer_villages ?? [];
  const news = rankNewsByRelevance(data.news, tagName);

  return (
    <>
      {venues.length > 0 && (
        <SingleSection
          id="venues"
          title={t('tags.detail.venues', 'Venues')}
          note={note(venues.length, totals?.venues)}
        >
          <div className={GRID}>
            {venues.slice(0, PREVIEW).map((v) => (
              <NestedEntityCard
                key={v.id}
                type="venue"
                eyebrow={placeOf(v)}
                name={v.name}
                description={v.category}
                href={v.slug ? `/venues/${v.slug}` : undefined}
              />
            ))}
          </div>
          {tagSlug && <SectionSeeAll tagSlug={tagSlug} type="venue" />}
        </SingleSection>
      )}

      {events.length > 0 && (
        <SingleSection
          id="events"
          title={t('tags.detail.events', 'Events')}
          note={note(events.length, totals?.events)}
        >
          <div className="flex flex-col gap-2">
            {events.slice(0, PREVIEW).map((e) => (
              <DepartureRow
                key={e.id}
                type="event"
                time={shortDate(e.start_date)}
                title={e.title}
                status={e.venue_name ?? placeOf(e) ?? undefined}
                href={e.slug ? `/events/${e.slug}` : undefined}
              />
            ))}
          </div>
          {tagSlug && <SectionSeeAll tagSlug={tagSlug} type="event" />}
        </SingleSection>
      )}

      {personalities.length > 0 && (
        <SingleSection
          id="people"
          title={t('tags.detail.people', 'People')}
          note={note(personalities.length)}
        >
          <Roster
            people={personalities.slice(0, PREVIEW).map((p) => ({
              id: p.id,
              name: p.name,
              role: p.profession,
              href: p.slug ? `/personalities/${p.slug}` : undefined,
            }))}
          />
          {tagSlug && personalities.length > PREVIEW && (
            <SectionSeeAll tagSlug={tagSlug} type="personality" />
          )}
        </SingleSection>
      )}

      {news.length > 0 && (
        <SingleSection
          id="news"
          title={t('tags.detail.news', 'News')}
          note={note(news.length, totals?.news)}
        >
          <div className={GRID}>
            {news.slice(0, PREVIEW).map((n) => (
              <NestedEntityCard
                key={n.id}
                type="news"
                eyebrow={n.news_sources?.name ?? null}
                name={n.title}
                description={n.excerpt}
                href={n.url ?? undefined}
              />
            ))}
          </div>
          {tagSlug && <SectionSeeAll tagSlug={tagSlug} type="news" />}
        </SingleSection>
      )}

      {villages.length > 0 && (
        <SingleSection id="villages" title={t('tags.detail.villages', 'Queer villages')}>
          <div className={GRID}>
            {villages.map((v) => (
              <NestedEntityCard
                key={v.id}
                type="queer_village"
                eyebrow={placeOf(v)}
                name={v.name}
                href={v.slug ? `/queer-villages/${v.slug}` : undefined}
              />
            ))}
          </div>
        </SingleSection>
      )}

      {marketplace.length > 0 && (
        <SingleSection id="shop" title={t('tags.detail.shop', 'Shop')}>
          {/* Real product cards (image, brand, price) + a department-aware
              "Shop all" into filtered /marketplace — replaces the generic
              NestedEntityCard grid and the /search see-all for this section
              only. Section id stays `shop` (RouteStrip invariant). */}
          {tagSlug ? (
            <TagShopRail items={marketplace} tagSlug={tagSlug} />
          ) : (
            <div className={GRID}>
              {marketplace.map((m) => (
                <NestedEntityCard
                  key={m.id}
                  type="marketplace"
                  eyebrow={m.brand ?? m.business_name ?? null}
                  name={m.title}
                  description={m.category}
                  href={m.slug ? `/marketplace/${m.slug}` : undefined}
                />
              ))}
            </div>
          )}
        </SingleSection>
      )}

      {groups.length > 0 && (
        <SingleSection id="communities" title={t('tags.detail.communities', 'Communities')}>
          <div className={GRID}>
            {groups.map((g) => (
              <NestedEntityCard
                key={g.id}
                type="group"
                name={g.name}
                description={g.description}
                href={`/meet/groups/${g.id}`}
              />
            ))}
          </div>
        </SingleSection>
      )}
    </>
  );
}
