import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { GuideCard } from '@/components/guides/GuideCard';
import { useGuides, type GuidesFilter } from '@/hooks/useGuides';

/**
 * Generic embedded guides rail — replaces VenueGuidesStream, EventGuidesStream
 * and the marketplace GuidesStream. Renders nothing when no published guide
 * matches the filter.
 *
 * `alwaysRender` opts OUT of that self-hiding, and exists for exactly one
 * situation: when this rail is the only path from desktop chrome into the
 * guides family. The subway rebrand turned the header into the Intent Router —
 * six intents, no destination links, no dropdowns — so /guides left the header
 * by design and is reachable only through its cluster hub. #2723 fixed a
 * nightly that had been failing for days because nothing linked it at all;
 * gating that single path on a query which can legitimately return nothing
 * would re-orphan the family the moment the result went thin. When set, the
 * heading and the "All guides" action render unconditionally and only the card
 * grid reacts to the query.
 */
export function GuidesRail({
  title,
  filters = {},
  alwaysRender = false,
}: {
  title?: string;
  filters?: GuidesFilter;
  alwaysRender?: boolean;
}) {
  const { t } = useTranslation();
  const { data: guides = [] } = useGuides({ limit: 6, ...filters });
  if (guides.length === 0 && !alwaysRender) return null;

  const params = new URLSearchParams();
  if (filters.format) params.set('format', filters.format);
  if (filters.entityType) params.set('entity', filters.entityType);
  if (filters.category) params.set('category', filters.category);
  const seeAll = params.size > 0 ? `/guides?${params.toString()}` : '/guides';

  return (
    <section className="my-12" aria-labelledby="guides-rail-heading">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h2 id="guides-rail-heading" className="text-headline">
          {title ?? t('guides.rail.title', 'Guides')}
        </h2>
        <LocalizedLink
          to={seeAll}
          className="text-13 text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          {t('guides.rail.seeAll', 'All guides')}
        </LocalizedLink>
      </header>
      {guides.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {guides.map((g) => (
            <GuideCard key={g.id} guide={g} />
          ))}
        </div>
      ) : (
        <p className="text-13 text-muted-foreground">
          {t('guides.rail.empty', 'Editorial lists and buying guides, written by the community.')}
        </p>
      )}
    </section>
  );
}
