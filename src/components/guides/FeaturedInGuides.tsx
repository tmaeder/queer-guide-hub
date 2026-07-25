import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useGuideAppearances } from '@/hooks/useGuides';
import type { GuideEntityType } from '@/lib/guidePickAdapters';

/**
 * Reverse lookup block on entity detail pages: published guides in which
 * this entity appears as a pick. Replaces VenueFeaturedInGuides and the
 * marketplace FeaturedInGuides. Renders nothing when the entity is in no
 * published guide.
 */
export function FeaturedInGuides({
  entityType,
  entityId,
}: {
  entityType: GuideEntityType;
  entityId: string | undefined;
}) {
  const { t } = useTranslation();
  const { data: guides = [] } = useGuideAppearances(entityType, entityId);
  if (guides.length === 0) return null;

  return (
    <section className="my-8" aria-labelledby="featured-in-guides-heading">
      <h2
        id="featured-in-guides-heading"
        className="mb-4 text-13 uppercase tracking-[0.15em] text-muted-foreground"
      >
        {t('guides.featuredIn.title', 'Featured in guides')}
      </h2>
      <ul className="space-y-2">
        {guides.map((g) => (
          <li key={g.id}>
            <LocalizedLink
              to={`/guides/${g.slug}`}
              className="group flex items-baseline justify-between gap-4 rounded-element border border-border px-4 py-2 no-underline hover:bg-muted/40"
            >
              <span className="text-15 font-medium group-hover:underline underline-offset-4">
                {g.title}
              </span>
              <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                {t('guides.card.picks', '{{count}} picks').replace(
                  '{{count}}',
                  String(g.pick_count),
                )}
              </span>
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
