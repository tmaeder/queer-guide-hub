/**
 * ContentEntityTabs — List / Quality / Duplicates tab strip for entity admin
 * pages. The *-quality pages no longer sit in the sidebar (IA consolidation);
 * this strip is how they're reached from the entity, and how the quality page
 * links back. Pass the entity's route `type` segment (e.g. "venues").
 */

import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { getContentType } from '@/config/contentTypeRegistry';

interface EntityTab {
  label: string;
  route: string;
}

/** Returns the tab set for a type, or null when it has no companion pages.
 * Companion routes come from the type's registry `admin` block. */
function entityTabsFor(type: string | undefined): EntityTab[] | null {
  if (!type) return null;
  const companion = getContentType(type)?.admin;
  if (!companion?.qualityRoute && !companion?.duplicatesRoute && !companion?.requestsRoute) {
    return null;
  }
  const tabs: EntityTab[] = [{ label: 'List', route: `/admin/content/${type}` }];
  if (companion.qualityRoute) tabs.push({ label: 'Quality', route: companion.qualityRoute });
  if (companion.duplicatesRoute)
    tabs.push({ label: 'Duplicates', route: companion.duplicatesRoute });
  if (companion.requestsRoute) tabs.push({ label: 'Requests', route: companion.requestsRoute });
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
              '-mb-px border-b-2 px-2 py-1.5 text-sm font-medium no-underline transition-colors',
              active
                ? 'border-foreground text-foreground'
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
