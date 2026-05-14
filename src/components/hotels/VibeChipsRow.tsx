import { HOTEL_VIBES } from './hotelVibes';

interface VibeChipsRowProps {
  active: string | null;
  onChange: (slug: string | null) => void;
}

export function VibeChipsRow({ active, onChange }: VibeChipsRowProps) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scroll-smooth">
      {HOTEL_VIBES.map((v) => {
        const isActive = v.slug === active;
        return (
          <button
            key={v.slug}
            type="button"
            onClick={() => onChange(isActive ? null : v.slug)}
            aria-pressed={isActive}
            className={
              'flex-none whitespace-nowrap px-4 py-2 text-sm border transition-colors ' +
              (isActive
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-foreground/20 hover:bg-muted')
            }
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
