import type { ComponentType } from 'react';
import { Award, Building2, Globe, Luggage, Map, Plane, Rainbow } from '@/components/icons';
import type { Badge } from './deriveBadges';

type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;

const BADGE_ICONS: Record<string, IconType> = {
  'first-trip': Luggage,
  'ten-cities': Building2,
  'pride-veteran': Rainbow,
  'continental-traveler': Plane,
  'village-explorer': Map,
  globetrotter: Globe,
};

export function BadgeRow({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="footprint-badges">
      {badges.map((b) => {
        const Icon = BADGE_ICONS[b.id] ?? Award;
        return (
          <li
            key={b.id}
            className="inline-flex items-center gap-2 rounded-badge bg-muted py-1 pl-1 pr-4 text-15 font-bold"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
            >
              <Icon size={16} aria-hidden="true" />
            </span>
            {b.label}
          </li>
        );
      })}
    </ul>
  );
}
