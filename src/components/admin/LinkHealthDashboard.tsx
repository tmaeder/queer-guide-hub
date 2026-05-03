import { useEffect, useState, useMemo } from 'react';
import { Link as RouterLink } from 'react-router';
import {
  Link2, CheckCircle, ArrowRight, RefreshCw,
  ExternalLink, MoreVertical, Pencil, Trash2, EyeOff, RotateCcw, Search,
  ShieldCheck, ShieldAlert, ShieldQuestion, Scan, Zap, Flag, Loader2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useContentLinks, type ContentLink } from '@/hooks/useContentLinks';
import { supabase } from '@/integrations/supabase/client';
import { countRowsWhere, fetchById } from '@/hooks/usePageFetchers';
import { toast } from 'sonner';
import { EditLinkDialog } from './EditLinkDialog';
import { ConfirmBulkActionDialog } from './ConfirmBulkActionDialog';
import { ScanResultDialog } from './ScanResultDialog';

const VERDICT_BADGE: Record<string, { className: string; label: string }> = {
  benign: { className: 'bg-green-100 text-green-700 border-green-300', label: 'Safe' },
  malicious: { className: 'bg-red-100 text-red-700 border-red-300', label: 'Malicious' },
  suspicious: { className: 'bg-amber-100 text-amber-700 border-amber-300', label: 'Suspicious' },
};

const STATUS_BADGE: Record<string, string> = {
  OK: 'bg-green-100 text-green-700 border-green-300',
  BROKEN: 'bg-red-100 text-red-700 border-red-300',
  REDIRECT: 'bg-amber-100 text-amber-700 border-amber-300',
  PENDING: 'bg-muted text-muted-foreground',
  BLOCKED: 'bg-red-100 text-red-700 border-red-300',
  TIMEOUT: 'bg-amber-100 text-amber-700 border-amber-300',
  DISMISSED: 'bg-blue-100 text-blue-700 border-blue-300',
  AUTO_REMOVED: 'bg-muted text-muted-foreground',
};

const PROGRESS_COLOR: Record<string, string> = {
  broken: 'bg-red-500',
  malicious: 'bg-red-500',
  ok: 'bg-green-500',
  dismissed: 'bg-blue-500',
  auto_removed: 'bg-blue-500',
};

const CONTENT_TYPES = ['all', 'venues', 'events', 'hotels', 'festivals', 'news_articles', 'personalities'];

const STAT_KEYS = ['total', 'ok', 'broken', 'redirect', 'pending', 'timeout', 'dismissed', 'auto_removed', 'malicious', 'suspicious'] as const;

export function LinkHealthDashboard({ embedded }: { embedded?: boolean } = {}) {
  const {
    links, stats, loading, fetchLinks, fetchStats,
    deleteLink, deleteBulk, dismissLink, dismissBulk,
    recheckLink, recheckBulk, validateLinks, updateSourceUrl, applyRedirect, applyRedirectBulk,
    scanLink, scanBulk, scanBatch,
  } = useContentLinks();

  const { data: autoFlagCount = 0 } = useQuery({
    queryKey: ['broken-link-flags-count'],
    queryFn: () =>
      countRowsWhere('content_flags', [
        { col: 'status', val: 'pending' },
        { col: 'flag_type', val: 'broken_link' },
      ]),
    staleTime: 60_000,
  });

  const [statusFilter, setStatusFilter] = useState('BROKEN');
  const [typeFilter, setTypeFilter] = useState('all');
  const [urlSearch, setUrlSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editLink, setEditLink] = useState<ContentLink | null>(null);
  const [bulkAction, setBulkAction] = useState<{ action: string; count: number } | null>(null);
  const [scanResultLink, setScanResultLink] = useState<ContentLink | null>(null);
  const [singleScanning, setSingleScanning] = useState(false);

  const [menuLink, setMenuLink] = useState<ContentLink | null>(null);

  useEffect(() => {
    fetchStats();
    fetchLinks({ status: 'BROKEN', limit: 200 });
  }, [fetchStats, fetchLinks]);

  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, typeFilter]);

  const filteredLinks = useMemo(() => {
    if (!urlSearch.trim()) return links;
    const q = urlSearch.toLowerCase();
    return links.filter(l =>
      l.original_url.toLowerCase().includes(q) ||
      (l.final_url && l.final_url.toLowerCase().includes(q))
    );
  }, [links, urlSearch]);

  const handleFilterChange = (status: string) => {
    setStatusFilter(status);
    fetchLinks({
      status: status === 'all' ? undefined : status,
      content_type: typeFilter === 'all' ? undefined : typeFilter,
      limit: 200,
    });
  };

  const handleTypeChange = (type: string) => {
    setTypeFilter(type);
    fetchLinks({
      status: statusFilter === 'all' ? undefined : statusFilter,
      content_type: type === 'all' ? undefined : type,
      limit: 200,
    });
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke('sync-content-links', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (resp.error) throw resp.error;
      toast.success(`Synced: ${(resp.data as Record<string, unknown>)?.synced ?? 0} links extracted`);
      fetchStats();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const triggerValidation = async () => {
    setValidating(true);
    try {
      const d = await validateLinks(50);
      const parts = [`Checked ${d?.checked ?? 0} links`];
      if (d?.recovered) parts.push(`${d.recovered} recovered`);
      if (d?.still_broken) parts.push(`${d.still_broken} still broken`);
      if (d?.auto_removed) parts.push(`${d.auto_removed} auto-removed`);
      toast.success(parts.join(', '));
      fetchStats();
      fetchLinks({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 200 });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const triggerDeepScan = async () => {
    setScanning(true);
    try {
      const d = await scanBatch(10);
      toast.success(`Scanned ${d?.scanned ?? 0} links, ${d?.malicious ?? 0} malicious`);
      fetchStats();
      fetchLinks({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 200 });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Deep scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleScanResult = (link: ContentLink) => {
    setScanResultLink(link);
  };

  const handleRescan = async () => {
    if (!scanResultLink) return;
    setSingleScanning(true);
    try {
      await scanLink(scanResultLink.id);
      toast.success('Scan complete');
      const data = await fetchById<ContentLink>('content_links', scanResultLink.id);
      if (data) setScanResultLink(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Scan failed');
    } finally {
      setSingleScanning(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLinks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLinks.map(l => l.id)));
    }
  };

  const selectedLinks = useMemo(
    () => filteredLinks.filter(l => selectedIds.has(l.id)),
    [filteredLinks, selectedIds]
  );

  const allSelectedAreRedirects = selectedLinks.length > 0 && selectedLinks.every(l => l.status === 'REDIRECT' && l.final_url);

  const handleRowAction = async (action: string, link: ContentLink) => {
    setMenuLink(link);
    try {
      switch (action) {
        case 'edit':
          setEditLink(link);
          break;
        case 'apply_redirect':
          await applyRedirect(link);
          toast.success('Redirect applied');
          break;
        case 'recheck': {
          const recheckResult = await recheckLink(link.id) as { results?: Array<{ status?: string; http_status?: number }> };
          const linkResult = recheckResult?.results?.[0];
          if (linkResult?.status === 'OK') {
            toast.success(`Link is OK (HTTP ${linkResult.http_status ?? '200'})`);
          } else if (linkResult?.status === 'REDIRECT') {
            toast.success('Link redirects — check final URL');
          } else {
            toast.success(`Re-checked: ${linkResult?.status ?? 'done'}`);
          }
          fetchStats();
          break;
        }
        case 'dismiss':
          await dismissLink(link.id);
          toast.success('Link dismissed');
          break;
        case 'remove':
          setBulkAction({ action: 'remove', count: 1 });
          break;
        case 'scan':
        case 'view_scan':
          handleScanResult(link);
          break;
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Action failed');
    }
  };

  const executeBulkAction = async () => {
    if (!bulkAction) return;
    const ids = [...selectedIds];
    try {
      switch (bulkAction.action) {
        case 'remove':
          if (ids.length === 1 && menuLink) {
            await deleteLink(menuLink.id);
          } else {
            await deleteBulk(ids);
          }
          toast.success(`Removed ${bulkAction.count} link(s)`);
          break;
        case 'dismiss':
          await dismissBulk(ids);
          toast.success(`Dismissed ${ids.length} link(s)`);
          break;
        case 'recheck':
          await recheckBulk(ids);
          toast.success(`Queued ${ids.length} link(s) for re-check`);
          break;
        case 'apply_redirects':
          await applyRedirectBulk(selectedLinks.filter(l => l.status === 'REDIRECT' && l.final_url));
          toast.success(`Applied ${ids.length} redirect(s)`);
          break;
        case 'scan':
          setScanning(true);
          try {
            const d = await scanBulk(ids);
            toast.success(`Scanned ${d?.scanned ?? 0} links, ${d?.malicious ?? 0} malicious`);
          } finally {
            setScanning(false);
          }
          break;
      }
      setSelectedIds(new Set());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Bulk action failed');
    } finally {
      setBulkAction(null);
      setMenuLink(null);
    }
  };

  const handleEditSave = async (newUrl: string) => {
    if (!editLink) return;
    await updateSourceUrl(editLink, newUrl);
    toast.success('URL updated');
  };

  return (
    <div className={embedded ? '' : 'p-3 max-w-[1200px] mx-auto'}>
      {/* Header */}
      {!embedded && (
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h5 className="text-2xl flex items-center gap-1">
            <Link2 className="w-6 h-6" />
            Link Health
          </h5>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={triggerSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Links'}
            </Button>
            <Button variant="outline" size="sm" onClick={triggerValidation} disabled={validating}>
              <CheckCircle className={`w-4 h-4 mr-1 ${validating ? 'animate-spin' : ''}`} />
              {validating ? 'Checking...' : 'Validate Now'}
            </Button>
            <Button variant="outline" size="sm" onClick={triggerDeepScan} disabled={scanning}>
              <Scan className={`w-4 h-4 mr-1 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Deep Scan'}
            </Button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex gap-1 mb-2">
          <Button variant="outline" size="sm" onClick={triggerSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Links'}
          </Button>
          <Button variant="outline" size="sm" onClick={triggerValidation} disabled={validating}>
            <CheckCircle className={`w-4 h-4 mr-1 ${validating ? 'animate-spin' : ''}`} />
            {validating ? 'Checking...' : 'Validate Now'}
          </Button>
          <Button variant="outline" size="sm" onClick={triggerDeepScan} disabled={scanning}>
            <Scan className={`w-4 h-4 mr-1 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Deep Scan'}
          </Button>
        </div>
      )}

      {/* Cross-navigation */}
      {!embedded && (
        <div className="flex gap-1.5 mb-2 flex-wrap items-center">
          <Button asChild variant="outline" size="sm" className="text-xs h-7">
            <RouterLink to="/admin/automation">
              <Zap className="w-3.5 h-3.5 mr-1" />
              Configure Link Sanitizer
            </RouterLink>
          </Button>
          {autoFlagCount > 0 && (
            <Button asChild variant="outline" size="sm" className="text-xs h-7 bg-amber-100 text-amber-800 border-amber-300">
              <RouterLink to="/admin/review?tab=automation">
                <Flag className="w-3.5 h-3.5 mr-1" />
                {`${autoFlagCount} automation flag${autoFlagCount !== 1 ? 's' : ''} pending`}
              </RouterLink>
            </Button>
          )}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 mb-3">
          {STAT_KEYS.map(key => {
            const isActive = statusFilter === key.toUpperCase();
            const colorClass =
              key === 'broken' || key === 'malicious' ? 'text-destructive'
              : key === 'ok' ? 'text-green-600'
              : key === 'dismissed' || key === 'auto_removed' ? 'text-blue-600'
              : key === 'suspicious' ? 'text-amber-600'
              : 'text-foreground';
            return (
              <div
                key={key}
                className={`p-2 text-center rounded-md border bg-card ${key !== 'total' ? 'cursor-pointer' : ''} ${isActive ? 'border-2 border-primary' : ''}`}
                onClick={() => key !== 'total' && handleFilterChange(key.toUpperCase())}
              >
                <div className={`text-3xl font-bold ${colorClass}`}>{stats[key]}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {key === 'auto_removed' ? 'Removed' : key}
                </div>
                {stats.total > 0 && key !== 'total' && (
                  <div className="mt-1 h-1 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded ${PROGRESS_COLOR[key] || 'bg-amber-500'}`}
                      style={{ width: `${(stats[key] / stats.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <Select value={statusFilter} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="BROKEN">Broken</SelectItem>
            <SelectItem value="REDIRECT">Redirect</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="BLOCKED">Blocked</SelectItem>
            <SelectItem value="TIMEOUT">Timeout</SelectItem>
            <SelectItem value="DISMISSED">Dismissed</SelectItem>
            <SelectItem value="AUTO_REMOVED">Auto-Removed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Content Type" /></SelectTrigger>
          <SelectContent>
            {CONTENT_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t === 'all' ? 'All Types' : t.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[240px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search URLs..."
            value={urlSearch}
            onChange={e => setUrlSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        {urlSearch && (
          <span className="text-xs text-muted-foreground">
            {filteredLinks.length} of {links.length} shown
          </span>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="p-1.5 mb-2 flex items-center gap-1 flex-wrap rounded-md border bg-muted">
          <span className="text-sm font-semibold mr-1">{selectedIds.size} selected</span>
          <Button
            variant="outline" size="sm"
            onClick={() => setBulkAction({ action: 'dismiss', count: selectedIds.size })}
          >
            <EyeOff className="w-4 h-4 mr-1" /> Dismiss
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setBulkAction({ action: 'recheck', count: selectedIds.size })}
          >
            <RotateCcw className="w-4 h-4 mr-1" /> Re-check
          </Button>
          {allSelectedAreRedirects && (
            <Button
              variant="outline" size="sm"
              onClick={() => setBulkAction({ action: 'apply_redirects', count: selectedIds.size })}
            >
              <ArrowRight className="w-4 h-4 mr-1" /> Apply Redirects
            </Button>
          )}
          <Button
            variant="outline" size="sm"
            onClick={() => setBulkAction({ action: 'scan', count: selectedIds.size })}
            disabled={scanning}
          >
            <Scan className="w-4 h-4 mr-1" /> {scanning ? 'Scanning...' : 'Scan'}
          </Button>
          <Button
            variant="destructive" size="sm"
            onClick={() => setBulkAction({ action: 'remove', count: selectedIds.size })}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Remove
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Links Table */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" /></div>
      ) : filteredLinks.length === 0 ? (
        <div className="p-4 text-center rounded-md border bg-card">
          <p className="text-muted-foreground">
            {stats?.total === 0 ? 'No links synced yet. Click "Sync Links" to extract URLs from content.' : 'No links match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center px-1 gap-1">
            <Checkbox
              checked={selectedIds.size === filteredLinks.length && filteredLinks.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-xs text-muted-foreground">
              {filteredLinks.length} link{filteredLinks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredLinks.map(link => (
            <div
              key={link.id}
              className={`p-1.5 flex items-center gap-1.5 rounded-md border bg-card ${selectedIds.has(link.id) ? 'bg-muted' : ''}`}
            >
              <Checkbox
                checked={selectedIds.has(link.id)}
                onCheckedChange={() => toggleSelect(link.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                  <Badge className={STATUS_BADGE[link.status] ?? ''}>
                    {link.status === 'AUTO_REMOVED' ? 'Removed' : link.status}
                  </Badge>
                  {link.status === 'BROKEN' && (link.check_count ?? 0) >= 1 && (link.check_count ?? 0) <= 3 && (
                    <Badge variant="outline" className="text-[0.7rem] bg-amber-50 text-amber-700 border-amber-300">
                      Recheck {link.check_count}/3
                    </Badge>
                  )}
                  {link.status === 'AUTO_REMOVED' && link.auto_removed_at && (
                    <span className="text-xs text-muted-foreground">
                      Removed {new Date(link.auto_removed_at).toLocaleDateString()}
                    </span>
                  )}
                  {link.http_status && (
                    <span className="text-xs text-muted-foreground">HTTP {link.http_status}</span>
                  )}
                  <Badge variant="outline">{link.content_type}</Badge>
                  <Badge variant="outline">{link.field_name}</Badge>
                  {link.is_social && <Badge className="bg-blue-100 text-blue-700 border-blue-300">Social</Badge>}
                  {link.is_scraped_source && <Badge variant="secondary">Scraped</Badge>}
                  {link.scan_verdict ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleScanResult(link); }}
                      className="cursor-pointer"
                    >
                      <Badge className={VERDICT_BADGE[link.scan_verdict]?.className ?? ''}>
                        {link.scan_verdict === 'malicious' ? <ShieldAlert className="w-3.5 h-3.5 mr-1" /> :
                         link.scan_verdict === 'suspicious' ? <ShieldQuestion className="w-3.5 h-3.5 mr-1" /> :
                         <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                        {VERDICT_BADGE[link.scan_verdict]?.label ?? link.scan_verdict}
                      </Badge>
                    </button>
                  ) : link.scanned_at ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleScanResult(link); }}
                      className="cursor-pointer"
                    >
                      <Badge variant="outline">Scanned</Badge>
                    </button>
                  ) : null}
                </div>
                <p className="text-sm font-mono text-[0.8rem] truncate" title={link.original_url}>
                  {link.original_url}
                </p>
                {link.final_url && link.final_url !== link.original_url && (
                  <span className="text-xs text-muted-foreground truncate block">
                    {'→'} {link.final_url}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {link.last_checked_at ? new Date(link.last_checked_at).toLocaleDateString() : 'Never'}
              </span>
              <a href={link.original_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => setMenuLink(link)}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleRowAction('edit', link)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit URL
                  </DropdownMenuItem>
                  {link.status === 'REDIRECT' && link.final_url && (
                    <DropdownMenuItem onClick={() => handleRowAction('apply_redirect', link)}>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Apply Redirect
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => handleRowAction('scan', link)}>
                    <Scan className="w-4 h-4 mr-2" />
                    {link.scan_id ? 'View Scan' : 'Scan URL'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRowAction('recheck', link)}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Re-check
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRowAction('dismiss', link)}>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Dismiss
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRowAction('remove', link)} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <EditLinkDialog
        open={!!editLink}
        link={editLink}
        onClose={() => setEditLink(null)}
        onSave={handleEditSave}
      />

      <ConfirmBulkActionDialog
        open={!!bulkAction}
        action={bulkAction?.action ?? ''}
        count={bulkAction?.count ?? 0}
        onConfirm={executeBulkAction}
        onCancel={() => { setBulkAction(null); setMenuLink(null); }}
      />

      <ScanResultDialog
        open={!!scanResultLink}
        link={scanResultLink}
        onClose={() => setScanResultLink(null)}
        onRescan={handleRescan}
        scanning={singleScanning}
      />
    </div>
  );
}

export default LinkHealthDashboard;
