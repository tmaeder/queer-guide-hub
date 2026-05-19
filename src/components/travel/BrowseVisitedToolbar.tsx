import { Eye, EyeOff, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { VisitedFilter } from './visitedFilter';

interface Props {
  value: VisitedFilter;
  onChange: (next: VisitedFilter) => void;
}

export function BrowseVisitedToolbar({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options: { key: VisitedFilter; icon: typeof Eye; label: string }[] = [
    { key: 'all', icon: Eye, label: t('travel.visited.all', 'Show all') },
    {
      key: 'only_visited',
      icon: CheckCheck,
      label: t('travel.visited.only', 'Only visited'),
    },
    {
      key: 'hide_visited',
      icon: EyeOff,
      label: t('travel.visited.hide', 'Hide visited'),
    },
  ];

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <span
        id="travel-visited-filter-label"
        className="text-xs text-muted-foreground"
      >
        {t('pages.travel.inspiration.visitedFilterLabel', 'Visited:')}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="travel-visited-filter-label"
        className="inline-flex items-center gap-1 border border-border bg-background p-1"
      >
        {options.map(({ key, icon: Icon, label }) => {
          const active = value === key;
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
