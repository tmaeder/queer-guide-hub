import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accessibility } from 'lucide-react';
import { useAmenityVocabulary } from '@/hooks/useAmenityVocabulary';
import { amenityIcon } from '@/lib/amenityIcons';

function humanize(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  amenities?: string[] | null;
  accessibility?: string[] | null;
  accessibilityNotes?: string | null;
}

/**
 * Renders a venue/hotel's amenities (with real per-amenity icons + i18n labels)
 * and accessibility features in their OWN prominent block — accessibility is
 * first-class for safety-first queer travel, not mixed into the amenity grid.
 */
export function AmenityDisplay({ amenities, accessibility, accessibilityNotes }: Props) {
  const { t } = useTranslation();
  const { vocab } = useAmenityVocabulary();

  const amenityList = (amenities ?? []).filter(Boolean);
  const accessList = (accessibility ?? []).filter(Boolean);
  if (!amenityList.length && !accessList.length && !accessibilityNotes) return null;

  const label = (slug: string) => {
    const term = vocab?.get(slug);
    return t(`amenities.${slug}`, term?.name ?? humanize(slug));
  };
  const Row = ({ slug }: { slug: string }) => {
    const Icon = amenityIcon(vocab?.get(slug)?.icon_name);
    return (
      <div className="flex items-center gap-2 p-2">
        <Icon size={16} className="flex-shrink-0 text-muted-foreground" />
        <span className="text-sm">{label(slug)}</span>
      </div>
    );
  };

  return (
    <>
      {amenityList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.venueDetail.amenities', 'Amenities')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {amenityList.map((slug) => <Row key={slug} slug={slug} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {(accessList.length > 0 || accessibilityNotes) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Accessibility size={18} />
              {t('pages.venueDetail.accessibility', 'Accessibility')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {accessList.length > 0 && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {accessList.map((slug) => <Row key={slug} slug={slug} />)}
              </div>
            )}
            {accessibilityNotes && <p className="text-sm text-muted-foreground">{accessibilityNotes}</p>}
          </CardContent>
        </Card>
      )}
    </>
  );
}
