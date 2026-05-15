/**
 * CMSOverview — Dashboard overview panel.
 * Shows content counts per type, recent activity, quick actions,
 * personalized greeting, skeleton loading, and visual flair.
 */

import { useEffect, useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  TrendingUp,
  Clock,
  AlertCircle,
  BarChart3,
  FileText,
  Image,
  ClipboardCheck,
  History,
  ArrowRight,
  MapPin,
  Calendar,
  Newspaper,
  Layers,
} from 'lucide-react';
import { listFrom, listFromIn, countRows } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';
import { getContentTypeIds, getContentType } from '@/config/contentTypeRegistry';
import type { CMSView } from './CMSSidebar';

interface CMSOverviewProps {
  onNavigate: (view: CMSView, contentType?: string) => void;
  onEdit: (contentType: string, itemId: string | null) => void;
}

interface ContentCount {
  id: string;
  label: string;
  count: number;
  color: string;
  icon: React.ElementType;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  source_table: string | null;
  source_id: string | null;
  timestamp: string;
  actorEmail?: string;
}

// Lightweight alpha
function alphaHex(color: string, a: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return `color-mix(in srgb, ${color} ${a * 100}%, transparent)`;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getFirstName(email: string | undefined): string {
  if (!email) return '';
  const prefix = email.split('@')[0];
  const name = prefix.split(/[._-]/)[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getActionColor(action: string): string {
  if (action.includes('create') || action.includes('insert')) return '#10b981';
  if (action.includes('update') || action.includes('edit')) return '#3b82f6';
  if (action.includes('delete') || action.includes('remove')) return '#ef4444';
  if (action.includes('publish')) return 'hsl(var(--foreground))';
  return '#6b7280';
}

const STAT_CARDS = [
  { key: 'total', label: 'Total Items', icon: TrendingUp, color: '#3b82f6' },
  { key: 'review', label: 'In Review', icon: Clock, color: '#f59e0b' },
  { key: 'types', label: 'Content Types', icon: Layers, color: 'hsl(var(--foreground))' },
  { key: 'queue', label: 'Review Queue', color: '#10b981', icon: AlertCircle },
] as const;

// ── Skeleton loader ─────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-80 mt-1" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-5 rounded-element bg-background"
            style={{ borderLeft: '3px solid', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="rounded-full" style={{ width: 36, height: 36 }} />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>

      <Skeleton className="h-6 w-32 mb-3" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="p-4 rounded-element bg-background overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="rounded-full" style={{ width: 28, height: 28 }} />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-7 w-12 mb-3" />
            <Skeleton className="h-1 w-full rounded" />
          </div>
        ))}
      </div>

      <Skeleton className="h-6 w-32 mb-3" />
      <div className="p-4 rounded-element bg-background">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Skeleton className="rounded-full" style={{ width: 8, height: 8 }} />
            <div className="flex-1">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-1/3 mt-1" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function CMSOverview({ onNavigate, onEdit }: CMSOverviewProps) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<ContentCount[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);

  const contentTypeIds = useMemo(
    () => getContentTypeIds().filter((id) => id !== 'cms_pages'),
    [],
  );

  const firstName = useMemo(() => getFirstName(user?.email), [user?.email]);

  useEffect(() => {
    loadCounts();
    loadRecentActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function loadCounts() {
    setLoading(true);
    try {
      const results: ContentCount[] = [];

      for (const id of contentTypeIds) {
        const config = getContentType(id);
        if (!config) continue;

        const count = await countRows(config.tableName);

        results.push({
          id: config.id,
          label: config.label.plural,
          count,
          color: config.color,
          icon: config.icon,
        });
      }

      const pagesCount = await countRows('cms_pages');
      const pagesConfig = getContentType('cms_pages');
      if (pagesConfig) {
        results.push({
          id: 'cms_pages',
          label: 'Pages',
          count: pagesCount,
          color: pagesConfig.color,
          icon: pagesConfig.icon,
        });
      }

      const revCount = await countRows('cms_content_metadata', {
        col: 'workflow_state',
        val: 'review',
      });

      setCounts(results);
      setReviewCount(revCount);
    } catch (err) {
      console.error('Error loading overview counts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecentActivity() {
    try {
      const entries = await listFrom<AuditEntry>(
        'cms_audit_log',
        'id, action, actor_id, source_table, source_id, timestamp',
        { col: 'timestamp', ascending: false },
        5,
      );
      if (entries.length === 0) {
        setRecentActivity([]);
        return;
      }

      const actorIds = [
        ...new Set(entries.map((e) => e.actor_id).filter(Boolean) as string[]),
      ];

      let actorMap: Record<string, string> = {};
      if (actorIds.length > 0) {
        const profiles = await listFromIn<{ user_id: string; email: string }>(
          'profiles',
          'user_id, email',
          'user_id',
          actorIds,
        );
        actorMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.email]));
      }

      setRecentActivity(
        (entries as unknown as AuditEntry[]).map((e) => ({
          ...e,
          actorEmail: e.actor_id ? actorMap[e.actor_id] : undefined,
        })),
      );
    } catch (err) {
      console.error('Error loading recent activity:', err);
      setRecentActivity([]);
    }
  }

  if (loading) {
    return <OverviewSkeleton />;
  }

  const totalContent = counts.reduce((sum, c) => sum + c.count, 0);
  const maxCount = Math.max(...counts.map((c) => c.count), 1);

  const statValues = [
    totalContent.toLocaleString(),
    reviewCount.toString(),
    counts.length.toString(),
  ];

  return (
    <div>
      {/* ── Header with greeting ────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">
          {firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Overview of all content across the platform
        </p>
      </div>

      {/* ── Summary stat cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map((card, i) => {
          const StatIcon = card.icon;
          const isQueue = card.key === 'queue';

          return (
            <div
              key={card.key}
              onClick={isQueue ? () => onNavigate('review') : undefined}
              className="p-5 rounded-element transition-all"
              style={{
                borderLeft: `3px solid ${card.color}`,
                background: `linear-gradient(135deg, ${alphaHex(card.color, 0.04)} 0%, hsl(var(--background)) 100%)`,
                cursor: isQueue ? 'pointer' : 'default',
              }}
            >
              {isQueue ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="rounded-full flex items-center justify-center"
                      style={{
                        width: 36,
                        height: 36,
                        background: alphaHex(card.color, 0.12),
                      }}
                    >
                      <ClipboardCheck size={18} style={{ color: card.color }} />
                    </div>
                    {reviewCount > 0 ? (
                      <Badge
                        className="h-[22px] text-[0.7rem] font-semibold"
                        style={{
                          background: alphaHex('#f59e0b', 0.12),
                          color: '#d97706',
                        }}
                      >
                        Action Needed
                      </Badge>
                    ) : (
                      <Badge
                        className="h-[22px] text-[0.7rem] font-semibold"
                        style={{
                          background: alphaHex('#10b981', 0.12),
                          color: '#059669',
                        }}
                      >
                        All Clear
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">Review Queue</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="rounded-full flex items-center justify-center"
                      style={{
                        width: 36,
                        height: 36,
                        background: alphaHex(card.color, 0.12),
                      }}
                    >
                      <StatIcon size={18} style={{ color: card.color }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tracking-wide">
                      {card.label}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{statValues[i]}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Content type cards ──────────────────────────────────── */}
      <h2 className="text-base font-semibold mb-3">Content Types</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
        {counts.map((ct) => {
          const Icon = ct.icon;
          const barWidth = Math.max((ct.count / maxCount) * 100, 2);

          return (
            <div
              key={ct.id}
              onClick={() =>
                ct.id === 'cms_pages' ? onNavigate('pages') : onNavigate('content', ct.id)
              }
              className="p-4 cursor-pointer rounded-element overflow-hidden bg-background border border-border transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    background: alphaHex(ct.color, 0.12),
                  }}
                >
                  <Icon size={14} style={{ color: ct.color }} />
                </div>
                <p className="text-sm font-semibold overflow-hidden whitespace-nowrap text-ellipsis">
                  {ct.label}
                </p>
              </div>

              <div className="text-lg font-bold mb-3">{ct.count.toLocaleString()}</div>

              <div
                className="w-full rounded-full"
                style={{ height: 4, background: alphaHex(ct.color, 0.1) }}
              >
                <div
                  className="rounded-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    background: ct.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Recent Activity ─────────────────────────────────────── */}
      {recentActivity.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Recent Activity</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('audit')}
              className="text-xs normal-case"
            >
              View all
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
          <div className="rounded-element overflow-hidden mb-6 bg-background border border-border">
            {recentActivity.map((entry, idx) => {
              const actionColor = getActionColor(entry.action);
              const isLast = idx === recentActivity.length - 1;

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted"
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid hsl(var(--border))',
                  }}
                >
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{ width: 8, height: 8, background: actionColor }}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {formatAction(entry.action)}
                      {entry.source_table && (
                        <span className="text-muted-foreground font-normal">
                          {' '}on {entry.source_table.replace(/_/g, ' ')}
                        </span>
                      )}
                    </p>
                    {entry.actorEmail && (
                      <span className="text-xs text-muted-foreground">{entry.actorEmail}</span>
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {relativeTime(entry.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <hr className="my-4 border-border" />
      <h2 className="text-base font-semibold mb-3">Quick Actions</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-4">
          <span
            className="text-muted-foreground uppercase tracking-wider"
            style={{ fontSize: '0.65rem' }}
          >
            Create
          </span>
        </div>
        {[
          { label: 'New Page', icon: FileText, color: '#64748b', onClick: () => onEdit('cms_pages', null) },
          { label: 'New Venue', icon: MapPin, color: 'hsl(var(--foreground))', onClick: () => onEdit('venues', null) },
          { label: 'New Event', icon: Calendar, color: '#ec4899', onClick: () => onEdit('events', null) },
          { label: 'New Article', icon: Newspaper, color: '#3b82f6', onClick: () => onEdit('news_articles', null) },
        ].map((action) => (
          <div
            key={action.label}
            onClick={action.onClick}
            className="p-4 rounded-element cursor-pointer flex items-center gap-3 bg-background border border-border transition-transform hover:-translate-y-px"
          >
            <div
              className="rounded-element flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                background: alphaHex(action.color, 0.1),
              }}
            >
              <Plus size={14} style={{ color: action.color }} />
            </div>
            <span className="text-sm font-medium">{action.label}</span>
          </div>
        ))}

        <div className="col-span-2 sm:col-span-4 mt-2">
          <span
            className="text-muted-foreground uppercase tracking-wider"
            style={{ fontSize: '0.65rem' }}
          >
            Navigate
          </span>
        </div>
        {[
          { label: 'Media Library', icon: Image, color: '#14b8a6', onClick: () => onNavigate('media') },
          { label: 'Review Queue', icon: ClipboardCheck, color: '#f59e0b', onClick: () => onNavigate('review') },
          { label: 'Audit Log', icon: History, color: '#6366f1', onClick: () => onNavigate('audit') },
          { label: 'All Content', icon: BarChart3, color: '#6b7280', onClick: () => onNavigate('content') },
        ].map((action) => {
          const ActionIcon = action.icon;
          return (
            <div
              key={action.label}
              onClick={action.onClick}
              className="p-4 rounded-element cursor-pointer flex items-center gap-3 bg-background border border-border transition-transform hover:-translate-y-px"
            >
              <div
                className="rounded-element flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  background: alphaHex(action.color, 0.1),
                }}
              >
                <ActionIcon size={16} style={{ color: action.color }} />
              </div>
              <span className="text-sm font-medium">{action.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
