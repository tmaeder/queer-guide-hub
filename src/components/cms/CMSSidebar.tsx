/**
 * CMSSidebar — Persistent left navigation for the CMS.
 */

import { useMemo, useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  ChevronDown,
  FileText,
  Image,
  ClipboardCheck,
  History,
  Activity,
  ShieldAlert,
  Settings,
  LogOut,
  Layers,
} from 'lucide-react';
import { getContentTypeIds, getContentType } from '@/config/contentTypeRegistry';
import { countRows } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';
import { brandColors } from '@/theme/brandColors';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type CMSView =
  | 'overview'
  | 'content'
  | 'pages'
  | 'media'
  | 'review'
  | 'quality'
  | 'moderation'
  | 'audit'
  | 'settings';

interface CMSSidebarProps {
  activeView: CMSView;
  activeContentType?: string;
  onNavigate: (view: CMSView, contentType?: string) => void;
  contentCounts?: Record<string, number>;
  reviewCount?: number;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p
      className="block px-5 pt-4 pb-1 text-[0.65rem] font-bold text-muted-foreground/60 uppercase select-none"
      style={{ letterSpacing: '0.08em' }}
    >
      {children}
    </p>
  );
}

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
      style={{ backgroundColor: color + '18', color: color }}
    >
      <Icon size={size} />
    </div>
  );
}

interface NavItemProps {
  isActive: boolean;
  accentColor?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

function NavItem({ isActive, accentColor, onClick, className, children }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center w-full text-left rounded-lg mx-1 mb-0.5 py-1.5 px-3 relative transition-all hover:translate-x-0.5',
        className,
      )}
      style={{
        backgroundColor: isActive
          ? (accentColor ? accentColor + '10' : 'hsl(var(--accent))')
          : 'transparent',
        borderLeft: isActive
          ? `3px solid ${accentColor || brandColors.main}`
          : '3px solid transparent',
        paddingLeft: isActive ? 12 : 14,
      }}
    >
      {children}
    </button>
  );
}

function CountBadge({ count, color }: { count: number | undefined; color?: string }) {
  if (count === undefined) return null;
  return (
    <Badge
      variant="secondary"
      className="h-5 text-[0.65rem] font-semibold min-w-[28px] px-1.5"
      style={{
        backgroundColor: color ? color + '14' : undefined,
        color: color || undefined,
      }}
    >
      {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
    </Badge>
  );
}

export function CMSSidebar({
  activeView,
  activeContentType,
  onNavigate,
  contentCounts: externalCounts,
  reviewCount = 0,
}: CMSSidebarProps) {
  const [contentOpen, setContentOpen] = useState(true);
  const [loadedCounts, setLoadedCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const { user } = useAuth();

  const contentTypes = useMemo(() => {
    return getContentTypeIds()
      .filter((id) => id !== 'cms_pages')
      .map((id) => getContentType(id)!)
      .filter(Boolean);
  }, []);

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const counts: Record<string, number> = {};
      const promises = contentTypes.map(async (ct) => {
        try {
          counts[ct.id] = await countRows(ct.tableName);
        } catch {
          // ignore
        }
      });
      await Promise.all(promises);
      setLoadedCounts(counts);
    } catch {
      // ignore
    } finally {
      setCountsLoading(false);
    }
  }, [contentTypes]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const contentCounts = externalCounts ?? loadedCounts;

  const userEmail = user?.email ?? '';
  const userDisplayName =
    (user?.user_metadata?.display_name as string) ||
    (user?.user_metadata?.first_name as string) ||
    userEmail.split('@')[0] ||
    'User';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
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
              className="font-bold leading-tight"
              style={{
                letterSpacing: '-0.02em',
                background: `linear-gradient(135deg, ${brandColors.main}, ${brandColors.main})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Content Hub
            </p>
            <p className="text-muted-foreground/60 text-[0.7rem]">Manage all content</p>
          </div>
        </div>
      </div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-auto py-1">
        <SectionLabel>Workspace</SectionLabel>

        <nav className="flex flex-col">
          <NavItem
            isActive={activeView === 'overview'}
            accentColor={brandColors.main}
            onClick={() => onNavigate('overview')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={LayoutDashboard} color="hsl(var(--foreground))" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'overview' ? 'font-semibold' : 'font-normal')}
            >
              Dashboard
            </span>
          </NavItem>

          <button
            type="button"
            onClick={() => setContentOpen(!contentOpen)}
            className="flex items-center w-full text-left rounded-lg mx-1 mb-0.5 py-1.5 px-3 transition-all hover:translate-x-0.5"
          >
            <span className="min-w-9 mr-2 flex">
              <span
                className="flex items-center transition-transform"
                style={{ transform: contentOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              >
                <ChevronDown size={16} />
              </span>
            </span>
            <span className="text-[0.85rem] font-semibold flex-1">Content</span>
            {!countsLoading && (
              <span className="text-muted-foreground/60 text-[0.65rem] font-medium">
                {contentTypes.length} types
              </span>
            )}
          </button>

          <Collapsible open={contentOpen}>
            <CollapsibleContent>
              <NavItem
                isActive={activeView === 'content' && !activeContentType}
                accentColor={brandColors.main}
                onClick={() => onNavigate('content')}
                className="!py-1"
              >
                <span
                  className={cn(
                    'text-[0.82rem] flex-1 ml-9',
                    activeView === 'content' && !activeContentType ? 'font-semibold' : 'font-normal',
                  )}
                >
                  All Content
                </span>
              </NavItem>

              {contentTypes.map((ct) => {
                const Icon = ct.icon;
                const isActive = activeView === 'content' && activeContentType === ct.id;
                const count = contentCounts[ct.id];
                return (
                  <NavItem
                    key={ct.id}
                    isActive={isActive}
                    accentColor={ct.color}
                    onClick={() => onNavigate('content', ct.id)}
                    className="!py-1 !pl-7"
                  >
                    <span className="min-w-9 mr-2 flex">
                      <IconBadge icon={Icon} color={ct.color} size={14} />
                    </span>
                    <span
                      className={cn('text-[0.82rem] flex-1', isActive ? 'font-semibold' : 'font-normal')}
                    >
                      {ct.label.plural}
                    </span>
                    {countsLoading ? (
                      <Skeleton className="w-7 h-[18px] rounded-[9px]" />
                    ) : (
                      <CountBadge count={count} color={ct.color} />
                    )}
                  </NavItem>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </nav>

        <SectionLabel>Tools</SectionLabel>

        <nav className="flex flex-col">
          <NavItem
            isActive={activeView === 'pages'}
            accentColor="#64748b"
            onClick={() => onNavigate('pages')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={FileText} color="#64748b" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'pages' ? 'font-semibold' : 'font-normal')}
            >
              Pages
            </span>
          </NavItem>

          <NavItem
            isActive={activeView === 'media'}
            accentColor="#3b82f6"
            onClick={() => onNavigate('media')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={Image} color="#3b82f6" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'media' ? 'font-semibold' : 'font-normal')}
            >
              Media Library
            </span>
          </NavItem>

          <NavItem
            isActive={activeView === 'review'}
            accentColor="#f59e0b"
            onClick={() => onNavigate('review')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={ClipboardCheck} color="#f59e0b" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'review' ? 'font-semibold' : 'font-normal')}
            >
              Review Queue
            </span>
            {reviewCount > 0 && (
              <Badge
                className="h-5 text-[0.65rem] font-bold min-w-[24px] px-1.5"
                style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
              >
                {reviewCount}
              </Badge>
            )}
          </NavItem>

          <NavItem
            isActive={activeView === 'quality'}
            accentColor="#10b981"
            onClick={() => onNavigate('quality')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={Activity} color="#10b981" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'quality' ? 'font-semibold' : 'font-normal')}
            >
              Data Quality
            </span>
          </NavItem>

          <NavItem
            isActive={activeView === 'moderation'}
            accentColor="#ef4444"
            onClick={() => onNavigate('moderation')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={ShieldAlert} color="#ef4444" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'moderation' ? 'font-semibold' : 'font-normal')}
            >
              Moderation
            </span>
          </NavItem>

          <NavItem
            isActive={activeView === 'audit'}
            accentColor="#6366f1"
            onClick={() => onNavigate('audit')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={History} color="#6366f1" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'audit' ? 'font-semibold' : 'font-normal')}
            >
              Audit Log
            </span>
          </NavItem>

          <hr className="my-1.5 mx-3 border-border" />

          <NavItem
            isActive={activeView === 'settings'}
            accentColor="#64748b"
            onClick={() => onNavigate('settings')}
          >
            <span className="min-w-9 mr-2 flex">
              <IconBadge icon={Settings} color="#64748b" size={15} />
            </span>
            <span
              className={cn('text-[0.85rem] flex-1', activeView === 'settings' ? 'font-semibold' : 'font-normal')}
            >
              Settings
            </span>
          </NavItem>
        </nav>
      </div>

      {/* User info footer */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-3 bg-muted/30">
        <Avatar className="w-8 h-8">
          <AvatarImage src={user?.user_metadata?.avatar_url as string | undefined} />
          <AvatarFallback
            className="text-xs font-semibold text-white"
            style={{ backgroundColor: brandColors.main }}
          >
            {userInitial}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[0.8rem] leading-tight truncate">{userDisplayName}</p>
          <p className="text-muted-foreground/60 text-[0.65rem] leading-tight truncate block">
            {userEmail}
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="p-1 rounded-md border-0 bg-transparent text-muted-foreground/60 cursor-pointer flex items-center justify-center flex-shrink-0 transition-all hover:bg-muted hover:text-muted-foreground"
              >
                <LogOut size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
