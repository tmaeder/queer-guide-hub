import { useTranslation } from 'react-i18next';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
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

  return (
    <section>
      <h2 className="mb-4 font-display text-title font-semibold">
        {heading ?? t('milestones.forEntity.heading', 'Milestones')}
      </h2>
      <div className="space-y-4">
        {data.map((m) => (
          <MilestoneRow key={m.id} milestone={m} density="row" />
        ))}
      </div>
    </section>
  );
}
