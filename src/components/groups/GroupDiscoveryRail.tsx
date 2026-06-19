import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { GroupCard } from '@/components/groups/GroupCard';
import type { Group } from '@/hooks/useGroups';

interface GroupDiscoveryRailProps {
  title: string;
  icon: LucideIcon;
  groups: Group[];
  loading?: boolean;
  isAuthenticated?: boolean;
  onJoin?: (groupId: string) => void;
  onRequestJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  isJoining?: boolean;
  isRequesting?: boolean;
  isLeaving?: boolean;
  /** Rendered in place of the rail when not loading and there are no groups. */
  emptyState?: ReactNode;
}

/**
 * Horizontal browsing rail of GroupCards (For You / Featured / Trending).
 * Decoupled from the search proxy — fed entirely via props.
 */
export function GroupDiscoveryRail({
  title,
  icon: Icon,
  groups,
  loading = false,
  isAuthenticated = true,
  onJoin,
  onRequestJoin,
  onLeave,
  isJoining,
  isRequesting,
  isLeaving,
  emptyState,
}: GroupDiscoveryRailProps) {
  if (!loading && groups.length === 0) {
    return emptyState ? (
      <section aria-label={title} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon className="h-5 w-5 text-foreground" />
          {title}
        </h2>
        {emptyState}
      </section>
    ) : null;
  }

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Icon className="h-5 w-5 text-foreground" />
        {title}
      </h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-6 pb-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[320px] whitespace-normal">
                  <GroupCard loading />
                </div>
              ))
            : groups.map((group) => (
                <div key={group.id} className="shrink-0 w-[320px] whitespace-normal">
                  <GroupCard
                    group={group}
                    isAuthenticated={isAuthenticated}
                    onJoin={onJoin}
                    onRequestJoin={onRequestJoin}
                    onLeave={onLeave}
                    isJoining={isJoining}
                    isRequesting={isRequesting}
                    isLeaving={isLeaving}
                  />
                </div>
              ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
