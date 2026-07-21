import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMilestone } from '@/hooks/useMilestones';
import { buildMilestoneMeta } from '@/pages/MilestoneDetail.meta';
import {
  MilestoneHero,
  MilestoneLinkedEntities,
  MilestoneRelated,
  MilestoneSidebar,
  MilestoneSources,
  MilestoneStory,
  MilestoneTags,
} from '@/pages/MilestoneDetail.parts';
import type { EntityDescriptor, EntityDescriptorResult } from '@/components/entity/entityDescriptor';

/** Milestone adapter → normalised `EntityDescriptor` (text-first single scroll). */
export function useMilestoneDescriptor(slug: string | undefined): EntityDescriptorResult {
  const { t } = useTranslation();
  const { data: milestone, isLoading, error, refetch } = useMilestone(slug);

  const descriptor: EntityDescriptor | null = useMemo(() => {
    if (!milestone) return null;
    const links = milestone.links ?? [];
    return {
      source: 'milestone',
      id: milestone.id,
      slug: milestone.slug,
      title: milestone.title,
      hero: <MilestoneHero milestone={milestone} />,
      sections: [
        { id: 'story', when: Boolean(milestone.description), render: () => <MilestoneStory milestone={milestone} /> },
        { id: 'linked', when: links.length > 0, render: () => <MilestoneLinkedEntities links={links} /> },
        { id: 'sources', when: milestone.sources.length > 0, render: () => <MilestoneSources milestone={milestone} /> },
        { id: 'related', when: Boolean(milestone.country_id), render: () => <MilestoneRelated milestone={milestone} /> },
        { id: 'tags', when: milestone.tags.length > 0, render: () => <MilestoneTags milestone={milestone} /> },
      ],
      sidebar: <MilestoneSidebar milestone={milestone} />,
      // The shell's SimilarItems rail is venue/org-typed; milestone "related"
      // lives in its own same-country section instead.
      related: null,
      mobileBar: null,
      overlays: null,
      breadcrumbs: [
        { label: t('nav.home', 'Home'), href: '/' },
        { label: t('milestones.breadcrumb', 'History'), href: '/history' },
        { label: milestone.title },
      ],
      meta: buildMilestoneMeta(milestone),
      personalization: null,
      trackView: { type: 'milestone', slug: milestone.slug, title: milestone.title },
    };
  }, [milestone, t]);

  return {
    descriptor,
    isLoading,
    error: error instanceof Error ? error : null,
    notFound: !isLoading && !milestone,
    refetch,
  };
}
