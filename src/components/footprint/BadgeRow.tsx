import type { Badge } from './deriveBadges';

export function BadgeRow({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="footprint-badges">
      {badges.map((b) => (
        <span
          key={b.id}
          className="border border-foreground/20 bg-foreground/5 text-foreground text-xs px-2.5 py-1"
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
