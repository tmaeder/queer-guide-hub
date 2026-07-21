import type { EntityMeta } from '@/components/entity/entityDescriptor';
import { milestoneYear } from '@/lib/milestoneDate';
import type { Milestone } from '@/types/milestone';

/** ISO-8601 reduced-precision date for JSON-LD ("1969" is valid year precision). */
function isoForPrecision(date: string, precision: Milestone['date_precision']): string {
  if (precision === 'year') return date.slice(0, 4);
  if (precision === 'month') return date.slice(0, 7);
  return date;
}

export function buildMilestoneMeta(milestone: Milestone): EntityMeta {
  const year = milestoneYear(milestone.date);
  const description =
    milestone.description?.slice(0, 200) ?? `${milestone.title} (${year}) — queer history on Queer Guide.`;
  return {
    title: `${milestone.title} (${year}) — Queer History | Queer Guide`,
    description,
    canonicalPath: `/history/${milestone.slug}`,
    ogImage: milestone.image_url ?? undefined,
    noIndex: !milestone.seo_indexable,
    jsonLd: {
      '@context': 'https://schema.org',
      // Historical happening — Event is semantically honest; Google's Event rich
      // results target future ticketed events and simply won't trigger (fine).
      '@type': 'Event',
      name: milestone.title,
      startDate: isoForPrecision(milestone.date, milestone.date_precision),
      ...(milestone.date_end
        ? { endDate: isoForPrecision(milestone.date_end, milestone.date_end_precision ?? milestone.date_precision) }
        : {}),
      ...(milestone.description ? { description: milestone.description } : {}),
      ...(milestone.country || milestone.country_name
        ? {
            location: {
              '@type': 'Place',
              name:
                milestone.location ??
                milestone.city?.name ??
                milestone.city_name ??
                milestone.country?.name ??
                milestone.country_name,
              address: {
                '@type': 'PostalAddress',
                ...(milestone.country?.code ? { addressCountry: milestone.country.code } : {}),
                ...(milestone.city?.name ?? milestone.city_name
                  ? { addressLocality: milestone.city?.name ?? milestone.city_name }
                  : {}),
              },
            },
          }
        : {}),
      ...(milestone.sources.some((s) => s.url)
        ? { sameAs: milestone.sources.map((s) => s.url).filter(Boolean) }
        : {}),
    },
  };
}
