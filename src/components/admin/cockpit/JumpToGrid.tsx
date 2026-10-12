/**
 * JumpToGrid — shortcuts to the content areas, with row counts.
 *
 * This is the console's mobile navigation affordance: the sidebar is behind a
 * hamburger at <768px, so the landing page has to offer the destinations
 * directly. Destinations are DERIVED from adminNavSections (every item with a
 * `countTable`), the same lookup AdminSidebar and the command palette do — a
 * fourth hand-written destination list is exactly what would drift.
 *
 * `milestones` and `guides` declare a countTable the RPC does not emit. They
 * render an unavailable state; showing `0` for "we never asked" would be a lie.
 */

import { Link } from 'react-router';
import { adminNavSections, resolveItemMinRole } from '@/config/adminNavigation';
import { roleAtLeast, type EffectiveRole } from '@/config/adminRoles';
import type { AdminCounts } from '@/hooks/useAdminCounts';

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function JumpToGrid({
  counts,
  role,
  loading = false,
}: {
  counts: AdminCounts | undefined;
  role: EffectiveRole;
  loading?: boolean;
}) {
  const destinations = adminNavSections.flatMap((section) =>
    section.items
      .filter((item) => item.countTable && roleAtLeast(role, resolveItemMinRole(item, section)))
      .map((item) => ({
        id: item.id,
        label: item.label,
        route: item.route,
        icon: item.icon,
        count: counts?.[item.countTable as string],
      })),
  );

  if (destinations.length === 0) return null;

  return (
    // lg:grid-cols-2 is the one place the column count goes back DOWN: at lg the
    // grid moves into a 320px rail, where six columns would be 53px wide.
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-container bg-border sm:grid-cols-3 lg:grid-cols-2">
      {destinations.map((d) => {
        const Icon = d.icon;
        return (
          <Link
            key={d.id}
            to={d.route}
            className="flex min-h-20 min-w-0 flex-col justify-center gap-1 bg-card p-4 no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon size={14} className="shrink-0" aria-hidden />
              <span className="break-words">{d.label}</span>
            </span>
            {typeof d.count === 'number' ? (
              <span className="text-title font-semibold tabular-nums leading-none">
                {compact(d.count)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {loading ? 'Loading count…' : 'Count unavailable'}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
