import { useTranslation } from 'react-i18next';
import { useUserMode } from '@/hooks/useUserMode';
import { USER_MODES } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * Prominent discovery-mode control at the top of the search hub. Six modes;
 * the active mode biases trending tiles and scope ordering. Built as a
 * monochrome segmented radiogroup (no new dependency).
 */
export function ModeSwitcher() {
  const { t } = useTranslation();
  const { mode, setMode } = useUserMode();
  const activeLabel = USER_MODES.find((m) => m.value === mode)?.labelKey;

  return (
    <div className="px-4">
      <div className="mb-2 text-13 font-semibold uppercase tracking-wider text-muted-foreground">
        {t('header.modeLabel', 'Mode')}
      </div>
      <div
        role="radiogroup"
        aria-label={t('header.modeLabel', 'Mode')}
        className="flex flex-wrap gap-2 pb-1"
      >
        {USER_MODES.map((m) => {
          const active = mode === m.value;
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.value)}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-element border px-3 py-2 text-xs transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">{t(m.labelKey)}</span>
            </button>
          );
        })}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {activeLabel ? t('header.modeActive', { mode: t(activeLabel) }) : ''}
      </span>
    </div>
  );
}
