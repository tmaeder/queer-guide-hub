import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { GuideCard } from '@/components/guides/GuideCard';
import { useGuides, type GuidesFilter } from '@/hooks/useGuides';

/**
 * Generic embedded guides rail — replaces VenueGuidesStream, EventGuidesStream
 * and the marketplace GuidesStream. Renders nothing when no published guide
 * matches the filter.
 */
export function GuidesRail({
  title,
  filters = {},
}: {
  title?: string;
  filters?: GuidesFilter;
}) {
  const { t } = useTranslation();
  const { data: guides = [] } = useGuides({ limit: 6, ...filters });
  if (guides.length === 0) return null;

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {guides.map((g) => (
          <GuideCard key={g.id} guide={g} />
        ))}
      </div>
    </section>
  );
}
