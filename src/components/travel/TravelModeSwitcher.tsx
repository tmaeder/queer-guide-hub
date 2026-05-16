import { Compass, Map } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type TravelMode = 'browse' | 'plan';

interface Props {
  current: TravelMode;
  onChange: (mode: TravelMode) => void;
  className?: string;
}

export function TravelModeSwitcher({ current, onChange, className }: Props) {
  const { t } = useTranslation();
  const modes: { key: TravelMode; icon: typeof Compass; label: string }[] = [
    { key: 'browse', icon: Compass, label: t('travel.mode.browse', 'Browse') },
    { key: 'plan', icon: Map, label: t('travel.mode.plan', 'Plan') },
  ];
  return (
    <div
      role="tablist"
      aria-label={t('travel.mode.label', 'Travel mode')}
      className={cn(
        'inline-flex items-center gap-1 border border-border bg-background p-1',
        className,
      )}
    >
      {modes.map(({ key, icon: Icon, label }) => {
        const active = current === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
