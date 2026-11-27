import { useTranslation } from 'react-i18next';
import type { FestivalTypeKey } from '@/lib/festivals';

/** Reader-facing names for the festival type filters, shared by hub and brand page. */
export function useFestivalTypeLabels(): (key: FestivalTypeKey | 'all') => string {
  const { t } = useTranslation();
  return (key) =>
    ({
      all: t('festivals.type.all', 'All'),
      pride: t('festivals.type.pride', 'Pride'),
      festival: t('festivals.type.festival', 'Festival'),
      fetish: t('festivals.type.fetish', 'Leather & fetish'),
      film: t('festivals.type.film', 'Film'),
      other: t('festivals.type.other', 'Other'),
    })[key];
}

export function useFestivalTypeLabel(key: FestivalTypeKey): string {
  return useFestivalTypeLabels()(key);
}
