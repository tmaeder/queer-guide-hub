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
 *  header at the same `top-16` the editorial SectionNav uses, rather than the
 *  inline `top: 64` literal it carried, which could not track a header change. */
export function StickyLetterBar({ letter, onChange }: Props) {
  const entries: { value: string | null; label: string }[] = [
    { value: null, label: 'All' },
    ...LETTERS.map((l) => ({ value: l, label: l })),
    { value: '#', label: '#' },
  ];

  return (
    <nav
      aria-label="Jump to letter"
      className="sticky top-16 z-10 mb-4 overflow-x-auto border-b-[3px] border-foreground bg-background py-2"
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
                'inline-flex h-9 min-w-9 cursor-pointer items-center justify-center border-2 border-foreground px-2 text-13 transition-colors',
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
