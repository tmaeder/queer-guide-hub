import { memo } from 'react';
import {
  EditorialGuideCard,
  type EditorialGuideSummary,
} from '@/components/editorial/EditorialGuideCard';
import type { RecommendedEventGuide } from '@/hooks/useRecommendedEventGuides';

interface EventGuideCardProps {
  guide: RecommendedEventGuide;
  size?: 'default' | 'hero';
  priority?: boolean;
}

/**
 * Event-flavoured adapter over the shared EditorialGuideCard.
 * Maps event fields (event_type) → the editorial summary shape and pins
 * the URL prefix to /events/guides.
 */
export const EventGuideCard = memo(function EventGuideCard({
  guide,
  size,
  priority,
}: EventGuideCardProps) {
  const summary: EditorialGuideSummary = {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    dek: guide.dek,
    hero_image_path: guide.hero_image_path,
    category_label: guide.event_type,
    reading_time_min: guide.reading_time_min,
    pick_count: guide.pick_count,
    boost_reason: guide.boost_reason,
  };
  return (
    <EditorialGuideCard
      guide={summary}
      basePath="/events/guides"
      size={size}
      priority={priority}
    />
  );
});
