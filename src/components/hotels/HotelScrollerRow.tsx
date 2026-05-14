import { HotelCard } from './HotelCard';
import type { Hotel } from '@/hooks/useHotels';

interface HotelScrollerRowProps {
  title: string;
  subtitle?: string;
  hotels: Hotel[];
}

export function HotelScrollerRow({ title, subtitle, hotels }: HotelScrollerRowProps) {
  if (!hotels.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div
        className="flex gap-4 overflow-x-auto -mx-4 px-4 pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {hotels.map((h) => (
          <div
            key={h.id}
            className="flex-none w-64 md:w-72"
            style={{ scrollSnapAlign: 'start' }}
          >
            <HotelCard hotel={h} />
          </div>
        ))}
      </div>
    </section>
  );
}
