/**
 * AuditLog
 * Displays the CMS audit trail. Can show content-specific or global entries.
 * Supports filtering by action type and pagination.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { History, Clock, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCMSAudit } from '@/hooks/useCMSAudit';
import { formatRelativeTime, formatAction } from '@/lib/audit-format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

/** Tailwind classes for action type chips */
function getActionClasses(action: string): string {
  if (action.includes('publish') || action.includes('approved'))
    return 'border-foreground/40 text-foreground';
  if (action.includes('archive') || action.includes('delete'))
    return 'border-destructive text-destructive';
  if (action.includes('review') || action.includes('change_request'))
    return 'border-border text-foreground';
  if (action.includes('create') || action.includes('restore'))
    return 'border-foreground/40 text-foreground';
  if (action.includes('workflow')) return 'border-primary text-primary';
  return 'border-border text-foreground';
}

/** Extract known action values for filtering */
const KNOWN_ACTIONS = [
  'workflow_draft_to_review',
  'workflow_draft_to_published',
  'workflow_review_to_published',
  'workflow_review_to_draft',
  'workflow_published_to_archived',
  'workflow_published_to_draft',
  'workflow_archived_to_draft',
  'content_created',
  'content_updated',
  'content_deleted',
  'revision_created',
  'revision_restored',
  'comment_added',
  'media_uploaded',
  'media_deleted',
];

interface AuditLogProps {
  sourceTable?: string;
  sourceId?: string;
}

const PAGE_SIZE = 20;

type SinceOption = 'all' | '24h' | '7d' | '30d';

const SINCE_LABEL: Record<SinceOption, string> = {
  all: 'All',
  '24h': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

function sinceToIso(opt: SinceOption): string | undefined {
  if (opt === 'all') return undefined;
  const now = Date.now();
  const ms = opt === '24h' ? 24 * 3600e3 : opt === '7d' ? 7 * 86400e3 : 30 * 86400e3;
  return new Date(now - ms).toISOString();
}

export function AuditLog({ sourceTable, sourceId }: AuditLogProps) {
  const { entries, loading, error, totalCount, loadForContent, loadGlobal } = useCMSAudit();
  const [searchParams, setSearchParams] = useSearchParams();
  const sinceParam = searchParams.get('since');
  const since: SinceOption = (['24h', '7d', '30d'] as const).includes(sinceParam as SinceOption)
    ? (sinceParam as SinceOption)
    : 'all';
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const isContentSpecific = !!(sourceTable && sourceId);
  const sinceIso = useMemo(() => sinceToIso(since), [since]);

  const loadData = useCallback(() => {
    if (isContentSpecific) {
      loadForContent(sourceTable!, sourceId!);
    } else {
      loadGlobal({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        since: sinceIso,
      });
    }
  }, [isContentSpecific, sourceTable, sourceId, page, actionFilter, sinceIso, loadForContent, loadGlobal]);

  const setSince = useCallback(
    (opt: SinceOption) => {
      setPage(1);
      const next = new URLSearchParams(searchParams);
      if (opt === 'all') next.delete('since');
      else next.set('since', opt);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFilterChange = (newAction: string) => {
    setActionFilter(newAction);
    setPage(1);
  };

  // For content-specific mode, filter client-side
  const displayEntries =
    isContentSpecific && actionFilter !== 'all'
      ? entries.filter((e) => e.action === actionFilter)
      : entries;

  const totalPages = isContentSpecific
    ? Math.ceil(displayEntries.length / PAGE_SIZE)
    : Math.ceil(totalCount / PAGE_SIZE);

  // Paginate client-side for content-specific mode
  const paginatedEntries = isContentSpecific
    ? displayEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : displayEntries;

  // Collect unique actions for the filter dropdown
  const uniqueActions = isContentSpecific
    ? [...new Set(entries.map((e) => e.action))]
    : KNOWN_ACTIONS;

  return (
    <div>
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div className="flex flex-row items-center gap-1">
            <History size={18} className="text-muted-foreground" />
            <p className="text-sm font-semibold">Audit Log</p>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                ({totalCount} entr{totalCount !== 1 ? 'ies' : 'y'})
              </span>
            )}
          </div>

          <Select value={actionFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="h-8 min-w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Actions
              </SelectItem>
              {uniqueActions.map((action) => (
                <SelectItem key={action} value={action} className="text-xs">
                  {formatAction(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isContentSpecific && (
          <div
            role="radiogroup"
            aria-label="Filter by date"
            className="flex items-center gap-1"
          >
            {(['all', '24h', '7d', '30d'] as const).map((opt) => (
              <Button
                key={opt}
                size="sm"
                variant={since === opt ? 'default' : 'ghost'}
                aria-pressed={since === opt}
                className="h-6 px-2 text-2xs"
                onClick={() => setSince(opt)}
              >
                {SINCE_LABEL[opt]}
              </Button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
        </div>
      ) : error ? (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>Failed to load audit log: {error}</AlertDescription>
        </Alert>
      ) : paginatedEntries.length === 0 ? (
        <div className="border border-border rounded-element bg-background p-6 text-center">
          <History size={24} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No audit entries found.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border">
            {paginatedEntries.map((entry) => {
              const actorName =
                entry.actor?.display_name || entry.actor?.email || 'System';
              const initials = actorName
                .split(/[\s@]/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() || '')
                .join('');

              return (
                <div
                  key={entry.id}
                  className="flex gap-2 py-4 px-1 hover:bg-muted rounded"
                >
                  <Avatar className="w-7 h-7 mt-0.5">
                    <AvatarFallback className="bg-border text-2xs">
                      {initials || <User size={14} />}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-center gap-1 flex-wrap">
                      <p className="text-sm font-semibold">{actorName}</p>
                      <Badge
                        variant="outline"
                        className={`text-2xs h-5 ${getActionClasses(entry.action)}`}
                      >
                        {formatAction(entry.action)}
                      </Badge>
                      {entry.source_table && !isContentSpecific && (
                        <Badge variant="outline" className="text-2xs h-5">
                          {entry.source_table}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-row items-center gap-0.5 mt-0.5">
                      <Clock size={12} className="text-muted-foreground" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(entry.timestamp)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Date(entry.timestamp).toLocaleString()}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-2">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === page}
                        onClick={() => setPage(p)}
                        className="cursor-pointer"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={
                        page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
