import { useTranslation } from 'react-i18next';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { SingleSection } from '@/components/transit/SinglePage';
import { useMilestonesForEntity } from '@/hooks/useMilestones';

/**
 * Editorial cross-link section on entity detail pages (personality first;
 * events/news/organizations reuse it as-is): milestones this entity is linked
 * to via milestone_links. Compact vertical list — milestones are text, not
 * portraits. Renders nothing when there are no rows.
 */
export function MilestonesForEntity({
  entityType,
  entityId,
  heading,
}: {
  entityType: 'personality' | 'event' | 'venue' | 'news' | 'organization';
  entityId: string | undefined;
  heading?: string;
}) {
  const { t } = useTranslation();
  const { data } = useMilestonesForEntity(entityType, entityId);
  if (!data?.length) return null;

  // SingleSection rather than a hand-rolled h2: at `font-display text-title`
  // this heading sat one rank BELOW its siblings on organization detail
  // (OrgAbout / OrgSocial are text-headline), so the milestones block read as a
  // subordinate card instead of a peer section.
  return (
    <SingleSection title={heading ?? t('milestones.forEntity.heading', 'Milestones')}>
      <div className="space-y-4">
        {data.map((m) => (
          <MilestoneRow key={m.id} milestone={m} density="row" />
        ))}
      </div>
    </SingleSection>
  );
}
