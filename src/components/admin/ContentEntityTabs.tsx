/**
 * ContentEntityTabs — List / Quality / Duplicates tab strip for entity admin
 * pages. The *-quality pages no longer sit in the sidebar (IA consolidation);
 * this strip is how they're reached from the entity, and how the quality page
 * links back. Pass the entity's route `type` segment (e.g. "venues").
 */

import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';

interface EntityTab {
  label: string;
  route: string;
}

/** type segment → its companion routes (besides the List page). */
const QUALITY_ROUTE: Record<string, { quality?: string; duplicates?: string }> = {
  venues: { quality: '/admin/content/venue-quality', duplicates: '/admin/duplicates' },
  events: { quality: '/admin/content/event-quality' },
  cities: { quality: '/admin/content/city-quality' },
  personalities: { quality: '/admin/content/personality-quality' },
  marketplace_listings: { quality: '/admin/content/marketplace-quality' },
  queer_villages: { quality: '/admin/content/village-quality' },
};

/** Returns the tab set for a type, or null when it has no companion pages. */
function entityTabsFor(type: string | undefined): EntityTab[] | null {
  if (!type) return null;
  const companion = QUALITY_ROUTE[type];
  if (!companion) return null;
  const tabs: EntityTab[] = [{ label: 'List', route: `/admin/content/${type}` }];
  if (companion.quality) tabs.push({ label: 'Quality', route: companion.quality });
  if (companion.duplicates) tabs.push({ label: 'Duplicates', route: companion.duplicates });
  return tabs;
}

export function ContentEntityTabs({ type }: { type: string | undefined }) {
  const location = useLocation();
  const tabs = entityTabsFor(type);
  if (!tabs) return null;

  return (
    <div className="mb-4 flex items-center gap-1 border-b border-border" role="tablist">
      {tabs.map((tab) => {
        const active = location.pathname === tab.route;
        return (
          <Link
            key={tab.route}
            to={tab.route}
            role="tab"
            aria-selected={active}
            className={cn(
              '-mb-px border-b-2 px-3 py-1.5 text-sm font-medium no-underline transition-colors',
              active
                ? 'border-accent-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
