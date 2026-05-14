/**
 * AdminSidebar -- Unified left navigation for the admin console.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ChevronDown, LogOut, Layers, Shield } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { adminNavSections } from '@/config/adminNavigation';
import type { AdminNavItem } from '@/config/adminNavigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

function IconBadge({ icon: Icon, size = 16 }: { icon: React.ComponentType<{ size?: number }>; size?: number }) {
  return (
    <div className="w-7 h-7 flex items-center justify-center text-muted-foreground">
      <Icon size={size} />
    </div>
  );
}

function CountBadge({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center justify-center rounded h-5 min-w-7 px-1.5 text-[0.65rem] font-semibold">
      {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
    </span>
  );
}

interface AdminSidebarProps {
  contentCounts?: Record<string, number>;
}

export function AdminSidebar({ contentCounts: externalCounts }: AdminSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of adminNavSections) {
      initial[section.id] = section.defaultExpanded ?? true;
    }
    return initial;
  });

  const [loadedCounts, setLoadedCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_counts');
      if (!error && data) {
        const raw = data as Record<string, number>;
        const counts: Record<string, number> = {};
        for (const section of adminNavSections) {
          for (const item of section.items) {
            if (item.countTable && raw[item.countTable] !== undefined) {
              counts[item.id] = raw[item.countTable];
            }
            if (item.reviewCountKey && raw[item.reviewCountKey] !== undefined) {
              counts[item.id] = raw[item.reviewCountKey];
            }
          }
        }
        setLoadedCounts(counts);
      }
    } catch {
      // ignore
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const mergedCounts = useMemo(() => {
    if (externalCounts) {
      return { ...loadedCounts, ...externalCounts };
    }
    return loadedCounts;
  }, [externalCounts, loadedCounts]);

  const isItemActive = useCallback(
    (item: AdminNavItem): boolean => {
      const pathname = location.pathname;
      if (item.route === '/admin') {
        return pathname === '/admin';
      }
      return pathname.startsWith(item.route);
    },
    [location.pathname],
  );

  const filterItems = useCallback(
    (items: AdminNavItem[]): AdminNavItem[] => {
      if (isAdmin) return items;
      return items.filter((item) => !item.adminOnly);
    },
    [isAdmin],
  );

  const toggleSection = (sectionId: string) => {
    setSectionOpen((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const userEmail = user?.email ?? '';
  const userDisplayName =
    (user?.user_metadata?.display_name as string) ||
    (user?.user_metadata?.first_name as string) ||
    userEmail.split('@')[0] ||
    'User';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
    <TooltipProvider>
    <div className="w-[260px] min-h-full border-r border-border bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 bg-foreground text-background">
            <Layers size={16} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight leading-tight">Admin Console</p>
            <p className="text-[0.7rem] text-muted-foreground/70">Manage everything</p>
          </div>
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="ml-auto flex items-center text-foreground">
                  <Shield size={14} />
                </div>
              </TooltipTrigger>
              <TooltipContent>Admin role</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-auto py-1">
        {adminNavSections.map((section, sectionIdx) => {
          const filteredItems = filterItems(section.items);
          if (filteredItems.length === 0) return null;
          const isOpen = sectionOpen[section.id] ?? section.defaultExpanded ?? true;

          return (
            <div key={section.id}>
              {sectionIdx > 0 && <div className="my-1.5 mx-3 border-t border-border" />}

              <Collapsible open={isOpen} onOpenChange={() => toggleSection(section.id)}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    className="w-full rounded-lg mx-1.5 mb-px py-1 px-2 inline-flex items-center gap-2 hover:translate-x-0.5 transition-transform"
                    style={{ marginTop: sectionIdx === 0 ? 4 : 0, width: 'calc(100% - 12px)' }}
                  >
                    <span className={`flex items-center transition-transform ${isOpen ? '' : '-rotate-90'}`}>
                      <ChevronDown size={14} />
                    </span>
                    <span className="flex-1 text-left text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground/70">
                      {section.label.toUpperCase()}
                    </span>
                    {!countsLoading && (
                      <span className="text-[0.6rem] font-medium text-muted-foreground/70">
                        {filteredItems.length}
                      </span>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col">
                    {filteredItems.map((item) => {
                      const active = isItemActive(item);
                      const count = mergedCounts[item.id];
                      const hasCount = item.countTable !== undefined;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => navigate(item.route)}
                          className={`rounded-lg mx-1.5 mb-px py-1.5 inline-flex items-center gap-2 transition-all hover:translate-x-0.5 ${active ? 'bg-muted font-semibold border-l-2 border-foreground pl-3' : 'pl-3.5 border-l-2 border-transparent'}`}
                        >
                          <span className="min-w-9 flex">
                            <IconBadge icon={item.icon} size={15} />
                          </span>
                          <span className="flex-1 text-left text-[0.85rem]">
                            {item.label}
                          </span>
                          {hasCount &&
                            (countsLoading ? (
                              <Skeleton className="w-7 h-[18px] rounded-[9px]" />
                            ) : (
                              <CountBadge count={count} />
                            ))}
                        </button>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })}
      </div>

      {/* User info footer */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-3 bg-muted/40">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.user_metadata?.avatar_url as string | undefined} />
          <AvatarFallback className="bg-foreground text-background text-[0.8rem] font-semibold">
            {userInitial}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[0.8rem] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {userDisplayName}
          </p>
          <p className="text-[0.65rem] text-muted-foreground/70 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {userEmail}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="p-1 rounded-md text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground transition-colors flex items-center justify-center flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Sign out</TooltipContent>
        </Tooltip>
      </div>
    </div>
    </TooltipProvider>
  );
}
