import { memo } from 'react';
import {
  EditorialGuideCard,
  type EditorialGuideSummary,
} from '@/components/editorial/EditorialGuideCard';
import type { RecommendedGuide } from '@/hooks/useRecommendedGuides';

interface GuideCardProps {
  guide: RecommendedGuide;
  size?: 'default' | 'hero';
  priority?: boolean;
}

/**
 * Marketplace-flavoured adapter over the shared EditorialGuideCard.
 * Maps marketplace fields → the editorial summary shape (category_slug
 * → category_label) and pins the URL prefix to /marketplace/guides.
 */
export const GuideCard = memo(function GuideCard({ guide, size, priority }: GuideCardProps) {
  const summary: EditorialGuideSummary = {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    dek: guide.dek,
    hero_image_path: guide.hero_image_path,
    category_label: guide.category_slug,
    reading_time_min: guide.reading_time_min,
    pick_count: guide.pick_count,
    boost_reason: guide.boost_reason,
  };
  return (
    <EditorialGuideCard
      guide={summary}
      basePath="/marketplace/guides"
      size={size}
      priority={priority}
    />
  );
});
