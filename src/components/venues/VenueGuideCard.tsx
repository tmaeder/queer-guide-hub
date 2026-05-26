import { memo } from 'react';
import {
  EditorialGuideCard,
  type EditorialGuideSummary,
} from '@/components/editorial/EditorialGuideCard';
import type { RecommendedVenueGuide } from '@/hooks/useRecommendedVenueGuides';

interface VenueGuideCardProps {
  guide: RecommendedVenueGuide;
  size?: 'default' | 'hero';
  priority?: boolean;
}

/**
 * Venue-flavoured adapter over the shared EditorialGuideCard.
 * Maps venue fields (category) → the editorial summary shape and pins
 * the URL prefix to /venues/guides.
 */
export const VenueGuideCard = memo(function VenueGuideCard({
  guide,
  size,
  priority,
}: VenueGuideCardProps) {
  const summary: EditorialGuideSummary = {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    dek: guide.dek,
    hero_image_path: guide.hero_image_path,
    category_label: guide.category,
    reading_time_min: guide.reading_time_min,
    pick_count: guide.pick_count,
    boost_reason: guide.boost_reason,
  };
  return (
    <EditorialGuideCard
      guide={summary}
      basePath="/venues/guides"
      size={size}
      priority={priority}
    />
  );
});
