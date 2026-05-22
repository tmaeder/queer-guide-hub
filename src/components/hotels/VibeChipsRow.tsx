import { HOTEL_VIBES } from './hotelVibes';
import { useHotelVibeCounts } from '@/hooks/useHotelVibeCounts';

interface VibeChipsRowProps {
  active: string | null;
  onChange: (slug: string | null) => void;
}

export function VibeChipsRow({ active, onChange }: VibeChipsRowProps) {
  const { data: counts } = useHotelVibeCounts();
  // Hide chips that would dead-end. If counts haven't loaded yet, show all so
  // the row doesn't flicker; the worst case is a single empty-result click.
  const visibleVibes = counts
    ? HOTEL_VIBES.filter((v) => (counts[v.slug] ?? 0) > 0 || v.slug === active)
    : HOTEL_VIBES;

  if (visibleVibes.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scroll-smooth">
      {visibleVibes.map((v) => {
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
