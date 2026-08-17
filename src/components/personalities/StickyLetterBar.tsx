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
}

/** The line's index — every station by first letter. Sticks under the site
 *  header via the shared `STICKY_UNDER_HEADER` offset the editorial SectionNav
 *  also uses, rather than an inline `top: 64` literal that could not track a
 *  header change — the header is 60px on mobile and 64px only from `md`. */
export function StickyLetterBar({ letter, onChange }: Props) {
  const entries: { value: string | null; label: string }[] = [
    { value: null, label: 'All' },
    ...LETTERS.map((l) => ({ value: l, label: l })),
    { value: '#', label: '#' },
  ];

  return (
    <nav
      aria-label="Jump to letter"
      className={cn(
        'sticky z-10 mb-4 overflow-x-auto border-b border-border-hairline bg-background py-2',
        STICKY_UNDER_HEADER,
      )}
    >
      <div className="flex w-max items-center gap-1">
        {entries.map(({ value, label }) => {
          const active = (value ?? null) === (letter ?? null);
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(value)}
              aria-pressed={active}
              aria-label={value ? `Filter by ${label}` : 'Show all letters'}
              className={cn(
                'inline-flex h-9 min-w-9 cursor-pointer items-center justify-center bg-muted rounded-element px-2 text-13 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                active
                  ? 'bg-foreground font-bold text-background'
                  : 'bg-background font-medium text-foreground hover:bg-surface-container',
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
