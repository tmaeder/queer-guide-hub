import { MapPin } from 'lucide-react';

/**
 * Ambient location hint — subtle inline chip (was a global toast). Bottom-left,
 * clear of the bottom-right results pill + top-right nav.
 */
export function LocationHint({ hint }: { hint: string | null }) {
  if (!hint) return null;
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-4 py-1.5 pointer-events-none animate-fade-in">
      <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}
