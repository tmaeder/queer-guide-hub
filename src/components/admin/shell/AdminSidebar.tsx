/**
 * AdminSidebar -- Unified left navigation for the admin console.
 * Search-to-filter, pinned favourites, grouped Content subheaders, live counts
 * (shared useAdminCounts), berry active indicator, and a collapse-to-icon-rail.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  ChevronDown,
  LogOut,
  Layers,
  Shield,
  Search as SearchIcon,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { adminNavSections, resolveItemMinRole } from '@/config/adminNavigation';
import type { AdminNavItem, AdminNavSection } from '@/config/adminNavigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import { roleAtLeast } from '@/config/adminRoles';
import { useAdminCounts, readCount } from '@/hooks/useAdminCounts';
import { useAdminNavPins } from '@/hooks/useAdminNavPins';
import { cn } from '@/lib/utils';

const COLLAPSE_KEY = 'admin.nav.collapsed';

function IconBadge({ icon: Icon, size = 15 }: { icon: React.ComponentType<{ size?: number }>; size?: number }) {
  return (
    <div className="w-7 h-7 flex items-center justify-center text-muted-foreground">
      <Icon size={size} />
    </div>
  );
}

function CountBadge({ count, overdue }: { count: number | undefined; overdue?: number }) {
  if (count === undefined) return null;
  const hasOverdue = (overdue ?? 0) > 0;
  return (
    <span className="inline-flex items-center gap-1">
      {hasOverdue && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span aria-label={`${overdue} overdue`} className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
          </TooltipTrigger>
          <TooltipContent>{overdue} overdue</TooltipContent>
        </Tooltip>
      )}
      <span
        className={cn(
          'inline-flex items-center justify-center rounded h-5 min-w-7 px-1.5 text-2xs font-semibold',
          hasOverdue ? 'bg-destructive/10 text-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
      </span>
    </span>
  );
}

export function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { effectiveRole } = useGranularRoles();
  const isAdmin = effectiveRole === 'admin';

  const { data: counts, isLoading: countsLoading } = useAdminCounts();
  const { pins, togglePin, isPinned } = useAdminNavPins();

  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of adminNavSections) initial[section.id] = section.defaultExpanded ?? true;
    return initial;
  });
  const toggleSection = (id: string) => setSectionOpen((p) => ({ ...p, [id]: !p[id] }));

  const canSee = (item: AdminNavItem, section: AdminNavSection) =>
    isAdmin || roleAtLeast(effectiveRole, resolveItemMinRole(item, section));

  // Flat index of visible items (for search + pinned resolution).
  const visibleItems = useMemo(() => {
    const out: Array<{ item: AdminNavItem; section: AdminNavSection }> = [];
    for (const section of adminNavSections) {
      for (const item of section.items) if (canSee(item, section)) out.push({ item, section });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole, isAdmin]);

  const itemCount = (item: AdminNavItem) => {
    const key = item.countTable ?? item.reviewCountKey;
    const { count, overdue } = readCount(counts, key);
    return { count, overdue, hasCount: Boolean(item.countTable || item.reviewCountKey) };
  };

  const isItemActive = (item: AdminNavItem) =>
    item.route === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.route);

  const userEmail = user?.email ?? '';
  const userDisplayName =
    (user?.user_metadata?.display_name as string) ||
    (user?.user_metadata?.first_name as string) ||
    userEmail.split('@')[0] ||
    'User';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  // ── One nav button row ──────────────────────────────────────────
  function NavRow({ item }: { item: AdminNavItem }) {
    const active = isItemActive(item);
    const { count, overdue, hasCount } = itemCount(item);
    const pinned = isPinned(item.id);

    const button = (
      <button
        type="button"
        onClick={() => navigate(item.route)}
        className={cn(
          'group/navrow rounded-element mx-1.5 mb-px py-1.5 inline-flex items-center gap-2 transition-all hover:translate-x-0.5 w-[calc(100%-12px)]',
          active
            ? 'bg-muted font-semibold border-l-2 border-foreground pl-4'
            : 'pl-4.5 border-l-2 border-transparent',
        )}
      >
        <span className="min-w-9 flex">
          <IconBadge icon={item.icon} />
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-sm truncate">{item.label}</span>
            {!collapsed && (
              <span
                role="button"
                tabIndex={0}
                aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(item.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePin(item.id);
                  }
                }}
                className={cn(
                  'p-0.5 text-muted-foreground hover:text-foreground',
                  pinned ? 'opacity-100' : 'opacity-0 group-hover/navrow:opacity-100',
                )}
              >
                <Star size={12} className={pinned ? 'fill-current' : undefined} aria-hidden />
              </span>
            )}
            {hasCount &&
              (countsLoading ? (
                <Skeleton className="w-7 h-[18px] rounded-[9px]" />
              ) : (
                <CountBadge count={count} overdue={overdue} />
              ))}
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return button;
  }

  // ── Render a section's items, with optional group subheaders ─────
  function SectionItems({ items }: { items: AdminNavItem[] }) {
    const ungrouped = items.filter((i) => !i.group);
    const groups: string[] = [];
    for (const i of items) if (i.group && !groups.includes(i.group)) groups.push(i.group);

    return (
      <div className="flex flex-col">
        {ungrouped.map((item) => (
          <NavRow key={item.id} item={item} />
        ))}
        {groups.map((g) => (
          <div key={g}>
            {!collapsed && (
              <div className="mx-4 mt-2 mb-0.5 text-3xs font-semibold uppercase tracking-label text-muted-foreground/60">
                {g}
              </div>
            )}
            {items
              .filter((i) => i.group === g)
              .map((item) => (
                <NavRow key={item.id} item={item} />
              ))}
          </div>
        ))}
      </div>
    );
  }

  const searching = search.trim().length > 0;
  const searchResults = searching
    ? visibleItems.filter(({ item }) => item.label.toLowerCase().includes(search.trim().toLowerCase()))
    : [];

  const pinnedItems = pins
    .map((id) => visibleItems.find((v) => v.item.id === id))
    .filter((v): v is { item: AdminNavItem; section: AdminNavSection } => Boolean(v));

  return (
    <TooltipProvider>
      <div
        className={cn(
          'min-h-full border-r border-border bg-background flex flex-col overflow-hidden transition-[width]',
          collapsed ? 'w-[64px]' : 'w-[260px]',
        )}
      >
        {/* Header */}
        <div className={cn('border-b border-border', collapsed ? 'px-2 py-4' : 'px-6 py-6')}>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 bg-foreground text-background">
              <Layers size={16} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight leading-tight">Admin Console</p>
                <p className="text-xs2 text-muted-foreground/70">Manage everything</p>
              </div>
            )}
            {!collapsed && isAdmin && (
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

        {/* Search */}
        {!collapsed && (
          <div className="px-4 py-2 border-b border-border">
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nav — or ⌘K for everything"
                className="h-8 pl-8 text-13 rounded-element"
                aria-label="Search navigation"
              />
            </div>
          </div>
        )}

        {/* Scrollable nav area */}
        <div className="flex-1 overflow-auto py-1">
          {searching ? (
            <div className="flex flex-col">
              {searchResults.length === 0 ? (
                <p className="px-4 py-2 text-2xs text-muted-foreground">No matches.</p>
              ) : (
                searchResults.map(({ item }) => <NavRow key={item.id} item={item} />)
              )}
            </div>
          ) : (
            <>
              {/* Pinned */}
              {!collapsed && pinnedItems.length > 0 && (
                <div className="mb-1">
                  <div className="mx-1.5 mt-1 mb-px py-1 px-2 inline-flex items-center gap-2">
                    <Pin size={12} className="text-muted-foreground/70" aria-hidden />
                    <span className="text-2xs font-bold tracking-[0.08em] text-muted-foreground/70">PINNED</span>
                  </div>
                  {pinnedItems.map(({ item }) => (
                    <NavRow key={`pin-${item.id}`} item={item} />
                  ))}
                  <div className="my-1.5 mx-4 border-t border-border" />
                </div>
              )}

              {adminNavSections.map((section, sectionIdx) => {
                const items = section.items.filter((i) => canSee(i, section));
                if (items.length === 0) return null;
                const isOpen = sectionOpen[section.id] ?? section.defaultExpanded ?? true;

                if (collapsed) {
                  // Icon rail: flat icons, no section chrome.
                  return <SectionItems key={section.id} items={items} />;
                }

                return (
                  <div key={section.id}>
                    {sectionIdx > 0 && <div className="my-1.5 mx-4 border-t border-border" />}
                    <Collapsible open={isOpen} onOpenChange={() => toggleSection(section.id)}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          className="w-[calc(100%-12px)] rounded-element mx-1.5 mb-px py-1 px-2 inline-flex items-center gap-2 hover:translate-x-0.5 transition-transform"
                          style={{ marginTop: sectionIdx === 0 ? 4 : 0 }}
                        >
                          <span className={cn('flex items-center transition-transform', !isOpen && '-rotate-90')}>
                            <ChevronDown size={14} />
                          </span>
                          <span className="flex-1 text-left text-2xs font-bold tracking-[0.08em] text-muted-foreground/70">
                            {section.label.toUpperCase()}
                          </span>
                          <span className="text-2xs font-medium text-muted-foreground/70">{items.length}</span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SectionItems items={items} />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="border-t border-border px-4 py-2 inline-flex items-center gap-2 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span className="text-2xs font-medium">Collapse</span>}
        </button>

        {/* User info footer */}
        <div className={cn('border-t border-border flex items-center gap-4 bg-muted/40', collapsed ? 'px-2 py-4 justify-center' : 'px-4 py-4')}>
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.user_metadata?.avatar_url as string | undefined} />
            <AvatarFallback className="bg-foreground text-background text-13 font-semibold">
              {userInitial}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-13 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                  {userDisplayName}
                </p>
                <p className="text-2xs text-muted-foreground/70 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                  {userEmail}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => supabase.auth.signOut()}
                    className="p-1 rounded-element text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground transition-colors flex items-center justify-center flex-shrink-0"
                  >
                    <LogOut size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
