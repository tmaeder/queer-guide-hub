import { useEffect, useState, useMemo } from 'react';
import { Link as RouterLink } from 'react-router';
import {
  Link2, CheckCircle, ArrowRight, RefreshCw,
  ExternalLink, MoreVertical, Pencil, Trash2, EyeOff, RotateCcw, Search,
  ShieldCheck, ShieldAlert, ShieldQuestion, Scan, Zap, Flag,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContentLinks, type ContentLink } from '@/hooks/useContentLinks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EditLinkDialog } from './EditLinkDialog';
import { ConfirmBulkActionDialog } from './ConfirmBulkActionDialog';
import { ScanResultDialog } from './ScanResultDialog';

const VERDICT_CHIP: Record<string, { color: 'success' | 'error' | 'warning' | 'default'; label: string }> = {
  benign: { color: 'success', label: 'Safe' },
  malicious: { color: 'error', label: 'Malicious' },
  suspicious: { color: 'warning', label: 'Suspicious' },
};

const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'default' | 'info'> = {
  OK: 'success',
  BROKEN: 'error',
  REDIRECT: 'warning',
  PENDING: 'default',
  BLOCKED: 'error',
  TIMEOUT: 'warning',
  DISMISSED: 'info',
  AUTO_REMOVED: 'default',
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

  // Pending broken_link flags from automation system
  const { data: autoFlagCount = 0 } = useQuery({
    queryKey: ['broken-link-flags-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('content_flags' as const)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('flag_type', 'broken_link');
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const [statusFilter, setStatusFilter] = useState('BROKEN');
  const [typeFilter, setTypeFilter] = useState('all');
  const [urlSearch, setUrlSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dialogs
  const [editLink, setEditLink] = useState<ContentLink | null>(null);
  const [bulkAction, setBulkAction] = useState<{ action: string; count: number } | null>(null);
  const [scanResultLink, setScanResultLink] = useState<ContentLink | null>(null);
  const [singleScanning, setSingleScanning] = useState(false);

  // Row action menu
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLink, setMenuLink] = useState<ContentLink | null>(null);

  useEffect(() => {
    fetchStats();
    fetchLinks({ status: 'BROKEN', limit: 200 });
  }, [fetchStats, fetchLinks]);

  // Clear selection when filters change
  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, typeFilter]);

  // Client-side URL filter
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
      // Refresh the dialog link data
      const { data } = await supabase.from('content_links').select('*').eq('id', scanResultLink.id).single();
      if (data) setScanResultLink(data as ContentLink);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Scan failed');
    } finally {
      setSingleScanning(false);
    }
  };

  // --- Selection helpers ---
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

  // --- Row actions ---
  const handleRowAction = async (action: string) => {
    if (!menuLink) return;
    setMenuAnchor(null);
    try {
      switch (action) {
        case 'edit':
          setEditLink(menuLink);
          break;
        case 'apply_redirect':
          await applyRedirect(menuLink);
          toast.success('Redirect applied');
          break;
        case 'recheck': {
          const recheckResult = await recheckLink(menuLink.id) as { results?: Array<{ status?: string; http_status?: number }> };
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
          await dismissLink(menuLink.id);
          toast.success('Link dismissed');
          break;
        case 'remove':
          setBulkAction({ action: 'remove', count: 1 });
          break;
        case 'scan':
          handleScanResult(menuLink);
          break;
        case 'view_scan':
          handleScanResult(menuLink);
          break;
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message :'Action failed');
    }
  };

  // --- Bulk actions ---
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
    <Box sx={embedded ? {} : { p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header — hidden when embedded as a tab */}
      {!embedded && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link2 style={{ width: 24, height: 24 }} />
            Link Health
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
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
          </Box>
        </Box>
      )}

      {/* Action buttons when embedded */}
      {embedded && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
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
        </Box>
      )}

      {/* Cross-navigation: Link Sanitizer + Automation flags — hidden when embedded */}
      {!embedded && (
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          component={RouterLink}
          to="/admin/automation"
          icon={<Zap style={{ width: 14, height: 14 }} />}
          label="Configure Link Sanitizer"
          variant="outlined"
          size="small"
          clickable
          sx={{ fontSize: '0.75rem' }}
        />
        {autoFlagCount > 0 && (
          <Chip
            component={RouterLink}
            to="/admin/review?tab=automation"
            icon={<Flag style={{ width: 14, height: 14 }} />}
            label={`${autoFlagCount} automation flag${autoFlagCount !== 1 ? 's' : ''} pending`}
            color="warning"
            size="small"
            clickable
            sx={{ fontSize: '0.75rem' }}
          />
        )}
      </Box>
      )}

      {/* Stats Cards */}
      {stats && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)', md: 'repeat(9, 1fr)' }, gap: 2, mb: 3 }}>
          {STAT_KEYS.map(key => (
            <Paper
              key={key}
              sx={{
                p: 2, textAlign: 'center',
                cursor: key !== 'total' ? 'pointer' : undefined,
                border: statusFilter === key.toUpperCase() ? 2 : 0,
                borderColor: 'primary.main',
              }}
              onClick={() => key !== 'total' && handleFilterChange(key.toUpperCase())}
            >
              <Typography
                variant="h4"
                fontWeight={700}
                color={
                  key === 'broken' || key === 'malicious' ? 'error.main'
                  : key === 'ok' ? 'success.main'
                  : key === 'dismissed' || key === 'auto_removed' ? 'info.main'
                  : key === 'suspicious' ? 'warning.main'
                  : 'text.primary'
                }
              >
                {stats[key]}
              </Typography>
              <Typography variant="caption" color="text.secondary" textTransform="capitalize">
                {key === 'auto_removed' ? 'Removed' : key}
              </Typography>
              {stats.total > 0 && key !== 'total' && (
                <LinearProgress
                  variant="determinate"
                  value={(stats[key] / stats.total) * 100}
                  color={key === 'broken' || key === 'malicious' ? 'error' : key === 'ok' ? 'success' : key === 'dismissed' || key === 'auto_removed' ? 'info' : 'warning'}
                  sx={{ mt: 1, borderRadius: 1 }}
                />
              )}
            </Paper>
          ))}
        </Box>
      )}

      {/* Filters + Search */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <TextField
          size="small"
          placeholder="Search URLs..."
          value={urlSearch}
          onChange={e => setUrlSearch(e.target.value)}
          sx={{ minWidth: 240 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search style={{ width: 16, height: 16, color: '#999' }} />
              </InputAdornment>
            ),
          }}
        />
        {urlSearch && (
          <Typography variant="caption" color="text.secondary">
            {filteredLinks.length} of {links.length} shown
          </Typography>
        )}
      </Box>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Paper sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', bgcolor: 'action.selected' }}>
          <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
            {selectedIds.size} selected
          </Typography>
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
        </Paper>
      )}

      {/* Links Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress  aria-label="Loading"/></Box>
      ) : filteredLinks.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {stats?.total === 0 ? 'No links synced yet. Click "Sync Links" to extract URLs from content.' : 'No links match the current filter.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Select-all header */}
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, gap: 1 }}>
            <Checkbox
              size="small"
              checked={selectedIds.size === filteredLinks.length && filteredLinks.length > 0}
              indeterminate={selectedIds.size > 0 && selectedIds.size < filteredLinks.length}
              onChange={toggleSelectAll}
            />
            <Typography variant="caption" color="text.secondary">
              {filteredLinks.length} link{filteredLinks.length !== 1 ? 's' : ''}
            </Typography>
          </Box>

          {filteredLinks.map(link => (
            <Paper
              key={link.id}
              sx={{
                p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
                bgcolor: selectedIds.has(link.id) ? 'action.selected' : undefined,
              }}
            >
              <Checkbox
                size="small"
                checked={selectedIds.has(link.id)}
                onChange={() => toggleSelect(link.id)}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={link.status === 'AUTO_REMOVED' ? 'Removed' : link.status} color={STATUS_COLORS[link.status] ?? 'default'} />
                  {link.status === 'BROKEN' && (link.check_count ?? 0) >= 1 && (link.check_count ?? 0) <= 3 && (
                    <Chip size="small" label={`Recheck ${link.check_count}/3`} variant="outlined" color="warning" sx={{ fontSize: '0.7rem' }} />
                  )}
                  {link.status === 'AUTO_REMOVED' && link.auto_removed_at && (
                    <Typography variant="caption" color="text.secondary">
                      Removed {new Date(link.auto_removed_at).toLocaleDateString()}
                    </Typography>
                  )}
                  {link.http_status && (
                    <Typography variant="caption" color="text.secondary">HTTP {link.http_status}</Typography>
                  )}
                  <Chip size="small" label={link.content_type} variant="outlined" />
                  <Chip size="small" label={link.field_name} variant="outlined" />
                  {link.is_social && <Chip size="small" label="Social" color="info" />}
                  {link.is_scraped_source && <Chip size="small" label="Scraped" color="secondary" />}
                  {link.scan_verdict ? (
                    <Chip
                      size="small"
                      label={VERDICT_CHIP[link.scan_verdict]?.label ?? link.scan_verdict}
                      color={VERDICT_CHIP[link.scan_verdict]?.color ?? 'default'}
                      icon={
                        link.scan_verdict === 'malicious' ? <ShieldAlert style={{ width: 14, height: 14 }} /> :
                        link.scan_verdict === 'suspicious' ? <ShieldQuestion style={{ width: 14, height: 14 }} /> :
                        <ShieldCheck style={{ width: 14, height: 14 }} />
                      }
                      onClick={(e) => { e.stopPropagation(); handleScanResult(link); }}
                      sx={{ cursor: 'pointer' }}
                    />
                  ) : link.scanned_at ? (
                    <Chip size="small" label="Scanned" color="default" variant="outlined"
                      onClick={(e) => { e.stopPropagation(); handleScanResult(link); }}
                      sx={{ cursor: 'pointer' }}
                    />
                  ) : null}
                </Box>
                <Typography variant="body2" noWrap title={link.original_url} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {link.original_url}
                </Typography>
                {link.final_url && link.final_url !== link.original_url && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {'→'} {link.final_url}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {link.last_checked_at ? new Date(link.last_checked_at).toLocaleDateString() : 'Never'}
              </Typography>
              <a href={link.original_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 16, height: 16, color: '#999' }} />
              </a>
              <IconButton
                size="small"
                onClick={e => { setMenuAnchor(e.currentTarget); setMenuLink(link); }}
              >
                <MoreVertical style={{ width: 16, height: 16 }} />
              </IconButton>
            </Paper>
          ))}
        </Box>
      )}

      {/* Row Action Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => { setMenuAnchor(null); setMenuLink(null); }}
      >
        <MenuItem onClick={() => handleRowAction('edit')}>
          <ListItemIcon><Pencil style={{ width: 16, height: 16 }} /></ListItemIcon>
          <ListItemText>Edit URL</ListItemText>
        </MenuItem>
        {menuLink?.status === 'REDIRECT' && menuLink.final_url && (
          <MenuItem onClick={() => handleRowAction('apply_redirect')}>
            <ListItemIcon><ArrowRight style={{ width: 16, height: 16 }} /></ListItemIcon>
            <ListItemText>Apply Redirect</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => handleRowAction('scan')}>
          <ListItemIcon><Scan style={{ width: 16, height: 16 }} /></ListItemIcon>
          <ListItemText>{menuLink?.scan_id ? 'View Scan' : 'Scan URL'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleRowAction('recheck')}>
          <ListItemIcon><RotateCcw style={{ width: 16, height: 16 }} /></ListItemIcon>
          <ListItemText>Re-check</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleRowAction('dismiss')}>
          <ListItemIcon><EyeOff style={{ width: 16, height: 16 }} /></ListItemIcon>
          <ListItemText>Dismiss</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleRowAction('remove')} sx={{ color: 'error.main' }}>
          <ListItemIcon><Trash2 style={{ width: 16, height: 16, color: 'inherit' }} /></ListItemIcon>
          <ListItemText>Remove</ListItemText>
        </MenuItem>
      </Menu>

      {/* Edit URL Dialog */}
      <EditLinkDialog
        open={!!editLink}
        link={editLink}
        onClose={() => setEditLink(null)}
        onSave={handleEditSave}
      />

      {/* Confirm Bulk Action Dialog */}
      <ConfirmBulkActionDialog
        open={!!bulkAction}
        action={bulkAction?.action ?? ''}
        count={bulkAction?.count ?? 0}
        onConfirm={executeBulkAction}
        onCancel={() => { setBulkAction(null); setMenuLink(null); }}
      />

      {/* Scan Result Dialog */}
      <ScanResultDialog
        open={!!scanResultLink}
        link={scanResultLink}
        onClose={() => setScanResultLink(null)}
        onRescan={handleRescan}
        scanning={singleScanning}
      />
    </Box>
  );
}

export default LinkHealthDashboard;
