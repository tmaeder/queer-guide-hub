import Box from '@mui/material/Box';

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
    <Box
      sx={{
        position: 'sticky',
        top: stickyTop,
        zIndex: 10,
        bgcolor: 'background.default',
        backdropFilter: 'blur(8px)',
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        px: 1,
        py: 0.75,
        mb: 2,
        overflowX: 'auto',
        '&::-webkit-scrollbar': { height: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 },
      }}
      role="navigation"
      aria-label="Jump to letter"
    >
      <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', minWidth: 'max-content' }}>
        {entries.map(({ value, label }) => {
          const active = (value ?? null) === (letter ?? null);
          return (
            <Box
              component="button"
              key={label}
              type="button"
              onClick={() => onChange(value)}
              aria-pressed={active}
              aria-label={value ? `Filter by ${label}` : 'Show all letters'}
              sx={{
                minWidth: 36,
                height: 36,
                px: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 1,
                border: 'none',
                cursor: 'pointer',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontWeight: active ? 700 : 500,
                fontSize: '0.875rem',
                color: active ? 'brand.contrastText' : 'text.primary',
                bgcolor: active ? 'brand.main' : 'transparent',
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: active ? 'brand.main' : 'action.hover',
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'brand.main',
                  outlineOffset: 2,
                },
              }}
            >
              {label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
