import { useTranslation } from 'react-i18next';
import { STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';

const LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
];

interface Props {
  letter: string | null;
  onChange: (letter: string | null) => void;
  /** Letters that have entries. Others render dimmed and disabled. */
  available?: ReadonlySet<string>;
}

/** The line's index — every station by first letter. Sticks under the site
 *  header via the shared `STICKY_UNDER_HEADER` offset the editorial SectionNav
 *  also uses, rather than an inline `top: 64` literal that could not track a
 *  header change — the header is 60px on mobile and 64px only from `md`. */
export function StickyLetterBar({ letter, onChange, available }: Props) {
  const { t } = useTranslation();
  const entries: { value: string | null; label: string }[] = [
    { value: null, label: t('pages.personalities.ui.all', 'All') },
    ...LETTERS.map((l) => ({ value: l, label: l })),
    { value: '#', label: '#' },
  ];

  return (
    <nav
      aria-label={t('letterFilter.title', 'Jump to letter')}
      className={cn(
        'sticky z-10 mb-6 overflow-x-auto rounded-container bg-card/90 p-1.5 shadow-soft backdrop-blur-md scrollbar-thin',
        STICKY_UNDER_HEADER,
      )}
    >
      <div className="flex w-max items-center gap-0.5">
        {entries.map(({ value, label }) => {
          const active = (value ?? null) === (letter ?? null);
          const empty = !!value && !!available && !available.has(value) && !active;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(value)}
              disabled={empty}
              aria-pressed={active}
              aria-label={
                value
                  ? t('letterFilter.byLetter', {
                      defaultValue: 'Filter by {{letter}}',
                      letter: label,
                    })
                  : t('letterFilter.all', 'Show all letters')
              }
              className={cn(
                'inline-flex h-9 min-h-11 min-w-10 cursor-pointer items-center justify-center rounded-element px-2 text-13 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                active
                  ? 'bg-foreground font-bold text-background'
                  : 'bg-transparent font-bold text-foreground hover:bg-muted',
                empty && 'cursor-default font-normal text-muted-foreground/40 hover:bg-transparent',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
