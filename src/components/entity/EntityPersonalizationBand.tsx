import { useTranslation } from 'react-i18next';
import { Sparkles, MapPin, ShieldAlert } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useNearestSavedVenueKm } from '@/hooks/useNearestSavedVenue';
import { matchInterests, readInterests, humanizeInterest } from '@/lib/interestMatch';
import { hasCriminalizationFlag } from '@/lib/lgbtLegality';
import type { EntityPersonalization } from '@/components/entity/entityDescriptor';

/**
 * Signed-in "smart layer" under the hero. Surfaces why this entity fits the
 * user (matched interests), how close it is to their saved places, and an
 * identity-aware safety note in high-risk countries. Monochrome only; renders
 * nothing when there's nothing personal to say. Anonymous users get a single
 * muted sign-in nudge.
 */
export function EntityPersonalizationBand({
  inputs,
  className,
}: {
  inputs: EntityPersonalization;
  className?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const nearestKm = useNearestSavedVenueKm(inputs.entityId, inputs.lat, inputs.lng);

  const interests = readInterests((profile as { interests?: unknown } | null)?.interests);
  const matched = user ? matchInterests(inputs.tags, interests) : [];
  const criminalizing = hasCriminalizationFlag(inputs.criminalization);

  if (!user) {
    if (inputs.tags.length === 0) return null;
    return (
      <div className={className}>
        <p className="text-13 text-muted-foreground">
          {t('pages.entityDetail.signInForPicks', 'Sign in for picks tailored to you.')}{' '}
          <LocalizedLink to="/auth" className="underline">
            {t('common.signIn', 'Sign in')}
          </LocalizedLink>
        </p>
      </div>
    );
  }

  const distanceLabel =
    nearestKm != null
      ? nearestKm < 1
        ? t('pages.entityDetail.nearSavedClose', 'Less than 1 km from your saved places')
        : t('pages.entityDetail.nearSaved', '≈ {{km}} km from your saved places', {
            km: Math.round(nearestKm),
          })
      : null;

  const hasContent = matched.length > 0 || Boolean(distanceLabel) || criminalizing;
  if (!hasContent) return null;

  return (
    <div className={`rounded-container border border-border p-4 ${className ?? ''}`}>
      <Eyebrow as="div" className="mb-2 flex items-center gap-1.5">
        <Sparkles size={13} aria-hidden="true" />
        {t('pages.entityDetail.forYou', 'For you')}
      </Eyebrow>
      <div className="flex flex-col gap-2">
        {matched.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {matched.map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-badge">
                {t('pages.entityDetail.matchesInterest', 'Matches your interest in {{tag}}', {
                  tag: humanizeInterest(tag),
                })}
              </Badge>
            ))}
          </div>
        )}
        {distanceLabel && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin size={14} aria-hidden="true" />
            {distanceLabel}
          </p>
        )}
        {criminalizing && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldAlert size={14} aria-hidden="true" />
            {t(
              'pages.entityDetail.privateSafety',
              'Heightened legal risk here — anything you save stays private to you.',
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export default EntityPersonalizationBand;
