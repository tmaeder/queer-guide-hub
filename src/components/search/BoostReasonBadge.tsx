import { useTranslation } from 'react-i18next';
import { Sparkles, MapPin, Heart, Tag, Star } from 'lucide-react';
import type { SearchResult } from '@/hooks/useSearch';

const ICONS: Record<NonNullable<SearchResult['_boostReason']>, typeof Sparkles> = {
  interest: Heart,
  recent_tag: Tag,
  home_city: MapPin,
  recent_city: MapPin,
  featured: Star,
};

interface BoostReasonBadgeProps {
  reason: SearchResult['_boostReason'];
}

/**
 * Subtle "why this ranked higher" indicator under a result. Renders nothing
 * if the worker didn't flag the hit. Monochrome + small to avoid taking over
 * the card.
 */
export function BoostReasonBadge({ reason }: BoostReasonBadgeProps) {
  const { t } = useTranslation();
  if (!reason) return null;
  const Icon = ICONS[reason];
  const label = t(`search.boost.${reason}`, reason);
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 4,
        fontSize: '0.7rem',
        color: 'hsl(var(--muted-foreground))',
        marginTop: 4,
      }}
      title={label}
    >
      <Icon style={{ width: 11, height: 11 }} />
      <span>{label}</span>
    </span>
  );
}
