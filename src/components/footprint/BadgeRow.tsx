import type { Badge } from './deriveBadges';

export function BadgeRow({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="footprint-badges">
      {badges.map((b) => (
        <span
          key={b.id}
          className="rounded-badge bg-foreground/5 px-2.5 py-1 text-xs text-foreground"
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
