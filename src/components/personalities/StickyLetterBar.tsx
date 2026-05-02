const LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

interface Props {
  letter: string | null;
  onChange: (letter: string | null) => void;
  /** Top offset for sticky positioning, defaults to 64 (under main header) */
  stickyTop?: number;
}

export function StickyLetterBar({ letter, onChange, stickyTop = 64 }: Props) {
  const entries: { value: string | null; label: string }[] = [
    { value: null, label: 'All' },
    ...LETTERS.map((l) => ({ value: l, label: l })),
    { value: '#', label: '#' },
  ];

  return (
    <nav
      aria-label="Jump to letter"
      className="z-10 bg-background backdrop-blur-md px-2 py-2 mb-4 overflow-x-auto"
      style={{ position: 'sticky', top: stickyTop }}
    >
      <div className="flex gap-0.5 items-center" style={{ minWidth: 'max-content' }}>
        {entries.map(({ value, label }) => {
          const active = (value ?? null) === (letter ?? null);
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(value)}
              aria-pressed={active}
              aria-label={value ? `Filter by ${label}` : 'Show all letters'}
              className={`min-w-9 h-9 px-2 inline-flex items-center justify-center rounded-md border-none cursor-pointer text-sm transition-all ${
                active
                  ? 'bg-primary text-primary-foreground font-bold hover:bg-primary'
                  : 'bg-transparent text-foreground font-medium hover:bg-muted/40'
              } focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2`}
              style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
