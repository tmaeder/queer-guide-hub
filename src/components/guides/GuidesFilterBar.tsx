import { useTranslation } from 'react-i18next';
import type { GuideFormat } from '@/hooks/useGuides';
import type { GuideEntityType } from '@/lib/guidePickAdapters';

/**
 * Filter chips for the /guides hub. State lives in URL search params
 * (owned by the page) so legacy-route redirects can deep-link filters.
 */

export interface GuidesHubFilters {
  format: GuideFormat | null;
  entity: GuideEntityType | null;
}

const ENTITY_FILTERS: GuideEntityType[] = ['venue', 'event', 'marketplace'];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-badge border border-foreground bg-foreground px-4 py-1.5 text-13 text-background'
          : 'rounded-badge border border-border px-4 py-1.5 text-13 text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
  );
}

export function GuidesFilterBar({
  filters,
  onChange,
}: {
  filters: GuidesHubFilters;
  onChange: (next: GuidesHubFilters) => void;
}) {
  const { t } = useTranslation();

  const entityLabel: Record<GuideEntityType, string> = {
    venue: t('guides.filters.entity.venue', 'Places'),
    event: t('guides.filters.entity.event', 'Events'),
    marketplace: t('guides.filters.entity.marketplace', 'Shopping'),
    city: t('guides.filters.entity.city', 'Cities'),
    country: t('guides.filters.entity.country', 'Countries'),
    queer_village: t('guides.filters.entity.queerVillage', 'Villages'),
    personality: t('guides.filters.entity.personality', 'People'),
    news: t('guides.filters.entity.news', 'News'),
    milestone: t('guides.filters.entity.milestone', 'History'),
    group: t('guides.filters.entity.group', 'Groups'),
    organization: t('guides.filters.entity.organization', 'Organizations'),
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('guides.filters.label', 'Filter guides')}>
      <Chip
        active={filters.format === null && filters.entity === null}
        onClick={() => onChange({ format: null, entity: null })}
      >
        {t('guides.filters.all', 'All')}
      </Chip>
      <Chip
        active={filters.format === 'quest'}
        onClick={() =>
          onChange({ format: filters.format === 'quest' ? null : 'quest', entity: null })
        }
      >
        {t('guides.filters.quests', 'Quests')}
      </Chip>
      <span aria-hidden className="mx-2 h-4 w-px bg-border" />
      {ENTITY_FILTERS.map((e) => (
        <Chip
          key={e}
          active={filters.entity === e}
          onClick={() =>
            onChange({ format: null, entity: filters.entity === e ? null : e })
          }
        >
          {entityLabel[e]}
        </Chip>
      ))}
    </div>
  );
}
