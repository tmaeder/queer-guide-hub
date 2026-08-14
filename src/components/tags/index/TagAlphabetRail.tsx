/**
 * TagAlphabetRail — jump to a letter of the glossary.
 *
 * A filter, not a scroll-spy: with ~3,700 terms, scrolling to a letter is worse
 * than showing only that letter. Counts come free from the index pass the page
 * already does.
 *
 * Empty letters render disabled rather than hidden. A rail whose width changes
 * as the reader types is a moving target — Q and X are empty under most
 * category filters, and dropping them would reflow the whole row.
 *
 * NOT sticky. The filter spine is the page's only sticky element; two stacked
 * sticky bars eat a third of a phone screen.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ALPHABET } from '@/lib/tags/tagsIndexState';

interface TagAlphabetRailProps {
  letter: string | null;
  counts: Record<string, number>;
  onChange: (letter: string | null) => void;
  className?: string;
}

export function TagAlphabetRail({ letter, counts, onChange, className }: TagAlphabetRailProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('tags.letters.label', 'Jump to a letter')}
      className={cn('overflow-x-auto border-b-[3px] border-foreground py-2', className)}
    >
      <div className="flex w-max items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={letter === null}
          className={cn(
            'inline-flex h-9 items-center justify-center border-2 border-foreground px-4 text-13 transition-colors',
            letter === null
              ? 'bg-foreground font-bold text-background'
              : 'bg-background font-medium hover:bg-surface-container',
          )}
        >
          {t('tags.letters.all', 'All')}
        </button>
        {ALPHABET.map((l) => {
          const count = counts[l] ?? 0;
          const active = letter === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => onChange(active ? null : l)}
              aria-pressed={active}
              disabled={count === 0}
              aria-label={
                l === '#'
                  ? t('tags.letters.other', 'Numbers and other scripts')
                  : t('tags.letters.jump', 'Terms starting with {{letter}}', { letter: l })
              }
              className={cn(
                'inline-flex h-9 min-w-9 items-center justify-center border-2 border-foreground px-2 text-13 transition-colors',
                active
                  ? 'bg-foreground font-bold text-background'
                  : 'bg-background font-medium hover:bg-surface-container',
                count === 0 && 'cursor-not-allowed opacity-40 hover:bg-background',
              )}
            >
              {l}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
