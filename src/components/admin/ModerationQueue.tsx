import { useState, useEffect } from 'react';
import { useModeration, ModerationFilters } from '@/hooks/useModeration';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { listFromWhere } from '@/hooks/usePageFetchers';
import {
  Flag,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'hsl(var(--foreground) / 0.55)',
  IN_REVIEW: 'hsl(var(--muted-foreground))',
  RESOLVED: 'hsl(var(--foreground))',
  REJECTED: 'hsl(var(--muted-foreground))',
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  REVIEW: 'Needs Review',
  CORRECTION: 'Correction',
  DELETE_REQUEST: 'Delete Request',
  LINK_ISSUE: 'Link Issue',
  DUPLICATE: 'Duplicate',
  OTHER: 'Other',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venue',
  events: 'Event',
  cities: 'City',
  countries: 'Country',
  personalities: 'Personality',
  news_articles: 'News',
  hotels: 'Hotel',
  queer_villages: 'Village',
  festivals: 'Festival',
  marketplace_listings: 'Marketplace',
};

export function ModerationQueue() {
  const { flags, totalCount, loading, fetchFlags, updateFlagStatus, bulkUpdateFlags } =
    useModeration();
  const { canManageContent } = useAdminRoles();
  const [filters, setFilters] = useState<ModerationFilters>({});
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveAction, setResolveAction] = useState<'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolveTargetIds, setResolveTargetIds] = useState<string[]>([]);

  const pageSize = 20;

  useEffect(() => {
    fetchFlags(filters, page, pageSize);
  }, [fetchFlags, filters, page]);

  const handleFilterChange = (key: keyof ModerationFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value === '__all__' ? undefined : value || undefined }));
    setPage(0);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const [_selectAllCount, setSelectAllCount] = useState(0);

  const toggleSelectAll = async () => {
    if (selectedIds.length > 0) {
      setSelectedIds([]);
      setSelectAllCount(0);
    } else {
      const flt: Array<{ col: string; val: unknown }> = [];
      if (filters.status) flt.push({ col: 'status', val: filters.status });
      if (filters.flag_type) flt.push({ col: 'flag_type', val: filters.flag_type });
      if (filters.content_type) flt.push({ col: 'content_type', val: filters.content_type });
      if (filters.source) flt.push({ col: 'source', val: filters.source });
      const data = await listFromWhere<{ id: string }>(
        'moderation_flags',
        'id',
        flt,
        { order: { col: 'created_at', ascending: false }, limit: 2000 },
      );
      const allIds = data.map((f) => f.id);
      setSelectedIds(allIds);
      setSelectAllCount(allIds.length);
    }
  };

  const openResolveDialog = (ids: string[], action: 'RESOLVED' | 'REJECTED') => {
    setResolveTargetIds(ids);
    setResolveAction(action);
    setResolutionNote('');
    setResolveDialogOpen(true);
  };

  const handleResolve = async () => {
    if (resolveTargetIds.length === 1) {
      const result = await updateFlagStatus(
        resolveTargetIds[0],
        resolveAction,
        resolutionNote || undefined,
      );
      if (result.success) {
        toast.success(`Flag ${resolveAction.toLowerCase()}`);
      } else {
        toast.error(result.error || 'Failed to update flag');
      }
    } else {
      const result = await bulkUpdateFlags(
        resolveTargetIds,
        resolveAction,
        resolutionNote || undefined,
      );
      if (result.success) {
        toast.success(`${resolveTargetIds.length} flags ${resolveAction.toLowerCase()}`);
      } else {
        toast.error(result.error || 'Failed to update flags');
      }
    }
    setResolveDialogOpen(false);
    setSelectedIds([]);
  };

  if (!canManageContent()) {
    return (
      <div className="text-center py-16">
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="flex flex-col gap-6">
      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => openResolveDialog(selectedIds, 'RESOLVED')}>
            <CheckCircle style={{ width: 14, height: 14, marginRight: 4 }} />
            Resolve ({selectedIds.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openResolveDialog(selectedIds, 'REJECTED')}
          >
            <XCircle style={{ width: 14, height: 14, marginRight: 4 }} />
            Reject ({selectedIds.length})
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs">Status</Label>
          <Select
            value={filters.status || '__all__'}
            onValueChange={(v) => handleFilterChange('status', v)}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="IN_REVIEW">In Review</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs">Flag Type</Label>
          <Select
            value={filters.flag_type || '__all__'}
            onValueChange={(v) => handleFilterChange('flag_type', v)}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {Object.entries(FLAG_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs">Content Type</Label>
          <Select
            value={filters.content_type || '__all__'}
            onValueChange={(v) => handleFilterChange('content_type', v)}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <Label className="text-xs">Source</Label>
          <Select
            value={filters.source || '__all__'}
            onValueChange={(v) => handleFilterChange('source', v)}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="h-1 w-full overflow-hidden bg-muted">
          <div className="h-full w-full animate-pulse bg-primary" />
        </div>
      )}

      {/* Flags list */}
      {flags.length === 0 && !loading ? (
        <div className="text-center py-16">
          <Flag className="w-12 h-12 text-gray-300 mb-4 mx-auto block" />
          <h6 className="font-semibold mb-1">No flags found</h6>
          <p className="text-muted-foreground">
            {Object.keys(filters).length > 0
              ? 'Try adjusting your filters.'
              : 'All clear! No moderation flags to review.'}
          </p>
        </div>
      ) : (
        <>
          {/* Select all */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.length > 0 && selectedIds.length >= totalCount}
              onCheckedChange={toggleSelectAll}
            />
            <p className="text-sm text-muted-foreground">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected (all pages)`
                : `Select all (${totalCount})`}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {flags.map((flag) => (
              <Card
                key={flag.id}
                className={cn(
                  'border transition-all hover:shadow-md',
                  selectedIds.includes(flag.id) ? 'border-primary' : 'border-border',
                )}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.includes(flag.id)}
                      onCheckedChange={() => toggleSelect(flag.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      {/* Top row: badges + actions */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge
                          className="text-white font-semibold text-[0.7rem]"
                          style={{ backgroundColor: STATUS_COLORS[flag.status] || 'hsl(var(--muted-foreground))' }}
                        >
                          {flag.status}
                        </Badge>
                        <Badge variant="outline">
                          {FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                        </Badge>
                        <Badge variant="outline">
                          {CONTENT_TYPE_LABELS[flag.content_type] || flag.content_type}
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-[0.7rem]">
                          {flag.source === 'system' ? (
                            <Bot style={{ width: 12, height: 12 }} />
                          ) : (
                            <User style={{ width: 12, height: 12 }} />
                          )}
                          {flag.source === 'system' ? 'System' : 'User'}
                        </Badge>
                        <div className="flex-1" />
                        <p className="text-xs text-muted-foreground">
                          {new Date(flag.created_at).toLocaleDateString()}{' '}
                          {new Date(flag.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      {/* Reason */}
                      <p className="text-sm mt-1 mb-2">{flag.reason}</p>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {flag.status === 'OPEN' && (
                          <>
                            <Button size="sm" onClick={() => updateFlagStatus(flag.id, 'IN_REVIEW')}>
                              <Eye style={{ width: 12, height: 12, marginRight: 4 }} />
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog([flag.id], 'RESOLVED')}
                            >
                              <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog([flag.id], 'REJECTED')}
                            >
                              <XCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Reject
                            </Button>
                          </>
                        )}
                        {flag.status === 'IN_REVIEW' && (
                          <>
                            <Button size="sm" onClick={() => openResolveDialog([flag.id], 'RESOLVED')}>
                              <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog([flag.id], 'REJECTED')}
                            >
                              <XCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setExpandedId(expandedId === flag.id ? null : flag.id)}
                        >
                          {expandedId === flag.id ? (
                            <ChevronUp style={{ width: 16, height: 16 }} />
                          ) : (
                            <ChevronDown style={{ width: 16, height: 16 }} />
                          )}
                        </Button>
                      </div>

                      {/* Expanded detail */}
                      <Collapsible open={expandedId === flag.id}>
                        <CollapsibleContent>
                          <div className="mt-4 p-4 bg-muted rounded">
                            <p className="text-xs text-muted-foreground block mb-1">
                              Content ID: {flag.content_id}
                            </p>
                            {flag.reporter_user_id && (
                              <p className="text-xs text-muted-foreground block mb-1">
                                Reporter: {flag.reporter_user_id}
                              </p>
                            )}
                            {flag.suggested_changes && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold block mb-1">Suggested Changes:</p>
                                <pre className="text-xs overflow-auto max-h-[200px] p-2 bg-background rounded">
                                  {JSON.stringify(flag.suggested_changes, null, 2)}
                                </pre>
                              </div>
                            )}
                            {flag.resolution_note && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold block mb-1">Resolution Note:</p>
                                <p className="text-sm">{flag.resolution_note}</p>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="flex justify-center mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page > 0) setPage(page - 1); }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <PaginationItem key={i}>
                      <PaginationLink
                        href="#"
                        isActive={page === i}
                        onClick={(e) => { e.preventDefault(); setPage(i); }}
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page < totalPages - 1) setPage(page + 1); }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}

      {/* Resolve dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {resolveAction === 'RESOLVED' ? 'Resolve' : 'Reject'}{' '}
              {resolveTargetIds.length > 1 ? `${resolveTargetIds.length} flags` : 'flag'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label>Resolution note (optional)</Label>
            <Textarea
              rows={3}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={loading}>
              {resolveAction === 'RESOLVED' ? 'Resolve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ModerationQueue;
