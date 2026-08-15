import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import type { TFunction } from 'i18next';
import type { CityRelation } from './types';

export interface CityActionsProps {
  city: CityRelation;
  refetchCity: () => void;
  t: TFunction;
}

/**
 * The masthead action row. This file used to export `CityHero`, a 58vh
 * full-bleed photograph with the city name lying on a scrim over it.
 *
 * It is gone for three measured reasons, not for fashion:
 *   - `editorial_hook`, the one line of voice under the title, is populated on
 *     3.5% of the 3,070 live cities — so 96.5% of heroes had a headline and
 *     nothing else.
 *   - ~6% have no usable photograph at all and rendered a generated texture as
 *     the largest element on the page.
 *   - Text over photography is the site's only over-image contrast exception,
 *     and the subway singles are typographic: `/tags`, `/marketplace`,
 *     `/trips` and both 404 surfaces all lead with Anton on paper.
 *
 * The photograph is not deleted — it moves into the body as `GeoPhotoInset`,
 * a bordered module that carries a caption and cannot swallow the title.
 */
export function CityActions({ city, refetchCity, t }: CityActionsProps) {
  const OUTLINE =
    'inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background';
  return (
    <>
      {city.official_website && (
        <a
          href={city.official_website}
          target="_blank"
          rel="noopener noreferrer"
          className={OUTLINE}
        >
          {t('cities.detail.officialWebsite', 'Official website')}
        </a>
      )}
      <EntitySocialLinks links={city.social_links} size="sm" />
      <ReportButton contentType="cities" contentId={city.id} contentName={city.name} />
      <AdminEditButton
        contentType="cities"
        contentId={city.id}
        contentName={city.name}
        currentData={city as Record<string, unknown>}
        onSaved={() => refetchCity()}
      />
    </>
  );
}
