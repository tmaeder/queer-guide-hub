import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * In-page search affordance. The homepage has no search field of its own — the
 * single search lives in the top bar. This cue *looks* like a search field but
 * is a button that opens that one search via the `qg:open-search` event
 * (UniversalSearchBar listens). Keeps one search, surfaced where it's needed.
 */
export function HomeSearchCue({ className }: { className?: string }) {
  const { t } = useTranslation();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('qg:open-search'))}
      aria-label={t('home.searchCue.aria', 'Search venues, events, people')}
      className={cn(
        'group flex h-14 w-full items-center gap-2.5 rounded-container border border-border bg-background/95 px-4 text-left backdrop-blur transition-colors hover:bg-accent',
        className,
      )}
    >
      <Search size={20} aria-hidden className="shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-body-lg text-muted-foreground">
        {t('home.searchCue.placeholder', 'Search venues, events, people…')}
      </span>
      <kbd
        aria-hidden
        className="hidden shrink-0 border border-border px-1.5 py-0.5 text-xs2 leading-none text-muted-foreground sm:inline-block"
      >
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
