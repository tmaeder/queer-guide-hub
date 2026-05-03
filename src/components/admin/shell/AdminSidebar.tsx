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
import { brandColors } from '@/theme/muiTheme';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

function IconBadge({
  icon: Icon,
  color,
  size = 16,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
      style={{ backgroundColor: color + '18', color }}
    >
      <Icon size={size} />
    </div>
  );
}

function CountBadge({ count, color }: { count: number | undefined; color?: string }) {
  if (count === undefined) return null;
  return (
    <span
      className="inline-flex items-center justify-center rounded h-5 min-w-7 px-1.5 text-[0.65rem] font-semibold"
      style={{
        backgroundColor: color ? color + '14' : 'hsl(var(--muted))',
        color: color || 'hsl(var(--muted-foreground))',
      }}
    >
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
      {/* Gradient Header */}
      <div
        className="px-5 py-5 border-b border-border"
        style={{
          background: `linear-gradient(135deg, ${brandColors.main}14 0%, ${brandColors.light}0A 50%, transparent 100%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${brandColors.main}, ${brandColors.light})`,
              boxShadow: `0 2px 8px ${brandColors.main}4D`,
            }}
          >
            <Layers size={16} color="#fff" />
          </div>
          <div>
            <p
              className="text-sm font-bold tracking-tight leading-tight"
              style={{
                background: `linear-gradient(135deg, ${brandColors.main}, ${brandColors.main})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Admin Console
            </p>
            <p className="text-[0.7rem] text-muted-foreground/70">Manage everything</p>
          </div>
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="ml-auto flex items-center"
                  style={{ color: brandColors.main }}
                >
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
                    className="w-full rounded-lg mx-1.5 mb-px py-1 px-2 inline-flex items-center gap-2 hover:translate-x-0.5 transition-transform"
                    style={{ marginTop: sectionIdx === 0 ? 4 : 0, width: 'calc(100% - 12px)' }}
                  >
                    <span
                      className="flex items-center transition-transform"
                      style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    >
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
                      const itemColor = item.color ?? section.color;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => navigate(item.route)}
                          className="rounded-lg mx-1.5 mb-px py-1.5 inline-flex items-center gap-2 transition-all hover:translate-x-0.5"
                          style={{
                            paddingLeft: active ? 12 : 14,
                            backgroundColor: active
                              ? itemColor + '10'
                              : 'transparent',
                            borderLeft: active
                              ? `3px solid ${itemColor || brandColors.main}`
                              : '3px solid transparent',
                          }}
                        >
                          <span className="min-w-9 flex">
                            <IconBadge icon={item.icon} color={itemColor} size={15} />
                          </span>
                          <span
                            className="flex-1 text-left text-[0.85rem]"
                            style={{ fontWeight: active ? 600 : 400 }}
                          >
                            {item.label}
                          </span>
                          {hasCount &&
                            (countsLoading ? (
                              <Skeleton className="w-7 h-[18px] rounded-[9px]" />
                            ) : (
                              <CountBadge count={count} color={itemColor} />
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
          <AvatarFallback
            style={{
              backgroundColor: brandColors.main,
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
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
